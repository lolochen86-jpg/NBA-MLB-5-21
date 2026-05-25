import { fetchCurrentSeasonGames } from "@/lib/current-season";
import { prisma } from "@/lib/prisma";

type GameWithTeams = Awaited<ReturnType<typeof fetchTeamGames>>[number];
type NbaLogRow = Record<string, string | number | null>;

const NBA_HEADERS = {
  Accept: "application/json, text/plain, */*",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
};
const currentSeasonCache = new Map<string, ReturnType<typeof fetchCurrentSeasonGames>>();

export type TeamSummary = {
  teamId: number;
  team: string;
  games: number;
  averageScored: number | null;
  averageAllowed: number | null;
  averageMargin: number | null;
  highestScored: number | null;
  lowestScored: number | null;
  wins: number;
  losses: number;
  homeAverageScored: number | null;
  awayAverageScored: number | null;
  streak: string | null;
  includeOvertime: boolean;
  lastUpdatedAt: string | null;
  unavailableReason?: string;
};

export type GameLog = {
  gameId: number | string;
  date: string;
  team: string;
  opponent: string;
  homeAway: "HOME" | "AWAY";
  scored: number;
  allowed: number;
  margin: number;
  result: "W" | "L";
  wentOvertime: boolean;
  missingPeriodScoring: boolean;
  source: string;
};

export async function getMatchupSummary(input: {
  league: string;
  homeTeamId: number;
  awayTeamId: number;
  season: string;
  seasonType: string;
  rangeType: "games" | "days";
  rangeValue: number;
  includeOvertime: boolean;
  splitHomeAway: boolean;
}) {
  const [home, away, sync] = await Promise.all([
    prisma.team.findUnique({ where: { id: input.homeTeamId } }),
    prisma.team.findUnique({ where: { id: input.awayTeamId } }),
    prisma.sourceSync.findMany({
      where: { league: input.league },
      orderBy: { fetchedAt: "desc" },
      take: 5
    })
  ]);

  if (!home || !away) throw new Error("找不到球隊資料");

  const [homeSummary, awaySummary] = await Promise.all([
    summarizeTeam(input, input.homeTeamId),
    summarizeTeam(input, input.awayTeamId)
  ]);

  return {
    dataSource: input.league === "NBA" ? "NBA.com Stats API / Supabase cache" : "MLB StatsAPI / Supabase cache",
    sourceStatus: sync.length ? sync : "請先同步資料",
    homeTeamSummary: homeSummary,
    awayTeamSummary: awaySummary,
    comparison: {
      averageScoredDiff: diff(homeSummary.averageScored, awaySummary.averageScored),
      averageAllowedDiff: diff(homeSummary.averageAllowed, awaySummary.averageAllowed),
      averageMarginDiff: diff(homeSummary.averageMargin, awaySummary.averageMargin)
    },
    gameLogs: [...homeSummary.logs, ...awaySummary.logs]
  };
}

async function summarizeTeam(
  input: {
    league: string;
    season: string;
    seasonType: string;
    rangeType: "games" | "days";
    rangeValue: number;
    includeOvertime: boolean;
    splitHomeAway: boolean;
  },
  teamId: number
): Promise<TeamSummary & { logs: GameLog[] }> {
  const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId } });
  const dbGames = await fetchTeamGames(input, teamId);
  const logs = dbGames.length
    ? buildLogsFromDbGames(dbGames, teamId, input.includeOvertime)
    : await buildLogsFromCurrentSeason(input, team);

  const missingRegulation = logs.some((log) => log.missingPeriodScoring);
  if (!input.includeOvertime && missingRegulation) {
    return {
      ...emptySummary(teamId, team.name, input.includeOvertime),
      unavailableReason: "此場缺少分節資料，無法計算不含延長賽"
    };
  }

  if (!logs.length) {
    return {
      ...emptySummary(teamId, team.name, input.includeOvertime),
      unavailableReason: "請先同步資料"
    };
  }

  return summarizeLogs(teamId, team.name, input.includeOvertime, logs);
}

