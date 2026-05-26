export type UpcomingMatchup = {
  id: string;
  league: "NBA" | "MLB";
  gameDate: string;
  awayTeam: string;
  homeTeam: string;
  awayAbbreviation: string;
  homeAbbreviation: string;
  awayExternalId?: string;
  homeExternalId?: string;
  status: string;
  dataSource: string;
  seasonType?: "Regular Season" | "Playoffs";
};

type NbaHeaderRow = Record<string, string | number | null>;

const NBA_HEADERS = {
  Accept: "application/json, text/plain, */*",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
};
const NBA_SCHEDULE_URL = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json";
const UPCOMING_WINDOW_DAYS = 7;

export async function fetchUpcomingMatchups(league: string): Promise<UpcomingMatchup[]> {
  if (league.toUpperCase() === "MLB") return fetchMlbUpcoming();
  if (league.toUpperCase() === "NBA") return fetchNbaUpcoming();
  return [];
}

async function fetchMlbUpcoming(): Promise<UpcomingMatchup[]> {
  const mlbToday = dateInTimeZone("America/New_York");

  for (let dayOffset = 0; dayOffset < 5; dayOffset += 1) {
    const scheduleDate = addDaysToIsoDate(mlbToday, dayOffset);
    const url = new URL("https://statsapi.mlb.com/api/v1/schedule");
    url.searchParams.set("sportId", "1");
    url.searchParams.set("date", scheduleDate);
    url.searchParams.set("gameTypes", "R,P");

    const response = await fetch(url, { next: { revalidate: 60 * 15 } });
    if (!response.ok) continue;

    const payload = await response.json();
    const games = (payload.dates ?? []).flatMap((date: any) => date.games ?? []);
    const activeGames = games
      .filter((game: any) => isMlbSelectableStatus(game.status))
      .sort((a: any, b: any) => Date.parse(a.gameDate ?? a.officialDate ?? "") - Date.parse(b.gameDate ?? b.officialDate ?? ""));

    if (activeGames.length) {
      return activeGames.slice(0, 12).map((game: any) => ({
        id: String(game.gamePk),
        league: "MLB",
        gameDate: game.officialDate ?? game.gameDate,
        awayTeam: game.teams?.away?.team?.name ?? "",
        homeTeam: game.teams?.home?.team?.name ?? "",
        awayAbbreviation: mlbAbbreviation(game.teams?.away?.team?.name),
        homeAbbreviation: mlbAbbreviation(game.teams?.home?.team?.name),
        awayExternalId: String(game.teams?.away?.team?.id ?? ""),
        homeExternalId: String(game.teams?.home?.team?.id ?? ""),
        status: game.status?.detailedState ?? "Scheduled",
        dataSource: "MLB StatsAPI schedule",
        seasonType: game.gameType === "P" ? "Playoffs" : "Regular Season"
      }));
    }
  }

  return [];
}

async function fetchNbaUpcoming(): Promise<UpcomingMatchup[]> {
  const scheduleLeague = await fetchNbaUpcomingFromScheduleLeague();
  if (scheduleLeague.length) return scheduleLeague;

  const allGames: UpcomingMatchup[] = [];
  for (let dayOffset = 0; dayOffset < 5; dayOffset += 1) {
    const date = addDaysIsoDate(dayOffset);
    const url = new URL("https://stats.nba.com/stats/scoreboardv2");
    url.searchParams.set("DayOffset", "0");
    url.searchParams.set("GameDate", toNbaScoreboardDate(date));
    url.searchParams.set("LeagueID", "00");

    const response = await fetch(url, { headers: NBA_HEADERS, next: { revalidate: 60 * 15 } });
    if (!response.ok) continue;
    const payload = await response.json();
    const headerSet = payload.resultSets?.find((set: any) => set.name === "GameHeader");
    const headers: string[] = headerSet?.headers ?? [];
    const games: NbaHeaderRow[] = (headerSet?.rowSet ?? []).map((row: any[]) =>
      Object.fromEntries(headers.map((header, index) => [header, row[index]]))
    );

    allGames.push(
      ...games
        .filter((game) => isNbaUpcomingStatus(game.GAME_STATUS_TEXT))
        .map((game) => ({
          id: String(game.GAME_ID),
          league: "NBA" as const,
          gameDate: String(game.GAME_DATE_EST ?? date),
          awayTeam: nbaTeamName(String(game.VISITOR_TEAM_ID ?? "")),
          homeTeam: nbaTeamName(String(game.HOME_TEAM_ID ?? "")),
          awayAbbreviation: nbaAbbreviation(String(game.VISITOR_TEAM_ID ?? "")),
          homeAbbreviation: nbaAbbreviation(String(game.HOME_TEAM_ID ?? "")),
          awayExternalId: String(game.VISITOR_TEAM_ID ?? ""),
          homeExternalId: String(game.HOME_TEAM_ID ?? ""),
          status: String(game.GAME_STATUS_TEXT ?? "Scheduled"),
          dataSource: "NBA.com Stats API scoreboardv2",
          seasonType: nbaSeasonTypeFromGameId(game.GAME_ID)
        }))
    );
    if (allGames.length >= 12) break;
  }
  return allGames.slice(0, 12);
}

