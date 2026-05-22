import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { fetchCurrentSeasonGames, type CurrentSeasonGameRow, type PeriodScore } from "../lib/current-season";

loadEnv();

const prisma = new PrismaClient();
const MLB_API = "https://statsapi.mlb.com/api/v1";
const NBA_SCHEDULE_URL = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json";
const NBA_HEADERS = {
  Accept: "application/json, text/plain, */*",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
};

type League = "NBA" | "MLB";

async function main() {
  const options = parseArgs();
  const leagues: League[] = options.league ? [options.league] : ["NBA", "MLB"];
  for (const league of leagues) {
    const season = league === "NBA" ? currentNbaSeason() : currentMlbSeason();
    const seasonType = league === "NBA" && isNbaPlayoffWindow() ? "Playoffs" : "Regular Season";
    console.log(`Sync ${league} ${season} ${seasonType}, last ${options.days} day(s)`);

    const games =
      league === "NBA"
        ? await fetchNbaRecentGamesFromSchedule(season, seasonType, options.days)
        : filterRecentGames(await fetchCurrentSeasonGames({ league, season, seasonType }), options.days);
    console.log(`Fetched ${games.length} ${league} game row(s)`);
    const savedGames = await upsertGames(games);
    console.log(`Saved ${savedGames.length} ${league} game row(s)`);
    const playerStats = league === "MLB" ? await syncMlbPlayerStats(savedGames, season) : await syncNbaPlayerStats(savedGames, season, seasonType);
    console.log(`Saved ${playerStats} ${league} player stat row(s)`);

    await prisma.sourceSync.upsert({
      where: { league_source_entity: { league, source: sourceName(league), entity: "daily-sync" } },
      update: {
        status: "OK",
        message: `synced ${savedGames.length} games and ${playerStats} player stat rows`,
        fetchedAt: new Date()
      },
      create: {
        league,
        source: sourceName(league),
        entity: "daily-sync",
        status: "OK",
        message: `synced ${savedGames.length} games and ${playerStats} player stat rows`,
        fetchedAt: new Date()
      }
    });
  }
}

function parseArgs() {
  const leagueArg = argValue("--league")?.toUpperCase();
  const days = Number(argValue("--days") ?? "7");
  return {
    league: leagueArg === "NBA" || leagueArg === "MLB" ? (leagueArg as League) : null,
    days: Number.isFinite(days) && days > 0 ? days : 7
  };
}

