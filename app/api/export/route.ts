import { apiError, parseBoolean, requiredParam } from "@/lib/http";
import { csvResponse, flattenMatchupExport, jsonResponse, xlsxResponse } from "@/lib/export";
import { getMatchupSummary } from "@/lib/matchup";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const type = requiredParam(url, "type");
    const format = requiredParam(url, "format") as "csv" | "xlsx" | "json";

    if (!["csv", "xlsx", "json"].includes(format)) return apiError("format 必須是 csv、xlsx 或 json");
    if (!["matchup", "players", "games"].includes(type)) return apiError("type 必須是 matchup、players 或 games");

    if (type === "players") {
      const league = requiredParam(url, "league").toUpperCase();
      const rows = await exportPlayers(league);
      return send(format, rows, `${league.toLowerCase()}-players-${Date.now()}`, {
        league,
        type,
        fetchedAt: new Date().toISOString(),
        dataSource: league === "NBA" ? "NBA.com Stats API / local SQLite cache" : "MLB StatsAPI / local SQLite cache",
        rows
      });
    }

    if (type === "games") {
      const league = requiredParam(url, "league").toUpperCase();
      const rows = await exportGames(league);
      return send(format, rows, `${league.toLowerCase()}-games-${Date.now()}`, {
        league,
        type,
        fetchedAt: new Date().toISOString(),
        dataSource: league === "NBA" ? "NBA.com Stats API / local SQLite cache" : "MLB StatsAPI / local SQLite cache",
        rows
      });
    }

    const league = requiredParam(url, "league").toUpperCase();
    const includeOvertime = parseBoolean(url.searchParams.get("includeOvertime"), true);
    const season = requiredParam(url, "season");
    const seasonType = url.searchParams.get("seasonType") ?? "Regular Season";

    const summary = await getMatchupSummary({
      league,
      homeTeamId: Number(requiredParam(url, "homeTeamId")),
      awayTeamId: Number(requiredParam(url, "awayTeamId")),
      season,
      seasonType,
      rangeType: (url.searchParams.get("rangeType") ?? "games") as "games" | "days",
      rangeValue: Number(url.searchParams.get("rangeValue") ?? 5),
      includeOvertime,
      splitHomeAway: parseBoolean(url.searchParams.get("splitHomeAway"), false)
    });

    const payload = {
      ...summary,
      league,
      season,
      seasonType,
      includeOvertime,
      fetchedAt: new Date().toISOString(),
      lastUpdatedAt:
        summary.homeTeamSummary.lastUpdatedAt ??
        summary.awayTeamSummary.lastUpdatedAt ??
        null
    };
    const rows = flattenMatchupExport(payload);
    const filename = `${league.toLowerCase()}-matchup-${Date.now()}`;

    return send(format, rows, filename, payload);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "無法匯出資料", 500);
  }
}

function send(format: "csv" | "xlsx" | "json", rows: Record<string, unknown>[], filename: string, payload: unknown) {
  if (format === "json") return jsonResponse(payload, filename);
  if (format === "xlsx") return xlsxResponse(rows, filename);
  return csvResponse(rows, filename);
}

async function exportPlayers(league: string) {
  const stats = await prisma.playerGameStat.findMany({
    where: { league },
    include: { player: true, team: true, game: true },
    orderBy: { updatedAt: "desc" },
    take: 1000
  });
  const fetchedAt = new Date().toISOString();
  return stats.map((stat) => ({
    league,
    player: stat.player.name,
    team: stat.team.name,
    gameDate: stat.game.gameDate.toISOString(),
    points: stat.points,
    rebounds: stat.rebounds,
    assists: stat.assists,
    atBats: stat.atBats,
    runs: stat.runs,
    hits: stat.hits,
    homeRuns: stat.homeRuns,
    rbi: stat.rbi,
    inningsPitched: stat.inningsPitched,
    earnedRuns: stat.earnedRuns,
    era: stat.era,
    whip: stat.whip,
    fetchedAt,
    lastUpdatedAt: stat.updatedAt.toISOString(),
    dataSource: league === "NBA" ? "NBA.com Stats API / local SQLite cache" : "MLB StatsAPI / local SQLite cache"
  }));
}

async function exportGames(league: string) {
  const games = await prisma.game.findMany({
    where: { league },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { gameDate: "desc" },
    take: 1000
  });
  const fetchedAt = new Date().toISOString();
  return games.map((game) => ({
    league,
    season: game.season,
    seasonType: game.seasonType,
    gameDate: game.gameDate.toISOString(),
    homeTeam: game.homeTeam.name,
    awayTeam: game.awayTeam.name,
    homeScoreFinal: game.homeScoreFinal,
    awayScoreFinal: game.awayScoreFinal,
    homeScoreRegulation: game.homeScoreRegulation,
    awayScoreRegulation: game.awayScoreRegulation,
    wentOvertime: game.wentOvertime,
    status: game.status,
    fetchedAt,
    lastUpdatedAt: game.updatedAt.toISOString(),
    dataSource: league === "NBA" ? "NBA.com Stats API / local SQLite cache" : "MLB StatsAPI / local SQLite cache"
  }));
}
