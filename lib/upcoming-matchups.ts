export type UpcomingMatchup = {
  id: string;
  league: "NBA" | "MLB";
  gameDate: string;
  awayTeam: string;
  homeTeam: string;
  awayAbbreviation: string;
  homeAbbreviation: string;
  status: string;
  dataSource: string;
};

type NbaHeaderRow = Record<string, string | number | null>;

const NBA_HEADERS = {
  Accept: "application/json, text/plain, */*",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
};

export async function fetchUpcomingMatchups(league: string): Promise<UpcomingMatchup[]> {
  if (league.toUpperCase() === "MLB") return fetchMlbUpcoming();
  if (league.toUpperCase() === "NBA") return fetchNbaUpcoming();
  return [];
}

async function fetchMlbUpcoming(): Promise<UpcomingMatchup[]> {
  const url = new URL("https://statsapi.mlb.com/api/v1/schedule");
  url.searchParams.set("sportId", "1");
  url.searchParams.set("startDate", todayIsoDate());
  url.searchParams.set("endDate", addDaysIsoDate(14));
  url.searchParams.set("gameTypes", "R,P");

  const response = await fetch(url, { next: { revalidate: 60 * 15 } });
  if (!response.ok) return [];

  const payload = await response.json();
  const games = (payload.dates ?? []).flatMap((date: any) => date.games ?? []);
  return games
    .filter((game: any) => isUpcomingStatus(game.status))
    .slice(0, 30)
    .map((game: any) => ({
      id: String(game.gamePk),
      league: "MLB",
      gameDate: game.officialDate ?? game.gameDate,
      awayTeam: game.teams?.away?.team?.name ?? "",
      homeTeam: game.teams?.home?.team?.name ?? "",
      awayAbbreviation: mlbAbbreviation(game.teams?.away?.team?.name),
      homeAbbreviation: mlbAbbreviation(game.teams?.home?.team?.name),
      status: game.status?.detailedState ?? "Scheduled",
      dataSource: "MLB StatsAPI schedule"
    }));
}

async function fetchNbaUpcoming(): Promise<UpcomingMatchup[]> {
  const allGames: UpcomingMatchup[] = [];
  for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
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
          status: String(game.GAME_STATUS_TEXT ?? "Scheduled"),
          dataSource: "NBA.com Stats API scoreboardv2"
        }))
    );
    if (allGames.length >= 30) break;
  }
  return allGames.slice(0, 30);
}

function isUpcomingStatus(status: any) {
  const value = `${status?.abstractGameState ?? ""} ${status?.detailedState ?? ""}`.toLowerCase();
  return value.includes("preview") || value.includes("scheduled") || value.includes("pre-game");
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
