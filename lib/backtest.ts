import { prisma } from "@/lib/prisma";
import { fetchCurrentSeasonGames, type CurrentSeasonGameRow } from "@/lib/current-season";

export type BacktestLeague = "NBA" | "MLB";
type TotalSide = "OVER" | "UNDER" | "PUSH";
type StreakType = "W" | "L" | "NONE";

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
  predictedTotalSide: TotalSide;
  actualTotalSide: TotalSide;
  winnerCorrect: boolean;
  totalCorrect: boolean;
  scoreRangeHit: boolean;
  totalError: number;
  volatilityLabel: string;
  streakLabel: string;
  trendLabel: string;
  totalLeanLabel: string;
  confidenceLabel: string;
  riskFlags: string[];
  note: string;
};

export type BacktestStats = {
  games: number;
  winnerAccuracy: number;
  totalAccuracy: number;
  scoreRangeAccuracy: number;
  averageTotalError: number;
};

export type BacktestDiagnosticBucket = {
  label: string;
  games: number;
  winnerAccuracy: number;
  totalAccuracy: number;
  averageTotalError: number;
};

export type BacktestDiagnostics = {
  bestWinnerBuckets: BacktestDiagnosticBucket[];
  worstWinnerBuckets: BacktestDiagnosticBucket[];
  bestTotalBuckets: BacktestDiagnosticBucket[];
  highErrorBuckets: BacktestDiagnosticBucket[];
  missingData: string[];
};