function argValue(name: string) {
  const prefix = `${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function filterRecentGames(rows: CurrentSeasonGameRow[], days: number) {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return rows.filter((row) => new Date(row.gameDate) >= cutoff);
}

async function upsertGames(rows: CurrentSeasonGameRow[]) {
  const saved = [];
  for (const row of rows) {
    const [homeTeam, awayTeam] = await Promise.all([
      findTeam(row.league, row.homeTeam),
      findTeam(row.league, row.awayTeam)
    ]);
    if (!homeTeam || !awayTeam) continue;

    const game = await prisma.game.upsert({
      where: { league_externalGameId: { league: row.league, externalGameId: row.externalGameId } },
      update: {
        season: row.season,
        seasonType: row.seasonType,
        gameDate: new Date(row.gameDate),
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        homeScoreFinal: row.homeScoreFinal,
        awayScoreFinal: row.awayScoreFinal,
        homeScoreRegulation: row.homeScoreRegulation,
        awayScoreRegulation: row.awayScoreRegulation,
        wentOvertime: Boolean(row.wentOvertime),
        status: row.status,
        rawJson: JSON.stringify(row)
      },
      create: {
        league: row.league,
        externalGameId: row.externalGameId,
        season: row.season,
        seasonType: row.seasonType,
        gameDate: new Date(row.gameDate),
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        homeScoreFinal: row.homeScoreFinal,
        awayScoreFinal: row.awayScoreFinal,
        homeScoreRegulation: row.homeScoreRegulation,
        awayScoreRegulation: row.awayScoreRegulation,
        wentOvertime: Boolean(row.wentOvertime),
        status: row.status,
        rawJson: JSON.stringify(row)
      }
    });

    await prisma.gamePeriodScore.deleteMany({ where: { gameId: game.id } });
    for (const period of parsePeriods(row.periodScoresJson)) {
      if (period.away !== null) {
        await createPeriodScore(game.id, awayTeam.id, period, period.away);
      }
      if (period.home !== null) {
        await createPeriodScore(game.id, homeTeam.id, period, period.home);
      }
    }
    saved.push({ ...game, homeTeam, awayTeam });
  }
  return saved;
}

async function createPeriodScore(gameId: number, teamId: number, period: PeriodScore, runsOrPoints: number) {
  await prisma.gamePeriodScore.create({
    data: {
      gameId,
      teamId,
      periodNumber: period.periodNumber,
      periodType: period.periodType,
      runsOrPoints,
      isOvertimeOrExtra: period.isOvertimeOrExtra
    }
  });
}

async function syncMlbPlayerStats(games: Awaited<ReturnType<typeof upsertGames>>, season: string) {
  let count = 0;
  for (const game of games) {
    const response = await fetch(`${MLB_API}/game/${game.externalGameId}/boxscore`);
    if (!response.ok) continue;
    const payload = await response.json();
    const teamEntries = [
      { side: "away", teamId: game.awayTeamId, players: payload.teams?.away?.players ?? {} },
      { side: "home", teamId: game.homeTeamId, players: payload.teams?.home?.players ?? {} }
    ];

    for (const entry of teamEntries) {
      for (const playerBox of Object.values(entry.players) as any[]) {
        const person = playerBox.person;
        if (!person?.id) continue;
        const stats = playerBox.stats ?? {};
        const batting = stats.batting ?? {};
        const pitching = stats.pitching ?? {};
        const hasBatting = Number(batting.atBats ?? 0) > 0 || Number(batting.plateAppearances ?? 0) > 0;
        const hasPitching = pitching.inningsPitched !== undefined;
        if (!hasBatting && !hasPitching) continue;

        const player = await upsertPlayer("MLB", String(person.id), person.fullName, entry.teamId, playerBox.position?.abbreviation);
        await prisma.playerGameStat.upsert({
          where: { gameId_playerId: { gameId: game.id, playerId: player.id } },
          update: mlbStatData(entry.teamId, batting, pitching, playerBox),
          create: {
            league: "MLB",
            gameId: game.id,
            playerId: player.id,
            ...mlbStatData(entry.teamId, batting, pitching, playerBox)
          }
        });
        count += 1;
      }
    }
  }
  await writeSyncStatus("MLB", "players", `synced ${count} MLB player game rows for ${season}`);
  return count;
}

async function syncNbaPlayerStats(games: Awaited<ReturnType<typeof upsertGames>>, season: string, seasonType: string) {
  const rows = await fetchNbaPlayerGameLogs(season, seasonType).catch((error) => {
    console.warn(`NBA player stats unavailable: ${error instanceof Error ? error.message : "unknown error"}`);
    return [];
  });
  const gamesByExternalId = new Map(games.map((game) => [game.externalGameId, game]));
  let count = 0;

  for (const row of rows) {
    const game = gamesByExternalId.get(String(row.GAME_ID ?? ""));
    if (!game) continue;
    const team = await findTeam("NBA", String(row.TEAM_ABBREVIATION ?? row.TEAM_NAME ?? ""));
    if (!team) continue;

    const player = await upsertPlayer("NBA", String(row.PLAYER_ID), String(row.PLAYER_NAME), team.id, null);
    await prisma.playerGameStat.upsert({
      where: { gameId_playerId: { gameId: game.id, playerId: player.id } },
      update: nbaStatData(team.id, row),
      create: {
        league: "NBA",
        gameId: game.id,
        playerId: player.id,
        ...nbaStatData(team.id, row)
      }
    });
    count += 1;
  }

  await writeSyncStatus("NBA", "players", `synced ${count} NBA player game rows for ${season} ${seasonType}`);
  return count;
}

async function fetchNbaPlayerGameLogs(season: string, seasonType: string) {
  const url = new URL("https://stats.nba.com/stats/leaguegamelog");
  url.searchParams.set("Counter", "0");
  url.searchParams.set("DateFrom", "");
  url.searchParams.set("DateTo", "");
  url.searchParams.set("Direction", "ASC");
  url.searchParams.set("LeagueID", "00");
  url.searchParams.set("PlayerOrTeam", "P");
  url.searchParams.set("Season", season);
  url.searchParams.set("SeasonType", seasonType);
  url.searchParams.set("Sorter", "DATE");

  const response = await fetchWithTimeout(url.toString(), { headers: NBA_HEADERS }, 20000);
  if (!response.ok) return [];
  const payload = await response.json();
  const resultSet = payload.resultSets?.[0];
  const headers: string[] = resultSet?.headers ?? [];
  return (resultSet?.rowSet ?? []).map((row: any[]) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

async function fetchNbaRecentGamesFromSchedule(season: string, seasonType: string, days: number): Promise<CurrentSeasonGameRow[]> {
  const response = await fetchWithTimeout(NBA_SCHEDULE_URL, { headers: NBA_HEADERS }, 20000);
  if (!response.ok) return [];
  const payload = await response.json();
  const fetchedAt = new Date().toISOString();
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const games = (payload.leagueSchedule?.gameDates ?? []).flatMap((date: any) => date.games ?? []);

  return games
    .filter((game: any) => Number(game.gameStatus) === 3)
    .filter((game: any) => Date.parse(game.gameDateTimeUTC ?? game.gameDateUTC ?? "") >= cutoff.getTime())
    .filter((game: any) => nbaSeasonTypeFromGameId(game.gameId) === seasonType)
    .map((game: any) => ({
      league: "NBA",
      season,
      seasonType,
      externalGameId: String(game.gameId),
      gameDate: String(game.gameDateTimeUTC ?? game.gameDateUTC ?? ""),
      awayTeam: nbaScheduleTeamName(game.awayTeam),
      homeTeam: nbaScheduleTeamName(game.homeTeam),
      awayScoreFinal: intOrNull(game.awayTeam?.score),
      homeScoreFinal: intOrNull(game.homeTeam?.score),
      awayScoreRegulation: intOrNull(game.awayTeam?.score),
      homeScoreRegulation: intOrNull(game.homeTeam?.score),
      awayQ1: null,
      awayQ2: null,
      awayQ3: null,
      awayQ4: null,
      homeQ1: null,
      homeQ2: null,
      homeQ3: null,
      homeQ4: null,
      awayInnings1To9: "",
      homeInnings1To9: "",
      wentOvertime: null,
      periodScoresJson: "[]",
      status: "FINAL",
      fetchedAt,
      dataSource: "NBA.com CDN scheduleLeagueV2",
      note: "CDN schedule score only; period scoring unavailable"
    }));
}

function mlbStatData(teamId: number, batting: any, pitching: any, raw: any) {
  return {
    teamId,
    atBats: intOrNull(batting.atBats),
    runs: intOrNull(batting.runs),
    hits: intOrNull(batting.hits),
    homeRuns: intOrNull(batting.homeRuns),
    rbi: intOrNull(batting.rbi),
    walks: intOrNull(batting.baseOnBalls),
    strikeouts: intOrNull(batting.strikeOuts),
    inningsPitched: inningsToFloat(pitching.inningsPitched),
    earnedRuns: intOrNull(pitching.earnedRuns),
    era: floatOrNull(pitching.era),
    whip: floatOrNull(pitching.whip),
    rawJson: JSON.stringify(raw)
  };
}

function nbaStatData(teamId: number, row: any) {
  return {
    teamId,
    minutes: minutesToFloat(row.MIN),
    points: intOrNull(row.PTS),
    rebounds: intOrNull(row.REB),
    assists: intOrNull(row.AST),
    steals: intOrNull(row.STL),
    blocks: intOrNull(row.BLK),
    turnovers: intOrNull(row.TOV),
    fgPct: floatOrNull(row.FG_PCT),
    threePtPct: floatOrNull(row.FG3_PCT),
    ftPct: floatOrNull(row.FT_PCT),
    plusMinus: floatOrNull(row.PLUS_MINUS),
    rawJson: JSON.stringify(row)
  };
}

async function upsertPlayer(league: League, externalId: string, name: string, teamId: number, position: string | null | undefined) {
  return prisma.player.upsert({
    where: { league_externalId: { league, externalId } },
    update: { name, teamId, position: position ?? undefined },
    create: { league, externalId, name, teamId, position: position ?? null }
  });
}

async function findTeam(league: League, nameOrAbbreviation: string) {
  return prisma.team.findFirst({
    where: {
      league,
      OR: [{ name: nameOrAbbreviation }, { abbreviation: nameOrAbbreviation }]
    }
  });
}

async function writeSyncStatus(league: League, entity: string, message: string) {
  await prisma.sourceSync.upsert({
    where: { league_source_entity: { league, source: sourceName(league), entity } },
    update: { status: "OK", message, fetchedAt: new Date() },
    create: { league, source: sourceName(league), entity, status: "OK", message, fetchedAt: new Date() }
  });
}

function parsePeriods(value: string): PeriodScore[] {
  try {
    return JSON.parse(value) as PeriodScore[];
  } catch {
    return [];
  }
}

function sourceName(league: League) {
  return league === "NBA" ? "NBA.com Stats API" : "MLB StatsAPI";
}

function nbaSeasonTypeFromGameId(gameId: unknown) {
  return String(gameId ?? "").startsWith("004") ? "Playoffs" : "Regular Season";
}

function nbaScheduleTeamName(team: any) {
  return [team?.teamCity, team?.teamName].filter(Boolean).join(" ");
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function currentMlbSeason() {
  return String(new Date().getUTCFullYear());
}

function currentNbaSeason() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const start = month >= 10 ? year : year - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

function isNbaPlayoffWindow() {
  const month = new Date().getUTCMonth() + 1;
  return month >= 4 && month <= 6;
}

function intOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function floatOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function inningsToFloat(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const [whole, outs = "0"] = String(value).split(".");
  return Number(whole) + Number(outs) / 3;
}

function minutesToFloat(value: unknown) {
  if (typeof value !== "string") return floatOrNull(value);
  const [minutes, seconds = "0"] = value.split(":");
  return Number(minutes) + Number(seconds) / 60;
}

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const text = readFileSync(file, "utf8");
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^([^#=\s]+)=["']?(.+?)["']?$/);
        if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
      }
    } catch {
      // Optional env file.
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Daily sync completed.");
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
