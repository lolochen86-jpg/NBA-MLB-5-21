type OddsOutcome = {
  name: string;
  price: number;
};

type OddsMarket = {
  key: string;
  outcomes: OddsOutcome[];
};

type OddsBookmaker = {
  key: string;
  title: string;
  last_update?: string;
  markets: OddsMarket[];
};

type OddsEvent = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
};

export type InternationalMoneylineOdds = {
  homeOdds?: number;
  awayOdds?: number;
  homeBookmaker?: string;
  awayBookmaker?: string;
  matchedEvent?: string;
  updatedAt?: string;
};

const SPORT_KEYS: Record<string, string> = {
  NBA: "basketball_nba",
  MLB: "baseball_mlb"
};

export async function fetchInternationalMoneylineOdds(input: {
  league: string;
  homeTeam: string;
  awayTeam: string;
}): Promise<InternationalMoneylineOdds | null> {
  const apiKey = process.env.THE_ODDS_API_KEY ?? process.env.ODDS_API_KEY;
  const sport = SPORT_KEYS[input.league.toUpperCase()];
  if (!apiKey || !sport) return null;

  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", process.env.THE_ODDS_API_REGIONS ?? "us,uk,eu,au");
  url.searchParams.set("markets", "h2h");
  url.searchParams.set("oddsFormat", "decimal");
  url.searchParams.set("dateFormat", "iso");
  const bookmakers = process.env.THE_ODDS_API_BOOKMAKERS;
  if (bookmakers) url.searchParams.set("bookmakers", bookmakers);

  const response = await fetch(url, { next: { revalidate: 60 * 5 } });
  if (!response.ok) throw new Error(`The Odds API unavailable: ${response.status}`);

  const events = (await response.json()) as OddsEvent[];
  const event = findMatchingEvent(events, input.homeTeam, input.awayTeam);
  if (!event) return null;

  let bestHome: { odds: number; bookmaker: string; updatedAt?: string } | undefined;
  let bestAway: { odds: number; bookmaker: string; updatedAt?: string } | undefined;

  for (const bookmaker of event.bookmakers ?? []) {
    const market = bookmaker.markets?.find((item) => item.key === "h2h");
    if (!market) continue;

    const home = findOutcome(market.outcomes, event.home_team);
    const away = findOutcome(market.outcomes, event.away_team);
    if (home && (!bestHome || home.price > bestHome.odds)) {
      bestHome = { odds: home.price, bookmaker: bookmaker.title, updatedAt: bookmaker.last_update };
    }
    if (away && (!bestAway || away.price > bestAway.odds)) {
      bestAway = { odds: away.price, bookmaker: bookmaker.title, updatedAt: bookmaker.last_update };
    }
  }

  return {
    homeOdds: bestHome?.odds,
    awayOdds: bestAway?.odds,
    homeBookmaker: bestHome?.bookmaker,
    awayBookmaker: bestAway?.bookmaker,
    matchedEvent: `${event.away_team} @ ${event.home_team}`,
    updatedAt: bestHome?.updatedAt ?? bestAway?.updatedAt
  };
}

function findMatchingEvent(events: OddsEvent[], homeTeam: string, awayTeam: string) {
  const home = normalizeTeam(homeTeam);
  const away = normalizeTeam(awayTeam);
  return events.find((event) => {
    const eventHome = normalizeTeam(event.home_team);
    const eventAway = normalizeTeam(event.away_team);
    return teamsMatch(eventHome, home) && teamsMatch(eventAway, away);
  });
}

function findOutcome(outcomes: OddsOutcome[], team: string) {
  const wanted = normalizeTeam(team);
  return outcomes.find((outcome) => teamsMatch(normalizeTeam(outcome.name), wanted));
}

function teamsMatch(a: string, b: string) {
  return a === b || a.includes(b) || b.includes(a);
}

function normalizeTeam(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(the|fc|club)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}