async function fetchTeamGames(
  input: {
    league: string;
    season: string;
    seasonType: string;
    rangeType: "games" | "days";
    rangeValue: number;
    splitHomeAway: boolean;
  },
  teamId: number
) {
  const dateFilter =
    input.rangeType === "days"
      ? {
          gameDate: {
            gte: new Date(Date.now() - input.rangeValue * 24 * 60 * 60 * 1000),
            lte: new Date()
          }
        }
      : {};

  return prisma.game.findMany({
    where: {
      league: input.league,
      season: input.season,
      seasonType: input.seasonType,
      status: "FINAL",
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      ...dateFilter
    },
    orderBy: { gameDate: "desc" },
    take: input.rangeType === "games" ? input.rangeValue : undefined,
    include: { homeTeam: true, awayTeam: true, periodScores: true }
  });
}

function buildLogsFromDbGames(games: GameWithTeams[], teamId: number, includeOvertime: boolean) {
  return games
    .filter((game) => includeOvertime || hasRequiredRegulationScores(game))
    .map((game) => toDbGameLog(game, teamId, includeOvertime));
}

async function buildLogsFromCurrentSeason(
  input: {
    league: string;
    season: string;
    seasonType: string;
    rangeType: "games" | "days";
    rangeValue: number;
    includeOvertime: boolean;
  },
  team: { name: string; abbreviation: string }
) {
  if (input.league.toUpperCase() === "NBA") {
    return buildNbaLogsFromLeagueGameLog(input, team);
  }

  const allGames = await fetchCachedCurrentSeasonGames({
    league: input.league,
    season: input.season,
    seasonType: input.seasonType
  });
  const cutoff = new Date(Date.now() - input.rangeValue * 24 * 60 * 60 * 1000);
  return allGames
    .filter((game) => game.awayTeam === team.name || game.homeTeam === team.name)
    .filter((game) => input.rangeType === "games" || new Date(game.gameDate) >= cutoff)
    .sort((a, b) => Date.parse(b.gameDate) - Date.parse(a.gameDate))
    .slice(0, input.rangeType === "games" ? input.rangeValue : undefined)
    .map((game) => {
      const isHome = game.homeTeam === team.name;
      const scored = input.includeOvertime
        ? isHome
          ? game.homeScoreFinal
          : game.awayScoreFinal
        : isHome
          ? game.homeScoreRegulation
          : game.awayScoreRegulation;
      const allowed = input.includeOvertime
        ? isHome
          ? game.awayScoreFinal
          : game.homeScoreFinal
        : isHome
          ? game.awayScoreRegulation
          : game.homeScoreRegulation;
      const missingPeriodScoring = scored === null || allowed === null;

      return {
        gameId: game.externalGameId,
        date: game.gameDate,
        team: isHome ? game.homeTeam : game.awayTeam,
        opponent: isHome ? game.awayTeam : game.homeTeam,
        homeAway: isHome ? "HOME" : "AWAY",
        scored: scored ?? 0,
        allowed: allowed ?? 0,
        margin: (scored ?? 0) - (allowed ?? 0),
        result: (scored ?? 0) > (allowed ?? 0) ? "W" : "L",
        wentOvertime: Boolean(game.wentOvertime),
        missingPeriodScoring,
        source: game.dataSource
      } satisfies GameLog;
    });
}

function fetchCachedCurrentSeasonGames(input: { league: string; season: string; seasonType: string }) {
  const key = `${input.league}:${input.season}:${input.seasonType}`;
  const cached = currentSeasonCache.get(key);
  if (cached) return cached;
  const promise = fetchCurrentSeasonGames(input);
  currentSeasonCache.set(key, promise);
  return promise;
}

