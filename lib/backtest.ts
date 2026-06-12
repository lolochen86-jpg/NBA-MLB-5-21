import { prisma } from "@/lib/prisma";
import { fetchCurrentSeasonGames, type CurrentSeasonGameRow } from "@/lib/current-season";

export type BacktestLeague = "NBA" | "MLB";

export type BacktestRow = {
  id: string;
  league: BacktestLeague;
  date: string;
  awayTeam: string;
  homeTeam: string;
  predictedAway: number;
  predictedHome: number;
  actualAway: number;
  actualHome: number;
  predictedWinner: string;
  actualWinner: string;
  modelTotalLine: number;
  predictedTotal: number;
  actualTotal: number;
  predictedTotalSide: "OVER" | "UNDER" | "PUSH";
  actualTotalSide: "OVER" | "UNDER" | "PUSH";
  winnerCorrect: boolean;
  totalCorrect: boolean;
  scoreRangeHit: boolean;
  totalError: number;
  note: string;
};

export type BacktestStats = {
  games: number;
  winnerAccuracy: number;
  totalAccuracy: number;
  scoreRangeAccuracy: number;
  averageTotalError: number;
};

export type BacktestResult = {
  rows: BacktestRow[];
  stats: BacktestStats;
  fromDate: string;
  league: BacktestLeague;
  rangeValue: number;
  dataSource: string;
  error?: string;
};

type HistoricalGame = {
  id: string;
  league: BacktestLeague;
  season: string;
  seasonType: string;
  gameDate: Date;
  awayTeam: string;
  homeTeam: string;
  awayScoreFinal: number;
  homeScoreFinal: number;
  status: string;
  dataSource: string;
};

type PredictionContext = {
  scored: number[];
  allowed: number[];
  venueScored: number[];
  totals: number[];
};

const DEFAULT_FROM_DATE = "2026-05-01";

export async function getBacktestResult(input: {
  league?: string | null;
  season?: string | null;
  seasonType?: string | null;
  fromDate?: string | null;
  rangeValue?: string | number | null;
}): Promise<BacktestResult> {
  const league = normalizeLeague(input.league);
  const season = input.season || (league === "NBA" ? "2025-26" : "2026");
  const seasonType = input.seasonType || "Regular Season";
  const fromDate = normalizeDate(input.fromDate) ?? DEFAULT_FROM_DATE;
  const rangeValue = normalizeRange(input.rangeValue);

  try {
    const loaded = await loadHistoricalGames({ league, season, seasonType, fromDate });
    const rows = buildBacktestRows({
      league,
      fromDate,
      rangeValue,
      games: loaded.games
    });

    return {
      rows,
      stats: summarize(rows),
      fromDate,
      league,
      rangeValue,
      dataSource: loaded.source
    };
  } catch (error) {
    console.error("Backtest unavailable", error);
    return {
      rows: [],
      stats: summarize([]),
      fromDate,
      league,
      rangeValue,
      dataSource: "unavailable",
      error: "資料來源目前無法取得"
    };
  }
}

async function loadHistoricalGames(input: {
  league: BacktestLeague;
  season: string;
  seasonType: string;
  fromDate: string;
}) {
  const dbGames = await loadDbGames(input);
  if (dbGames.length >= 20) {
    return { games: dbGames, source: "Supabase games" };
  }
  if (input.league === "NBA") {
    return { games: dbGames, source: "Supabase games" };
  }

  const externalRows = await withTimeout(
    fetchCurrentSeasonGames({
      league: input.league,
      season: input.season,
      seasonType: input.seasonType
    }),
    7000
  );
  const externalGames = currentSeasonRowsToGames(externalRows, input);
  if (externalGames.length >= dbGames.length) {
    return { games: externalGames, source: externalRows[0]?.dataSource ?? "External schedule API" };
  }
  return { games: dbGames, source: "Supabase games" };
}