async function fetchNbaUpcomingFromScheduleLeague(): Promise<UpcomingMatchup[]> {
  const response = await fetch(NBA_SCHEDULE_URL, { headers: NBA_HEADERS, next: { revalidate: 60 * 15 } });
  if (!response.ok) return [];

  const payload = await response.json();
  const games = (payload.leagueSchedule?.gameDates ?? []).flatMap((date: any) => date.games ?? []);
  const now = Date.now();
  const windowEnd = now + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  return games
    .filter((game: any) => Number(game.gameStatus) !== 3)
    .filter((game: any) => hasResolvedNbaTeams(game))
    .filter((game: any) => {
      const gameTime = Date.parse(game.gameDateTimeUTC ?? game.gameDateUTC ?? "");
      return gameTime >= now && gameTime <= windowEnd;
    })
    .sort((a: any, b: any) => Date.parse(a.gameDateTimeUTC ?? a.gameDateUTC ?? "") - Date.parse(b.gameDateTimeUTC ?? b.gameDateUTC ?? ""))
    .slice(0, 12)
    .map((game: any) => ({
      id: String(game.gameId),
      league: "NBA" as const,
      gameDate: String(game.gameDateTimeUTC ?? game.gameDateUTC ?? ""),
      awayTeam: nbaScheduleTeamName(game.awayTeam),
      homeTeam: nbaScheduleTeamName(game.homeTeam),
      awayAbbreviation: String(game.awayTeam?.teamTricode ?? ""),
      homeAbbreviation: String(game.homeTeam?.teamTricode ?? ""),
      awayExternalId: String(game.awayTeam?.teamId ?? ""),
      homeExternalId: String(game.homeTeam?.teamId ?? ""),
      status: String(game.gameStatusText ?? "Scheduled"),
      dataSource: "NBA.com CDN scheduleLeagueV2",
      seasonType: isNbaPlayoffGame(game) ? "Playoffs" : "Regular Season"
    }));
}

function hasResolvedNbaTeams(game: any) {
  const awayId = String(game.awayTeam?.teamId ?? "");
  const homeId = String(game.homeTeam?.teamId ?? "");
  const awayCode = String(game.awayTeam?.teamTricode ?? "");
  const homeCode = String(game.homeTeam?.teamTricode ?? "");
  return Boolean(awayCode && homeCode && awayId !== "0" && homeId !== "0");
}

function isNbaPlayoffGame(game: any) {
  const label = `${game.gameLabel ?? ""} ${game.gameSubLabel ?? ""} ${game.seriesText ?? ""}`.toLowerCase();
  return String(game.gameId ?? "").startsWith("004") || label.includes("playoff") || label.includes("conference") || label.includes("final");
}

function nbaSeasonTypeFromGameId(gameId: unknown): UpcomingMatchup["seasonType"] {
  return String(gameId ?? "").startsWith("004") ? "Playoffs" : "Regular Season";
}

function isUpcomingStatus(status: any) {
  const value = `${status?.abstractGameState ?? ""} ${status?.detailedState ?? ""}`.toLowerCase();
  return value.includes("preview") || value.includes("scheduled") || value.includes("pre-game");
}

function isMlbSelectableStatus(status: any) {
  const value = `${status?.abstractGameState ?? ""} ${status?.detailedState ?? ""}`.toLowerCase();
  if (value.includes("final") || value.includes("game over") || value.includes("postponed") || value.includes("cancelled")) return false;
  return (
    value.includes("preview") ||
    value.includes("scheduled") ||
    value.includes("pre-game") ||
    value.includes("warmup") ||
    value.includes("in progress") ||
    value.includes("live") ||
    value.includes("delayed")
  );
}

