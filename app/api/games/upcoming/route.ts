import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchUpcomingMatchups } from "@/lib/upcoming-matchups";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const league = url.searchParams.get("league")?.toUpperCase();

    if (!league || !["NBA", "MLB"].includes(league)) {
      return NextResponse.json({ error: "league must be NBA or MLB" }, { status: 400 });
    }

    const now = new Date();
    const soon = new Date(now);
    soon.setUTCDate(soon.getUTCDate() + 7);
    const games = await prisma.game.findMany({
      where: {
        league,
        gameDate: { gte: now, lte: soon },
        status: { notIn: ["FINAL", "Postponed"] }
      },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { gameDate: "asc" },
      take: 12
    });

    const sync = await prisma.sourceSync.findFirst({
      where: { league },
      orderBy: { fetchedAt: "desc" }
    });
    const fallbackGames = games.length ? [] : await fetchUpcomingMatchups(league);

    return NextResponse.json({
      league,
      lastUpdatedAt: sync?.fetchedAt.toISOString() ?? null,
      message: games.length || fallbackGames.length ? null : "Data source currently unavailable",
      games: games.length ? games : fallbackGames
    });
  } catch (error) {
    console.error("Upcoming games API unavailable", error);
    return NextResponse.json({ error: "Data source currently unavailable", games: [] }, { status: 503 });
  }
}