async function loadDbGames(input: {
  league: BacktestLeague;
  season: string;
  seasonType: string;
  fromDate: string;
}) {
  const from = new Date(`${input.fromDate}T00:00:00.000Z`);
  const warmup = new Date(from);
  warmup.setUTCDate(warmup.getUTCDate() - 45);
  const rows = await prisma.game.findMany({
    where: {
      league: input.league,
      season: input.season,
      seasonType: input.seasonType,
      gameDate: { gte: warmup },
      awayScoreFinal: { not: null },
      homeScoreFinal: { not: null }
    },
    include: { awayTeam: true, homeTeam: true },
    orderBy: { gameDate: "asc" }
  });

  return rows
    .filter((game) => game.awayScoreFinal !== null && game.homeScoreFinal !== null)
    .map((game) => ({
      id: game.externalGameId,
      league: game.league as BacktestLeague,
      season: game.season,
      seasonType: game.seasonType,
      gameDate: game.gameDate,
      awayTeam: game.awayTeam.name,
      homeTeam: game.homeTeam.name,
      awayScoreFinal: game.awayScoreFinal ?? 0,
      homeScoreFinal: game.homeScoreFinal ?? 0,
      status: game.status,
      dataSource: "Supabase games"
    }));
}

function currentSeasonRowsToGames(
  rows: CurrentSeasonGameRow[],
  input: { league: BacktestLeague; season: string; seasonType: string; fromDate: string }
) {
  const from = new Date(`${input.fromDate}T00:00:00.000Z`);
  const warmup = new Date(from);
  warmup.setUTCDate(warmup.getUTCDate() - 45);

  return rows
    .filter((row) => row.league === input.league)
    .filter((row) => row.awayScoreFinal !== null && row.homeScoreFinal !== null)
    .map((row) => ({
      id: row.externalGameId,
      league: row.league,
      season: row.season,
      seasonType: row.seasonType,
      gameDate: new Date(`${row.gameDate}T00:00:00.000Z`),
      awayTeam: row.awayTeam,
      homeTeam: row.homeTeam,
      awayScoreFinal: row.awayScoreFinal ?? 0,
      homeScoreFinal: row.homeScoreFinal ?? 0,
      status: row.status,
      dataSource: row.dataSource
    }))
    .filter((game) => game.gameDate >= warmup)
    .sort((a, b) => a.gameDate.getTime() - b.gameDate.getTime());
}

function buildBacktestRows(input: {
  league: BacktestLeague;
  fromDate: string;
  rangeValue: number;
  games: HistoricalGame[];
}) {
  const from = new Date(`${input.fromDate}T00:00:00.000Z`);
  const completedGames = input.games
    .filter((game) => game.awayScoreFinal !== null && game.homeScoreFinal !== null)
    .sort((a, b) => a.gameDate.getTime() - b.gameDate.getTime());
  const leagueAverageTotal = average(completedGames.map((game) => game.awayScoreFinal + game.homeScoreFinal));

  return completedGames
    .filter((game) => game.gameDate >= from)
    .map((game) => {
      const previousGames = completedGames.filter((candidate) => candidate.gameDate < game.gameDate);
      const awayContext = teamContext(previousGames, game.awayTeam, "away", input.rangeValue);
      const homeContext = teamContext(previousGames, game.homeTeam, "home", input.rangeValue);
      const awayOpponent = teamContext(previousGames, game.homeTeam, "home", input.rangeValue);
      const homeOpponent = teamContext(previousGames, game.awayTeam, "away", input.rangeValue);
      const predictedAway = predictScore(awayContext, homeOpponent, leagueAverageTotal / 2, input.league);
      const predictedHome = predictScore(homeContext, awayOpponent, leagueAverageTotal / 2, input.league);
      const modelTotalLine = buildTotalLine(awayContext, homeContext, leagueAverageTotal, input.league);
      const predictedTotal = predictedAway + predictedHome;
      const actualTotal = game.awayScoreFinal + game.homeScoreFinal;
      const predictedWinner = predictedAway > predictedHome ? game.awayTeam : game.homeTeam;
      const actualWinner = game.awayScoreFinal > game.homeScoreFinal ? game.awayTeam : game.homeTeam;
      const predictedTotalSide = totalSide(predictedTotal, modelTotalLine);
      const actualTotalSide = totalSide(actualTotal, modelTotalLine);
      const totalError = Math.abs(predictedTotal - actualTotal);
      const range = input.league === "NBA" ? 7.5 : 2.5;

      return {
        id: game.id,
        league: input.league,
        date: toDateString(game.gameDate),
        awayTeam: game.awayTeam,
        homeTeam: game.homeTeam,
        predictedAway: roundOne(predictedAway),
        predictedHome: roundOne(predictedHome),
        actualAway: game.awayScoreFinal,
        actualHome: game.homeScoreFinal,
        predictedWinner,
        actualWinner,
        modelTotalLine: roundOne(modelTotalLine),
        predictedTotal: roundOne(predictedTotal),
        actualTotal,
        predictedTotalSide,
        actualTotalSide,
        winnerCorrect: predictedWinner === actualWinner,
        totalCorrect: predictedTotalSide === actualTotalSide && actualTotalSide !== "PUSH",
        scoreRangeHit: Math.abs(predictedAway - game.awayScoreFinal) <= range && Math.abs(predictedHome - game.homeScoreFinal) <= range,
        totalError: roundOne(totalError),
        note: previousGames.length ? `使用賽前近 ${input.rangeValue} 場` : "賽前樣本不足"
      };
    });
}

