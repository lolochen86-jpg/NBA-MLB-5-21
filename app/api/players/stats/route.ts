import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const league = url.searchParams.get("league")?.toUpperCase();
  const teamId = Number(url.searchParams.get("teamId") ?? 0);
  const playerId = Number(url.searchParams.get("playerId") ?? 0);
  const season = url.searchParams.get("season");
  const rangeValue = Number(url.searchParams.get("rangeValue") ?? 15);

  if (!league || !["NBA", "MLB"].includes(league)) {
    return NextResponse.json({ error: "league 必須是 NBA 或 MLB" }, { status: 400 });
  }

  const stats = await prisma.playerGameStat.findMany({
    where: {
      league,
      ...(teamId ? { teamId } : {}),
      ...(playerId ? { playerId } : {}),
      ...(season ? { game: { is: { season } } } : {})
    },
    include: { player: true, team: true, game: true },
    orderBy: { updatedAt: "desc" },
    take: rangeValue
  });

  return NextResponse.json({
    league,
    lastUpdatedAt: stats.map((stat) => stat.updatedAt.toISOString()).sort().at(-1) ?? null,
    message: stats.length ? null : "請先同步資料",
    stats
  });
}