async function buildNbaLogsFromLeagueGameLog(
  input: {
    season: string;
    seasonType: string;
    rangeType: "games" | "days";
    rangeValue: number;
    includeOvertime: boolean;
  },
  team: { name: string; abbreviation: string }
) {
  const rows = await fetchNbaLeagueGameLog(input.season, input.seasonType);
  const grouped = groupNbaRows(rows);
  const cutoff = new Date(Date.now() - input.rangeValue * 24 * 60 * 60 * 1000);

  return grouped
    .filter((game) => game.homeTeam === team.name || game.awayTeam === team.name || game.homeAbbreviation === team.abbreviation || game.awayAbbreviation === team.abbreviation)
    .filter((game) => input.rangeType === "games" || new Date(game.gameDate) >= cutoff)
    .sort((a, b) => Date.parse(b.gameDate) - Date.parse(a.gameDate))
    .slice(0, input.rangeType === "games" ? input.rangeValue : undefined)
    .map((game) => {
      const isHome = game.homeTeam === team.name || game.homeAbbreviation === team.abbreviation;
      const scored = isHome ? game.homeScoreFinal : game.awayScoreFinal;
      const allowed = isHome ? game.awayScoreFinal : game.homeScoreFinal;

      return {
        gameId: game.externalGameId,
        date: game.gameDate,
        team: isHome ? game.homeTeam : game.awayTeam,
        opponent: isHome ? game.awayTeam : game.homeTeam,
        homeAway: isHome ? "HOME" : "AWAY",
        scored: scored ?? 0,
        allowed: allowed ?? 0,
        margin: (scored ?? 0) - (allowed ?? 0),
        result: (scored ?? 0) > (allowed ?? 0) ? "W" : "L",
        wentOvertime: false,
        missingPeriodScoring: !input.includeOvertime,
        source: "NBA.com Stats API leaguegamelog"
      } satisfies GameLog;
    });
}

async function fetchNbaLeagueGameLog(season: string, seasonType: string): Promise<NbaLogRow[]> {
  const url = new URL("https://stats.nba.com/stats/leaguegamelog");
  url.searchParams.set("Counter", "0");
  url.searchParams.set("DateFrom", "");
  url.searchParams.set("DateTo", "");
  url.searchParams.set("Direction", "ASC");
  url.searchParams.set("LeagueID", "00");
  url.searchParams.set("PlayerOrTeam", "T");
  url.searchParams.set("Season", season);
  url.searchParams.set("SeasonType", seasonType);
  url.searchParams.set("Sorter", "DATE");

  const response = await fetchWithTimeout(url.toString(), { headers: NBA_HEADERS, next: { revalidate: 60 * 30 } }, 9000);
  if (!response.ok) throw new Error(`NBA.com Stats API unavailable: ${response.status}`);

  const payload = await response.json();
  const resultSet = payload.resultSets?.[0];
  const headers: string[] = resultSet?.headers ?? [];
  return (resultSet?.rowSet ?? []).map((row: any[]) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index]]))
  );
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

function groupNbaRows(rows: NbaLogRow[]) {
  const grouped = new Map<string, NbaLogRow[]>();
  for (const row of rows) {
    const gameId = String(row.GAME_ID ?? "");
    if (!gameId) continue;
    grouped.set(gameId, [...(grouped.get(gameId) ?? []), row]);
  }

  return Array.from(grouped.entries())
    .map(([gameId, gameRows]) => {
      const home = gameRows.find((row) => String(row.MATCHUP ?? "").includes(" vs. "));
      const away = gameRows.find((row) => String(row.MATCHUP ?? "").includes(" @ "));
      if (!home || !away) return null;
      return {
        externalGameId: gameId,
        gameDate: String(home.GAME_DATE ?? away.GAME_DATE ?? ""),
        awayTeam: String(away.TEAM_NAME ?? away.TEAM_ABBREVIATION ?? ""),
        homeTeam: String(home.TEAM_NAME ?? home.TEAM_ABBREVIATION ?? ""),
        awayAbbreviation: String(away.TEAM_ABBREVIATION ?? ""),
        homeAbbreviation: String(home.TEAM_ABBREVIATION ?? ""),
        awayScoreFinal: numberOrNull(away.PTS),
        homeScoreFinal: numberOrNull(home.PTS)
      };
    })
    .filter(Boolean) as Array<{
      externalGameId: string;
      gameDate: string;
      awayTeam: string;
      homeTeam: string;
      awayAbbreviation: string;
      homeAbbreviation: string;
      awayScoreFinal: number | null;
      homeScoreFinal: number | null;
    }>;
}

