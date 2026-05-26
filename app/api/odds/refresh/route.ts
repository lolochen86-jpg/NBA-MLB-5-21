import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeOddsSnapshot, type OddsApiEvent, type OddsLeague } from "@/lib/odds-normalizer";

export const dynamic = "force-dynamic";

const SPORT_KEYS: Record<OddsLeague, string> = {
  NBA: "basketball_nba",
  MLB: "baseball_mlb"
};

const VALID_LEAGUES = new Set(["NBA", "MLB", "ALL"]);

export async function GET(request: Request) {
  const apiKey = process.env.THE_ODDS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API key missing" }, { status: 500 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "network error" }, { status: 500 });
  }

  const url = new URL(request.url);
  const leagueParam = (url.searchParams.get("league") ?? "ALL").toUpperCase();
  if (!VALID_LEAGUES.has(leagueParam)) {
    return NextResponse.json({ error: "invalid league" }, { status: 400 });
  }

  const leagues = leagueParam === "ALL" ? (["NBA", "MLB"] as OddsLeague[]) : ([leagueParam] as OddsLeague[]);

  try {
    const results = await Promise.all(leagues.map((league) => refreshLeague(league, apiKey)));
    return NextResponse.json({
      ok: true,
      leagues: results,
      totalGames: results.reduce((sum, item) => sum + item.games, 0),
      totalSnapshots: results.reduce((sum, item) => sum + item.snapshots, 0)
    });
  } catch (error) {
    if (error instanceof OddsApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Odds refresh failed", error);
    return NextResponse.json({ error: "network error" }, { status: 502 });
  }
}

async function refreshLeague(league: OddsLeague, apiKey: string) {
  const fetchedAt = new Date();
  const events = await fetchOddsApiEvents(league, apiKey);
  let snapshotCount = 0;

  for (const event of events) {
    const snapshots = filterOutlierSnapshots(normalizeOddsSnapshot(event, league, fetchedAt));
    if (!snapshots.length) continue;

    const game = await prisma.oddsGame.upsert({
      where: { league_externalGameId: { league, externalGameId: event.id } },
      update: {
        commenceTime: new Date(event.commence_time),
        gameTime: new Date(event.commence_time),
        homeTeam: event.home_team,
        awayTeam: event.away_team
      },
      create: {
        league,
        externalGameId: event.id,
        commenceTime: new Date(event.commence_time),
        gameTime: new Date(event.commence_time),
        homeTeam: event.home_team,
        awayTeam: event.away_team
      }
    });

    await prisma.oddsSnapshot.createMany({
      data: snapshots.map((snapshot) => ({
        gameId: game.id,
        league: snapshot.league,
        sportsbook: snapshot.sportsbook,
        bookmaker: snapshot.sportsbook,
        market: snapshot.market,
        marketType: toLegacyMarketType(snapshot.market),
        side: snapshot.side,
        line: snapshot.line,
        decimalOdds: snapshot.decimalOdds,
        impliedProbability: snapshot.impliedProbability,
        snapshotTime: new Date(snapshot.snapshotTime),
        source: snapshot.source
      }))
    });

    snapshotCount += snapshots.length;
  }

  return { league, games: events.length, snapshots: snapshotCount };
}

async function fetchOddsApiEvents(league: OddsLeague, apiKey: string) {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${SPORT_KEYS[league]}/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("markets", "h2h,spreads,totals");
  url.searchParams.set("regions", "us,eu,uk,au");
  url.searchParams.set("oddsFormat", "decimal");
  url.searchParams.set("dateFormat", "iso");

  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch {
    throw new OddsApiError("network error", 502);
  }

  if (response.status === 401 || response.status === 403) {
    throw new OddsApiError("API key missing", 401);
  }

  if (response.status === 429) {
    throw new OddsApiError("API limit exceeded", 429);
  }

  if (!response.ok) {
    throw new OddsApiError("network error", response.status);
  }

  return (await response.json()) as OddsApiEvent[];
}

class OddsApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}



function filterOutlierSnapshots(rows: ReturnType<typeof normalizeOddsSnapshot>) {
  if (rows.length < 3) return rows;

  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.market}|${row.side}|${row.line ?? "null"}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(row);
    grouped.set(key, bucket);
  }

  const kept: typeof rows = [];
  for (const bucket of grouped.values()) {
    if (bucket.length < 3) {
      kept.push(...bucket);
      continue;
    }

    const baseline = median(bucket.map((item) => item.decimalOdds));
    for (const item of bucket) {
      const ratio = item.decimalOdds / baseline;
      if (ratio >= 0.7 && ratio <= 1.3) {
        kept.push(item);
      }
    }
  }

  return kept;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function toLegacyMarketType(market: string) {
  if (market === "h2h") return "moneyline";
  if (market === "spreads") return "spread";
  return "totals";
}
