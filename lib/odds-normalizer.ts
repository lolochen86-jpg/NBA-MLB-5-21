export type OddsLeague = "NBA" | "MLB";
export type OddsMarketKey = "h2h" | "spreads" | "totals";

export type OddsApiOutcome = {
  name: string;
  price: number;
  point?: number;
};

export type OddsApiMarket = {
  key: string;
  outcomes?: OddsApiOutcome[];
};

export type OddsApiBookmaker = {
  key: string;
  title: string;
  last_update?: string;
  markets?: OddsApiMarket[];
};

export type OddsApiEvent = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: OddsApiBookmaker[];
};

export type NormalizedOddsSnapshot = {
  league: OddsLeague;
  externalGameId: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  sportsbook: string;
  market: OddsMarketKey;
  side: string;
  line: number | null;
  decimalOdds: number;
  impliedProbability: number;
  snapshotTime: string;
  source: "the-odds-api";
};

const MARKET_KEYS = new Set(["h2h", "spreads", "totals"]);

export function americanToDecimal(americanOdds: number) {
  if (americanOdds === 0) {
    throw new Error("American odds cannot be zero");
  }

  const decimal = americanOdds > 0 ? 1 + americanOdds / 100 : 1 + 100 / Math.abs(americanOdds);
  return roundOdds(decimal);
}

export function decimalToImpliedProbability(decimalOdds: number) {
  if (decimalOdds <= 1) {
    throw new Error("Decimal odds must be greater than 1");
  }

  return 1 / decimalOdds;
}

export function normalizeOddsSnapshot(event: OddsApiEvent, league: OddsLeague, fetchedAt = new Date()) {
  const rows: NormalizedOddsSnapshot[] = [];

  for (const bookmaker of event.bookmakers ?? []) {
    for (const market of bookmaker.markets ?? []) {
      if (!MARKET_KEYS.has(market.key)) continue;

      for (const outcome of market.outcomes ?? []) {
        const decimalOdds = normalizePrice(outcome.price);
        const marketKey = market.key as OddsMarketKey;
        rows.push({
          league,
          externalGameId: event.id,
          commenceTime: event.commence_time,
          homeTeam: event.home_team,
          awayTeam: event.away_team,
          sportsbook: bookmaker.title || bookmaker.key,
          market: marketKey,
          side: normalizeSide(marketKey, outcome.name),
          line: normalizeLine(marketKey, outcome.point),
          decimalOdds,
          impliedProbability: decimalToImpliedProbability(decimalOdds),
          snapshotTime: bookmaker.last_update ?? fetchedAt.toISOString(),
          source: "the-odds-api"
        });
      }
    }
  }

  return rows;
}

function normalizePrice(price: number) {
  if (!Number.isFinite(price)) {
    throw new Error("Invalid odds price");
  }

  return price > 0 && price < 100 ? roundOdds(price) : americanToDecimal(price);
}

function normalizeSide(market: OddsMarketKey, name: string) {
  if (market !== "totals") return name;
  return name.toLowerCase().startsWith("over") ? "Over" : "Under";
}

function normalizeLine(market: OddsMarketKey, point?: number) {
  if (market === "h2h" || typeof point !== "number") return null;
  return point;
}

function roundOdds(value: number) {
  return Math.round(value * 100) / 100;
}
