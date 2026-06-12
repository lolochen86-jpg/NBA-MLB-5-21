export type PeriodScore = {
  periodNumber: number;
  periodType: "Q1" | "Q2" | "Q3" | "Q4" | "OT" | "INNING";
  away: number | null;
  home: number | null;
  isOvertimeOrExtra: boolean;
};

export type CurrentSeasonGameRow = {
  league: "NBA" | "MLB";
  season: string;
  seasonType: string;
  externalGameId: string;
  gameDate: string;
  awayTeam: string;
  homeTeam: string;
  awayScoreFinal: number | null;
  homeScoreFinal: number | null;
  awayScoreRegulation: number | null;
  homeScoreRegulation: number | null;
  awayQ1: number | null;
  awayQ2: number | null;
  awayQ3: number | null;
  awayQ4: number | null;
  homeQ1: number | null;
  homeQ2: number | null;
  homeQ3: number | null;
  homeQ4: number | null;
  awayInnings1To9: string;
  homeInnings1To9: string;
  wentOvertime: boolean | null;
  periodScoresJson: string;
  status: string;
  fetchedAt: string;
  dataSource: string;
  note: string;
};

type NbaLogRow = Record<string, string | number | null>;
type NbaLineScoreRow = Record<string, string | number | null>;

const NBA_HEADERS = {
  Accept: "application/json, text/plain, */*",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
};

export async function fetchCurrentSeasonGames(input: {
  league: string;
  season?: string | null;
  seasonType?: string | null;
  timeoutMs?: number | null;
}) {
  const league = input.league.toUpperCase();
  if (league === "MLB") {
    return fetchMlbCurrentSeason(input.season ?? currentMlbSeason(), input.seasonType ?? "Regular Season", input.timeoutMs ?? 8000);
  }
  if (league === "NBA") {
    return fetchNbaCurrentSeason(input.season ?? currentNbaSeason(), input.seasonType ?? "Regular Season");
  }
  throw new Error("league 必須是 NBA 或 MLB");
}

async function fetchMlbCurrentSeason(season: string, seasonType: string, timeoutMs: number): Promise<CurrentSeasonGameRow[]> {
  const fetchedAt = new Date().toISOString();
  const url = new URL("https://statsapi.mlb.com/api/v1/schedule");
  url.searchParams.set("sportId", "1");
  url.searchParams.set("season", season);
  url.searchParams.set("gameTypes", seasonType === "Playoffs" ? "P" : "R");
  url.searchParams.set("hydrate", "linescore");
  url.searchParams.set("startDate", `${season}-03-01`);
  url.searchParams.set("endDate", todayIsoDate());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(url, { signal: controller.signal, next: { revalidate: 60 * 30 } });
  if (!response.ok) throw new Error(`MLB StatsAPI 無法取得：${response.status}`);

  const payload = await response.json();
  clearTimeout(timeout);
  const games = (payload.dates ?? []).flatMap((date: any) => date.games ?? []);

  return games
    .filter((game: any) => isFinalStatus(game.status))
    .map((game: any) => {
      const innings = game.linescore?.innings ?? [];
      const periodScores: PeriodScore[] = innings.map((inning: any, index: number) => ({
        periodNumber: index + 1,
        periodType: "INNING",
        away: numberOrNull(inning?.away?.runs),
        home: numberOrNull(inning?.home?.runs),
        isOvertimeOrExtra: index + 1 > 9
      }));
      const awayRegulation = sumPeriods(periodScores.filter((period) => period.periodNumber <= 9), "away");
      const homeRegulation = sumPeriods(periodScores.filter((period) => period.periodNumber <= 9), "home");

      return {
        league: "MLB",
        season,
        seasonType,
        externalGameId: String(game.gamePk),
        gameDate: game.officialDate ?? game.gameDate,
        awayTeam: game.teams?.away?.team?.name ?? "",
        homeTeam: game.teams?.home?.team?.name ?? "",
        awayScoreFinal: numberOrNull(game.teams?.away?.score),
        homeScoreFinal: numberOrNull(game.teams?.home?.score),
        awayScoreRegulation: awayRegulation,
        homeScoreRegulation: homeRegulation,
        awayQ1: null,
        awayQ2: null,
        awayQ3: null,
        awayQ4: null,
        homeQ1: null,
        homeQ2: null,
        homeQ3: null,
        homeQ4: null,
        awayInnings1To9: periodScores.slice(0, 9).map((period) => period.away ?? "").join("|"),
        homeInnings1To9: periodScores.slice(0, 9).map((period) => period.home ?? "").join("|"),
        wentOvertime: periodScores.some((period) => period.isOvertimeOrExtra),
        periodScoresJson: JSON.stringify(periodScores),
        status: game.status?.detailedState ?? "FINAL",
        fetchedAt,
        dataSource: "MLB StatsAPI schedule?hydrate=linescore",
        note: periodScores.length ? "完整 linescore；分析時可用 final 或 1-9 局 regulation" : "缺少 linescore"
      };
    });
}

