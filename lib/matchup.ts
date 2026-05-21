import { prisma } from "@/lib/prisma";

type GameWithTeams = Awaited<ReturnType<typeof fetchTeamGames>>[number];

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
  gameId: number;
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

  if (!home || !away) {
    throw new Error("找不到指定球隊");
  }

  const [homeSummary, awaySummary] = await Promise.all([
    summarizeTeam(input, input.homeTeamId),
    summarizeTeam(input, input.awayTeamId)
  ]);

  return {
    dataSource:
      input.league === "NBA"
        ? "NBA.com Stats API / local SQLite cache"
        : "MLB StatsAPI / local SQLite cache",
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
  const games = await fetchTeamGames(input, teamId);
  const completeGames = input.includeOvertime
    ? games
    : games.filter((game) => hasRequiredRegulationScores(game, teamId));

  if (!games.length) {
    const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId } });
    return {
      ...emptySummary(teamId, team.name, input.includeOvertime),
      unavailableReason: "請先同步資料"
    };
  }

  if (!input.includeOvertime && completeGames.length !== games.length) {
    const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId } });
    return {
      ...emptySummary(teamId, team.name, input.includeOvertime),
      unavailableReason: "此場缺少分節資料"
    };
  }

  const logs = completeGames.map((game) => toGameLog(game, teamId, input.includeOvertime));
  const scored = logs.map((log) => log.scored);
  const allowed = logs.map((log) => log.allowed);
  const homeLogs = logs.filter((log) => log.homeAway === "HOME");
  const awayLogs = logs.filter((log) => log.homeAway === "AWAY");
  const wins = logs.filter((log) => log.result === "W").length;
  const losses = logs.length - wins;

  return {
    teamId,
    team: logs[0]?.team ?? "Unknown",
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
    includeOvertime: input.includeOvertime,
    lastUpdatedAt: completeGames
      .map((game) => game.updatedAt.toISOString())
      .sort()
      .at(-1) ?? null,
    logs
  };
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
  const baseWhere = {
    league: input.league,
    season: input.season,
    seasonType: input.seasonType,
    status: "FINAL",
    OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }]
  };

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
    where: { ...baseWhere, ...dateFilter },
    orderBy: { gameDate: "desc" },
    take: input.rangeType === "games" ? input.rangeValue : undefined,
    include: {
      homeTeam: true,
      awayTeam: true,
      periodScores: true
    }
  });
}

function toGameLog(game: GameWithTeams, teamId: number, includeOvertime: boolean): GameLog {
  const isHome = game.homeTeamId === teamId;
  const team = isHome ? game.homeTeam : game.awayTeam;
  const opponent = isHome ? game.awayTeam : game.homeTeam;
  const scored = scoreFor(game, isHome, includeOvertime);
  const allowed = scoreFor(game, !isHome, includeOvertime);
  const missingPeriodScoring = !includeOvertime && !hasRequiredRegulationScores(game, teamId);

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
    missingPeriodScoring,
    source: game.league === "NBA" ? "NBA.com Stats API" : "MLB StatsAPI"
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
  if (value === null || value === undefined) {
    throw new Error(includeOvertime ? "缺少最終比分" : "此場缺少分節資料");
  }
  return value;
}

function hasRequiredRegulationScores(game: GameWithTeams, teamId: number) {
  const isHome = game.homeTeamId === teamId;
  const score = isHome ? game.homeScoreRegulation : game.awayScoreRegulation;
  const opponentScore = isHome ? game.awayScoreRegulation : game.homeScoreRegulation;
  return score !== null && opponentScore !== null && game.periodScores.length > 0;
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