export type BacktestResult = {
  rows: BacktestRow[];
  stats: BacktestStats;
  diagnostics: BacktestDiagnostics;
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

type Streak = {
  type: StreakType;
  count: number;
};

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
  const fromDate = normalizeDate(input.fromDate) ?? seasonStartDate(league, season, seasonType);
  const rangeValue = normalizeRange(input.rangeValue);

  try {
    const loaded = await loadHistoricalGames({ league, season, seasonType, fromDate });
    const rows = buildBacktestRows({ league, fromDate, rangeValue, games: loaded.games });

    return {
      rows,
      stats: summarize(rows),
      diagnostics: summarizeDiagnostics(rows, league),
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
      diagnostics: summarizeDiagnostics([], league),
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
  const dbBacktestGames = countGamesOnOrAfter(dbGames, input.fromDate);
  if (input.league === "NBA") {
    return { games: dbGames, source: "Supabase games" };
  }
  if (dbBacktestGames >= 200) {
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

function countGamesOnOrAfter(games: HistoricalGame[], fromDate: string) {
  const from = new Date(`${fromDate}T00:00:00.000Z`);
  return games.filter((game) => game.gameDate >= from).length;
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
      const predictedAway = predictScore(awayContext, homeOpponent, leagueAverageTotal / 2);
      const predictedHome = predictScore(homeContext, awayOpponent, leagueAverageTotal / 2);
      const modelTotalLine = buildTotalLine(awayContext, homeContext, leagueAverageTotal, input.league);
      const predictedTotal = predictedAway + predictedHome;
      const actualTotal = game.awayScoreFinal + game.homeScoreFinal;
      const predictedWinner = predictedAway > predictedHome ? game.awayTeam : game.homeTeam;
      const actualWinner = game.awayScoreFinal > game.homeScoreFinal ? game.awayTeam : game.homeTeam;
      const predictedTotalSide = totalSide(predictedTotal, modelTotalLine);
      const actualTotalSide = totalSide(actualTotal, modelTotalLine);
      const totalError = Math.abs(predictedTotal - actualTotal);
      const range = input.league === "NBA" ? 7.5 : 2.5;
      const volatilityLabel = volatility(awayContext, homeContext, input.league);
      const awayStreak = streak(previousGames, game.awayTeam);
      const homeStreak = streak(previousGames, game.homeTeam);
      const streakLabel = streakSummary(awayStreak, homeStreak);
      const trendLabel = trendSummary(awayContext, homeContext, input.league);
      const totalLeanLabel = totalLean(awayContext, homeContext, leagueAverageTotal, input.league);
      const riskFlags = buildRiskFlags({
        volatilityLabel,
        awayStreak,
        homeStreak,
        awayContext,
        homeContext,
        predictedTotal,
        modelTotalLine,
        predictedAway,
        predictedHome,
        league: input.league
      });
      const confidenceLabel = confidence({
        volatilityLabel,
        riskFlags,
        sampleSize: Math.min(awayContext.scored.length, homeContext.scored.length),
        predictedMargin: Math.abs(predictedAway - predictedHome),
        totalEdge: Math.abs(predictedTotal - modelTotalLine),
        league: input.league
      });

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
        volatilityLabel,
        streakLabel,
        trendLabel,
        totalLeanLabel,
        confidenceLabel,
        riskFlags,
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

function predictScore(team: PredictionContext, opponent: PredictionContext, leagueAverageScore: number) {
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

function summarizeDiagnostics(rows: BacktestRow[], league: BacktestLeague): BacktestDiagnostics {
  const buckets = new Map<string, BacktestRow[]>();
  for (const row of rows) {
    addBucket(buckets, `穩定度：${row.volatilityLabel}`, row);
    addBucket(buckets, `連勝連敗：${row.streakLabel}`, row);
    addBucket(buckets, `火力趨勢：${row.trendLabel}`, row);
    addBucket(buckets, `大小分型態：${row.totalLeanLabel}`, row);
    addBucket(buckets, `模型信心：${row.confidenceLabel}`, row);
    for (const flag of row.riskFlags) addBucket(buckets, `風險：${flag}`, row);
  }

  const minimumGames = Math.max(5, league === "NBA" ? 6 : 8);
  const summaries = Array.from(buckets.entries())
    .map(([label, bucketRows]) => bucketSummary(label, bucketRows))
    .filter((bucket) => bucket.games >= minimumGames);

  return {
    bestWinnerBuckets: summaries.slice().sort((a, b) => b.winnerAccuracy - a.winnerAccuracy || b.games - a.games).slice(0, 4),
    worstWinnerBuckets: summaries.slice().sort((a, b) => a.winnerAccuracy - b.winnerAccuracy || b.games - a.games).slice(0, 4),
    bestTotalBuckets: summaries.slice().sort((a, b) => b.totalAccuracy - a.totalAccuracy || b.games - a.games).slice(0, 4),
    highErrorBuckets: summaries.slice().sort((a, b) => b.averageTotalError - a.averageTotalError || b.games - a.games).slice(0, 4),
    missingData: [
      "先發投手近況：目前沒有逐場歷史先發 ERA / WHIP，投手日差異只能用球隊失分近況間接反映。",
      "牛棚用量：目前沒有逐日牛棚投球局數與連投天數，延長賽或前一戰大量用牛棚的影響尚未完整進模型。",
      "傷兵打者：目前沒有把受傷主力打者的 OPS、HR、RBI 轉成逐場打線扣分。",
      "左右投拆分：目前沒有打線對左投 / 右投的 OPS 或 wRC+，遇到特定投手型態會比較難判斷。"
    ]
  };
}

function addBucket(buckets: Map<string, BacktestRow[]>, label: string, row: BacktestRow) {
  buckets.set(label, [...(buckets.get(label) ?? []), row]);
}

function bucketSummary(label: string, rows: BacktestRow[]): BacktestDiagnosticBucket {
  return {
    label,
    games: rows.length,
    winnerAccuracy: percentage(rows.filter((row) => row.winnerCorrect).length, rows.length),
    totalAccuracy: percentage(rows.filter((row) => row.totalCorrect).length, rows.length),
    averageTotalError: roundOne(average(rows.map((row) => row.totalError)))
  };
}

function volatility(away: PredictionContext, home: PredictionContext, league: BacktestLeague) {
  const values = [...away.scored, ...home.scored, ...away.allowed, ...home.allowed];
  const sd = standardDeviation(values);
  const stable = league === "NBA" ? 8 : 2;
  const volatile = league === "NBA" ? 13 : 3.6;
  if (sd <= stable) return "穩定";
  if (sd >= volatile) return "大起大落";
  return "普通";
}

function streak(games: HistoricalGame[], team: string): Streak {
  const teamGames = games.filter((game) => game.homeTeam === team || game.awayTeam === team).slice().reverse();
  if (!teamGames.length) return { type: "NONE", count: 0 };
  const first = gameResult(teamGames[0], team);
  let count = 0;
  for (const game of teamGames) {
    if (gameResult(game, team) !== first) break;
    count += 1;
  }
  return { type: first, count };
}

function gameResult(game: HistoricalGame, team: string): "W" | "L" {
  const scored = game.homeTeam === team ? game.homeScoreFinal : game.awayScoreFinal;
  const allowed = game.homeTeam === team ? game.awayScoreFinal : game.homeScoreFinal;
  return scored > allowed ? "W" : "L";
}

function streakSummary(away: Streak, home: Streak) {
  const awayText = streakText("客", away);
  const homeText = streakText("主", home);
  if (away.count < 2 && home.count < 2) return "無明顯連勝敗";
  return [awayText, homeText].filter(Boolean).join(" / ");
}

function streakText(prefix: string, streakValue: Streak) {
  if (streakValue.count < 2 || streakValue.type === "NONE") return "";
  return `${prefix}${streakValue.type === "W" ? "連勝" : "連敗"}${streakValue.count}`;
}

function trendSummary(away: PredictionContext, home: PredictionContext, league: BacktestLeague) {
  const awayTrend = scoringTrend(away.scored, league);
  const homeTrend = scoringTrend(home.scored, league);
  if (awayTrend === "升溫" && homeTrend === "升溫") return "雙方升溫";
  if (awayTrend === "降溫" && homeTrend === "降溫") return "雙方降溫";
  if (awayTrend === "升溫" || homeTrend === "升溫") return "一方升溫";
  if (awayTrend === "降溫" || homeTrend === "降溫") return "一方降溫";
  return "持平";
}

function scoringTrend(values: number[], league: BacktestLeague) {
  if (values.length < 5) return "持平";
  const recent = average(values.slice(-3));
  const baseline = average(values);
  const threshold = league === "NBA" ? 5 : 1.1;
  if (recent - baseline >= threshold) return "升溫";
  if (baseline - recent >= threshold) return "降溫";
  return "持平";
}

function totalLean(away: PredictionContext, home: PredictionContext, leagueAverageTotal: number, league: BacktestLeague) {
  const recentTotal = averageOr([...away.totals, ...home.totals], leagueAverageTotal);
  const threshold = league === "NBA" ? 8 : 1.4;
  if (recentTotal - leagueAverageTotal >= threshold) return "偏大分";
  if (leagueAverageTotal - recentTotal >= threshold) return "偏小分";
  return "中性";
}

function buildRiskFlags(input: {
  volatilityLabel: string;
  awayStreak: Streak;
  homeStreak: Streak;
  awayContext: PredictionContext;
  homeContext: PredictionContext;
  predictedTotal: number;
  modelTotalLine: number;
  predictedAway: number;
  predictedHome: number;
  league: BacktestLeague;
}) {
  const flags: string[] = [];
  if (input.volatilityLabel === "大起大落") flags.push("得失分波動大");
  if (input.awayStreak.count >= 3 || input.homeStreak.count >= 3) flags.push("連勝連敗三場以上");
  if (Math.min(input.awayContext.scored.length, input.homeContext.scored.length) < 5) flags.push("賽前樣本不足");
  const totalEdge = Math.abs(input.predictedTotal - input.modelTotalLine);
  const margin = Math.abs(input.predictedAway - input.predictedHome);
  if (totalEdge < (input.league === "NBA" ? 3 : 0.7)) flags.push("大小分接近模型線");
  if (margin < (input.league === "NBA" ? 4 : 1.0)) flags.push("勝負差距太小");
  return flags.length ? flags : ["無明顯風險"];
}

function confidence(input: {
  volatilityLabel: string;
  riskFlags: string[];
  sampleSize: number;
  predictedMargin: number;
  totalEdge: number;
  league: BacktestLeague;
}) {
  let score = 2;
  if (input.sampleSize >= 8) score += 1;
  if (input.volatilityLabel === "穩定") score += 1;
  if (input.volatilityLabel === "大起大落") score -= 1;
  if (input.predictedMargin >= (input.league === "NBA" ? 7 : 1.8)) score += 1;
  if (input.totalEdge >= (input.league === "NBA" ? 6 : 1.3)) score += 1;
  if (input.riskFlags.some((flag) => flag !== "無明顯風險")) score -= 1;
  if (score >= 4) return "高";
  if (score <= 1) return "低";
  return "中";
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

function seasonStartDate(league: BacktestLeague, season: string, seasonType: string) {
  if (league === "MLB") {
    return seasonType === "Playoffs" ? `${season}-10-01` : `${season}-03-01`;
  }

  const startYear = Number(season.split("-")[0]);
  if (!Number.isFinite(startYear)) return "2025-10-01";
  return seasonType === "Playoffs" ? `${startYear + 1}-04-01` : `${startYear}-10-01`;
}

function totalSide(total: number, line: number): TotalSide {
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

function standardDeviation(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (valid.length < 2) return 0;
  const avg = average(valid);
  const variance = average(valid.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
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