async function fetchNbaCurrentSeason(season: string, seasonType: string): Promise<CurrentSeasonGameRow[]> {
  const fetchedAt = new Date().toISOString();
  const leagueRows = await fetchNbaLeagueGameLog(season, seasonType);
  const grouped = groupNbaGames(leagueRows);
  const dates = Array.from(new Set(grouped.map((game) => game.gameDate))).filter(Boolean);
  const lineScoresByGame = await fetchNbaScoreboardLineScores(dates);

  return grouped.map((game) => {
    const lineScores = lineScoresByGame.get(game.externalGameId) ?? [];
    const awayLine = lineScores.find((row) => String(row.TEAM_ABBREVIATION) === game.awayAbbreviation);
    const homeLine = lineScores.find((row) => String(row.TEAM_ABBREVIATION) === game.homeAbbreviation);
    const periodScores = buildNbaPeriodScores(awayLine, homeLine);
    const awayRegulation = periodScores.length ? sumPeriods(periodScores.filter((period) => period.periodNumber <= 4), "away") : null;
    const homeRegulation = periodScores.length ? sumPeriods(periodScores.filter((period) => period.periodNumber <= 4), "home") : null;

    return {
      league: "NBA",
      season,
      seasonType,
      externalGameId: game.externalGameId,
      gameDate: game.gameDate,
      awayTeam: game.awayTeam,
      homeTeam: game.homeTeam,
      awayScoreFinal: game.awayScoreFinal,
      homeScoreFinal: game.homeScoreFinal,
      awayScoreRegulation: awayRegulation,
      homeScoreRegulation: homeRegulation,
      awayQ1: valueFromPeriod(periodScores, 1, "away"),
      awayQ2: valueFromPeriod(periodScores, 2, "away"),
      awayQ3: valueFromPeriod(periodScores, 3, "away"),
      awayQ4: valueFromPeriod(periodScores, 4, "away"),
      homeQ1: valueFromPeriod(periodScores, 1, "home"),
      homeQ2: valueFromPeriod(periodScores, 2, "home"),
      homeQ3: valueFromPeriod(periodScores, 3, "home"),
      homeQ4: valueFromPeriod(periodScores, 4, "home"),
      awayInnings1To9: "",
      homeInnings1To9: "",
      wentOvertime: periodScores.length ? periodScores.some((period) => period.isOvertimeOrExtra && ((period.away ?? 0) > 0 || (period.home ?? 0) > 0)) : null,
      periodScoresJson: JSON.stringify(periodScores),
      status: "FINAL",
      fetchedAt,
      dataSource: "NBA.com Stats API leaguegamelog + scoreboardv2",
      note: periodScores.length ? "完整 line score；分析時可用 final 或 Q1-Q4 regulation" : "缺少 period scoring"
    };
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

  const response = await fetch(url, { headers: NBA_HEADERS, next: { revalidate: 60 * 30 } });
  if (!response.ok) throw new Error(`NBA.com Stats API 無法取得：${response.status}`);

  const payload = await response.json();
  const resultSet = payload.resultSets?.[0];
  const headers: string[] = resultSet?.headers ?? [];
  return (resultSet?.rowSet ?? []).map((row: any[]) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index]]))
  );
}

async function fetchNbaScoreboardLineScores(dates: string[]) {
  const results = await runWithConcurrency(dates, 8, async (date) => {
    const url = new URL("https://stats.nba.com/stats/scoreboardv2");
    url.searchParams.set("DayOffset", "0");
    url.searchParams.set("GameDate", toNbaScoreboardDate(date));
    url.searchParams.set("LeagueID", "00");

    const response = await fetch(url, { headers: NBA_HEADERS, next: { revalidate: 60 * 30 } });
    if (!response.ok) return [];
    const payload = await response.json();
    const resultSet = payload.resultSets?.find((set: any) => set.name === "LineScore");
    const headers: string[] = resultSet?.headers ?? [];
    return (resultSet?.rowSet ?? []).map((row: any[]) =>
      Object.fromEntries(headers.map((header, index) => [header, row[index]]))
    ) as NbaLineScoreRow[];
  });

  const byGame = new Map<string, NbaLineScoreRow[]>();
  for (const lineScore of results.flat()) {
    const gameId = String(lineScore.GAME_ID ?? "");
    if (!gameId) continue;
    byGame.set(gameId, [...(byGame.get(gameId) ?? []), lineScore]);
  }
  return byGame;
}

function groupNbaGames(rows: NbaLogRow[]) {
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

function buildNbaPeriodScores(awayLine?: NbaLineScoreRow, homeLine?: NbaLineScoreRow): PeriodScore[] {
  if (!awayLine || !homeLine) return [];
  const periods: PeriodScore[] = [];
  for (let quarter = 1; quarter <= 4; quarter += 1) {
    periods.push({
      periodNumber: quarter,
      periodType: `Q${quarter}` as "Q1" | "Q2" | "Q3" | "Q4",
      away: numberOrNull(awayLine[`PTS_QTR${quarter}`]),
      home: numberOrNull(homeLine[`PTS_QTR${quarter}`]),
      isOvertimeOrExtra: false
    });
  }
  for (let overtime = 1; overtime <= 10; overtime += 1) {
    const away = numberOrNull(awayLine[`PTS_OT${overtime}`]);
    const home = numberOrNull(homeLine[`PTS_OT${overtime}`]);
    if ((away ?? 0) === 0 && (home ?? 0) === 0) continue;
    periods.push({
      periodNumber: 4 + overtime,
      periodType: "OT",
      away,
      home,
      isOvertimeOrExtra: true
    });
  }
  return periods;
}

async function runWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results: R[] = [];
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      results.push(await worker(current));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

function isFinalStatus(status: any) {
  const value = `${status?.abstractGameState ?? ""} ${status?.detailedState ?? ""}`.toLowerCase();
  return value.includes("final") || value.includes("completed");
}

function sumPeriods(periods: PeriodScore[], side: "home" | "away") {
  if (!periods.length) return null;
  return periods.reduce((sum, period) => sum + (period[side] ?? 0), 0);
}

function valueFromPeriod(periods: PeriodScore[], periodNumber: number, side: "home" | "away") {
  return periods.find((period) => period.periodNumber === periodNumber)?.[side] ?? null;
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function toNbaScoreboardDate(value: string) {
  const date = new Date(value);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${month}/${day}/${year}`;
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