function toDbGameLog(game: GameWithTeams, teamId: number, includeOvertime: boolean): GameLog {
  const isHome = game.homeTeamId === teamId;
  const team = isHome ? game.homeTeam : game.awayTeam;
  const opponent = isHome ? game.awayTeam : game.homeTeam;
  const scored = scoreFor(game, isHome, includeOvertime);
  const allowed = scoreFor(game, !isHome, includeOvertime);

  return {
    gameId: game.id,
    date: game.gameDate.toISOString(),
    team: team.name,
    opponent: opponent.name,
    homeAway: isHome ? "HOME" : "AWAY",
    scored,
    allowed,
    margin: scored - allowed,
    result: scored > allowed ? "W" : "L",
    wentOvertime: game.wentOvertime,
    missingPeriodScoring: !includeOvertime && !hasRequiredRegulationScores(game),
    source: game.league === "NBA" ? "NBA.com Stats API" : "MLB StatsAPI"
  };
}

function summarizeLogs(teamId: number, team: string, includeOvertime: boolean, logs: GameLog[]): TeamSummary & { logs: GameLog[] } {
  const scored = logs.map((log) => log.scored);
  const allowed = logs.map((log) => log.allowed);
  const homeLogs = logs.filter((log) => log.homeAway === "HOME");
  const awayLogs = logs.filter((log) => log.homeAway === "AWAY");
  const wins = logs.filter((log) => log.result === "W").length;
  const losses = logs.length - wins;

  return {
    teamId,
    team,
    games: logs.length,
    averageScored: avg(scored),
    averageAllowed: avg(allowed),
    averageMargin: diff(avg(scored), avg(allowed)),
    highestScored: scored.length ? Math.max(...scored) : null,
    lowestScored: scored.length ? Math.min(...scored) : null,
    wins,
    losses,
    homeAverageScored: avg(homeLogs.map((log) => log.scored)),
    awayAverageScored: avg(awayLogs.map((log) => log.scored)),
    streak: buildStreak(logs),
    includeOvertime,
    lastUpdatedAt: new Date().toISOString(),
    logs
  };
}

function scoreFor(game: GameWithTeams, isHome: boolean, includeOvertime: boolean) {
  const value = includeOvertime
    ? isHome
      ? game.homeScoreFinal
      : game.awayScoreFinal
    : isHome
      ? game.homeScoreRegulation
      : game.awayScoreRegulation;
  if (value === null || value === undefined) throw new Error(includeOvertime ? "缺少最終比分" : "此場缺少分節資料");
  return value;
}

function hasRequiredRegulationScores(game: GameWithTeams) {
  return game.homeScoreRegulation !== null && game.awayScoreRegulation !== null && game.periodScores.length > 0;
}

function emptySummary(teamId: number, team: string, includeOvertime: boolean): TeamSummary & { logs: GameLog[] } {
  return {
    teamId,
    team,
    games: 0,
    averageScored: null,
    averageAllowed: null,
    averageMargin: null,
    highestScored: null,
    lowestScored: null,
    wins: 0,
    losses: 0,
    homeAverageScored: null,
    awayAverageScored: null,
    streak: null,
    includeOvertime,
    lastUpdatedAt: null,
    logs: []
  };
}

function avg(values: number[]) {
  if (!values.length) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function diff(a: number | null, b: number | null) {
  if (a === null || b === null) return null;
  return round(a - b);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildStreak(logs: GameLog[]) {
  if (!logs.length) return null;
  const newestFirst = [...logs].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const first = newestFirst[0].result;
  let count = 0;
  for (const log of newestFirst) {
    if (log.result !== first) break;
    count += 1;
  }
  return `${first}${count}`;
}