function isNbaUpcomingStatus(value: unknown) {
  const text = String(value ?? "").toLowerCase();
  return text.includes("et") || text.includes("scheduled") || text.includes("pm") || text.includes("am");
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIsoDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateInTimeZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDaysToIsoDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toNbaScoreboardDate(value: string) {
  const date = new Date(value);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${month}/${day}/${year}`;
}

const nbaTeamsById: Record<string, [string, string]> = {
  "1610612737": ["ATL", "Atlanta Hawks"],
  "1610612738": ["BOS", "Boston Celtics"],
  "1610612751": ["BKN", "Brooklyn Nets"],
  "1610612766": ["CHA", "Charlotte Hornets"],
  "1610612741": ["CHI", "Chicago Bulls"],
  "1610612739": ["CLE", "Cleveland Cavaliers"],
  "1610612742": ["DAL", "Dallas Mavericks"],
  "1610612743": ["DEN", "Denver Nuggets"],
  "1610612765": ["DET", "Detroit Pistons"],
  "1610612744": ["GSW", "Golden State Warriors"],
  "1610612745": ["HOU", "Houston Rockets"],
  "1610612754": ["IND", "Indiana Pacers"],
  "1610612746": ["LAC", "LA Clippers"],
  "1610612747": ["LAL", "Los Angeles Lakers"],
  "1610612763": ["MEM", "Memphis Grizzlies"],
  "1610612748": ["MIA", "Miami Heat"],
  "1610612749": ["MIL", "Milwaukee Bucks"],
  "1610612750": ["MIN", "Minnesota Timberwolves"],
  "1610612740": ["NOP", "New Orleans Pelicans"],
  "1610612752": ["NYK", "New York Knicks"],
  "1610612760": ["OKC", "Oklahoma City Thunder"],
  "1610612753": ["ORL", "Orlando Magic"],
  "1610612755": ["PHI", "Philadelphia 76ers"],
  "1610612756": ["PHX", "Phoenix Suns"],
  "1610612757": ["POR", "Portland Trail Blazers"],
  "1610612758": ["SAC", "Sacramento Kings"],
  "1610612759": ["SAS", "San Antonio Spurs"],
  "1610612761": ["TOR", "Toronto Raptors"],
  "1610612762": ["UTA", "Utah Jazz"],
  "1610612764": ["WAS", "Washington Wizards"]
};

function nbaAbbreviation(id: string) {
  return nbaTeamsById[id]?.[0] ?? "";
}

function nbaTeamName(id: string) {
  return nbaTeamsById[id]?.[1] ?? "";
}

function nbaScheduleTeamName(team: any) {
  return [team?.teamCity, team?.teamName].filter(Boolean).join(" ");
}

const mlbNameToAbbreviation: Record<string, string> = {
  "Arizona Diamondbacks": "ARI",
  "Atlanta Braves": "ATL",
  "Baltimore Orioles": "BAL",
  "Boston Red Sox": "BOS",
  "Chicago Cubs": "CHC",
  "Chicago White Sox": "CWS",
  "Cincinnati Reds": "CIN",
  "Cleveland Guardians": "CLE",
  "Colorado Rockies": "COL",
  "Detroit Tigers": "DET",
  "Houston Astros": "HOU",
  "Kansas City Royals": "KC",
  "Los Angeles Angels": "LAA",
  "Los Angeles Dodgers": "LAD",
  "Miami Marlins": "MIA",
  "Milwaukee Brewers": "MIL",
  "Minnesota Twins": "MIN",
  "New York Mets": "NYM",
  "New York Yankees": "NYY",
  Athletics: "ATH",
  "Philadelphia Phillies": "PHI",
  "Pittsburgh Pirates": "PIT",
  "San Diego Padres": "SD",
  "San Francisco Giants": "SF",
  "Seattle Mariners": "SEA",
  "St. Louis Cardinals": "STL",
  "Tampa Bay Rays": "TB",
  "Texas Rangers": "TEX",
  "Toronto Blue Jays": "TOR",
  "Washington Nationals": "WSH"
};

function mlbAbbreviation(name: string) {
  return mlbNameToAbbreviation[name] ?? "";
}