function teamContext(games: HistoricalGame[], team: string, venue: "home" | "away", rangeValue: number): PredictionContext {
  const teamGames = games
    .filter((game) => game.homeTeam === team || game.awayTeam === team)
    .slice(-rangeValue);
  const venueGames = teamGames.filter((game) => (venue === "home" ? game.homeTeam === team : game.awayTeam === team));

  return {
    scored: teamGames.map((game) => (game.homeTeam === team ? game.homeScoreFinal : game.awayScoreFinal)),
    allowed: teamGames.map((game) => (game.homeTeam === team ? game.awayScoreFinal : game.homeScoreFinal)),
    venueScored: venueGames.map((game) => (venue === "home" ? game.homeScoreFinal : game.awayScoreFinal)),
    totals: teamGames.map((game) => game.homeScoreFinal + game.awayScoreFinal)
  };
}

function predictScore(
  team: PredictionContext,
  opponent: PredictionContext,
  leagueAverageScore: number,
  _league: BacktestLeague
) {
  const scored = averageOr(team.scored, leagueAverageScore);
  const opponentAllowed = averageOr(opponent.allowed, leagueAverageScore);
  const venue = averageOr(team.venueScored, scored);
  return scored * 0.42 + opponentAllowed * 0.28 + venue * 0.2 + leagueAverageScore * 0.1;
}

function buildTotalLine(away: PredictionContext, home: PredictionContext, leagueAverageTotal: number, league: BacktestLeague) {
  const contextTotals = [...away.totals, ...home.totals];
  const recentTotal = averageOr(contextTotals, leagueAverageTotal);
  const blended = recentTotal * 0.65 + leagueAverageTotal * 0.35;
  return roundToHalf(league === "NBA" ? blended : Math.max(5.5, blended));
}

function summarize(rows: BacktestRow[]): BacktestStats {
  const games = rows.length;
  if (!games) {
    return {
      games: 0,
      winnerAccuracy: 0,
      totalAccuracy: 0,
      scoreRangeAccuracy: 0,
      averageTotalError: 0
    };
  }
  return {
    games,
    winnerAccuracy: percentage(rows.filter((row) => row.winnerCorrect).length, games),
    totalAccuracy: percentage(rows.filter((row) => row.totalCorrect).length, games),
    scoreRangeAccuracy: percentage(rows.filter((row) => row.scoreRangeHit).length, games),
    averageTotalError: roundOne(average(rows.map((row) => row.totalError)))
  };
}

function normalizeLeague(value: string | null | undefined): BacktestLeague {
  return value?.toUpperCase() === "NBA" ? "NBA" : "MLB";
}

function normalizeDate(value: string | null | undefined) {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function normalizeRange(value: string | number | null | undefined) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 5;
  return Math.min(15, Math.max(3, Math.round(number)));
}

function totalSide(total: number, line: number): "OVER" | "UNDER" | "PUSH" {
  if (Math.abs(total - line) < 0.01) return "PUSH";
  return total > line ? "OVER" : "UNDER";
}

function average(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function averageOr(values: number[], fallback: number) {
  const value = average(values);
  return value || fallback;
}

function percentage(value: number, total: number) {
  return Math.round((value / total) * 1000) / 10;
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function roundToHalf(value: number) {
  return Math.round(value * 2) / 2;
}

function toDateString(value: Date) {
  return value.toISOString().slice(0, 10);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Backtest timed out")), timeoutMs))
  ]);
}
