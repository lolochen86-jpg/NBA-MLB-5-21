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
  wentOvertime: boolean | null;
  status: string;
  includeOvertime: boolean;
  fetchedAt: string;
  dataSource: string;
  note: string;
};

type NbaLogRow = Record<string, string | number | null>;

export async function fetchCurrentSeasonGames(input: {
  league: string;
  season?: string | null;
  seasonType?: string | null;
}) {
  const league = input.league.toUpperCase();
  if (league === "MLB") {
    return fetchMlbCurrentSeason(input.season ?? currentMlbSeason(), input.seasonType ?? "Regular Season");
  }
  if (league === "NBA") {
    return fetchNbaCurrentSeason(input.season ?? currentNbaSeason(), input.seasonType ?? "Regular Season");
  }
  throw new Error("league 必須是 NBA 或 MLB");
}

async function fetchMlbCurrentSeason(season: string, seasonType: string): Promise<CurrentSeasonGameRow[]> {
  const fetchedAt = new Date().toISOString();
  const url = new URL("https://statsapi.mlb.com/api/v1/schedule");
  url.searchParams.set("sportId", "1");
  url.searchParams.set("season", season);
  url.searchParams.set("gameTypes", seasonType === "Playoffs" ? "P" : "R");
  url.searchParams.set("hydrate", "linescore");
  url.searchParams.set("startDate", `${season}-03-01`);
  url.searchParams.set("endDate", todayIsoDate());

  const response = await fetch(url, { next: { revalidate: 60 * 30 } });
  if (!response.ok) throw new Error(`MLB StatsAPI 無法取得：${response.status}`);

  const payload = await response.json();
  const games = (payload.dates ?? []).flatMap((date: any) => date.games ?? []);

  return games
    .filter((game: any) => isFinalStatus(game.status))
    .map((game: any) => {
      const innings = game.linescore?.innings ?? [];
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
        awayScoreRegulation: sumInnings(innings, "away", 9),
        homeScoreRegulation: sumInnings(innings, "home", 9),
        wentOvertime: innings.length > 9,
        status: game.status?.detailedState ?? "FINAL",
        includeOvertime: true,
        fetchedAt,
        dataSource: "MLB StatsAPI schedule?hydrate=linescore",
        note: innings.length ? "final R；regulation 為 1-9 局加總" : "缺少 linescore，無法計算不含延長賽"
      };
    });
}

async function fetchNbaCurrentSeason(season: string, seasonType: string): Promise<CurrentSeasonGameRow[]> {
  const fetchedAt = new Date().toISOString();
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

  const response = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      Origin: "https://www.nba.com",
      Referer: "https://www.nba.com/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
    },
    next: { revalidate: 60 * 30 }
  });
  if (!response.ok) throw new Error(`NBA.com Stats API 無法取得：${response.status}`);

  const payload = await response.json();
  const resultSet = payload.resultSets?.[0];
  const headers: string[] = resultSet?.headers ?? [];
  const rows: NbaLogRow[] = (resultSet?.rowSet ?? []).map((row: any[]) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index]]))
  );

  const grouped = new Map<string, NbaLogRow[]>();
  for (const row of rows) {
    const gameId = String(row.GAME_ID ?? "");
    if (!gameId) continue;
    grouped.set(gameId, [...(grouped.get(gameId) ?? []), row]);
  }

  const output: CurrentSeasonGameRow[] = [];
  for (const [gameId, gameRows] of grouped.entries()) {
    const home = gameRows.find((row) => String(row.MATCHUP ?? "").includes(" vs. "));
    const away = gameRows.find((row) => String(row.MATCHUP ?? "").includes(" @ "));
    if (!home || !away) continue;

    output.push({
      league: "NBA",
      season,
      seasonType,
      externalGameId: gameId,
      gameDate: String(home.GAME_DATE ?? away.GAME_DATE ?? ""),
      awayTeam: String(away.TEAM_NAME ?? away.TEAM_ABBREVIATION ?? ""),
      homeTeam: String(home.TEAM_NAME ?? home.TEAM_ABBREVIATION ?? ""),
      awayScoreFinal: numberOrNull(away.PTS),
      homeScoreFinal: numberOrNull(home.PTS),
      awayScoreRegulation: null,
      homeScoreRegulation: null,
      wentOvertime: null,
      status: "FINAL",
      includeOvertime: true,
      fetchedAt,
      dataSource: "NBA.com Stats API leaguegamelog",
      note: "NBA leaguegamelog 提供 final score；不含延長賽需另抓逐場 period scoring"
    });
  }

  return output;
}

function isFinalStatus(status: any) {
  const value = `${status?.abstractGameState ?? ""} ${status?.detailedState ?? ""}`.toLowerCase();
  return value.includes("final") || value.includes("completed");
}

function sumInnings(innings: any[], side: "home" | "away", limit: number) {
  if (!innings.length) return null;
  return innings.slice(0, limit).reduce((sum, inning) => sum + (numberOrNull(inning?.[side]?.runs) ?? 0), 0);
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
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
