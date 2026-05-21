import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const league = url.searchParams.get("league")?.toUpperCase();

    if (!league || !["NBA", "MLB"].includes(league)) {
      return NextResponse.json({ error: "league 必須是 NBA 或 MLB" }, { status: 400 });
    }

    const games = await prisma.game.findMany({
      where: {
        league,
        gameDate: { gte: new Date() },
        status: { not: "FINAL" }
      },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { gameDate: "asc" },
      take: 12
    });

    const sync = await prisma.sourceSync.findFirst({
      where: { league },
      orderBy: { fetchedAt: "desc" }
    });

    return NextResponse.json({
      league,
      lastUpdatedAt: sync?.fetchedAt.toISOString() ?? null,
      message: games.length ? null : "資料來源目前無法取得",
      games
    });
  } catch (error) {
    console.error("Upcoming games API unavailable", error);
    return NextResponse.json({ error: "資料來源目前無法取得", games: [] }, { status: 503 });
  }
}
