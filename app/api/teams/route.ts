import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const league = url.searchParams.get("league")?.toUpperCase();

  if (!league || !["NBA", "MLB"].includes(league)) {
    return NextResponse.json({ error: "league 必須是 NBA 或 MLB" }, { status: 400 });
  }

  const teams = await prisma.team.findMany({
    where: { league },
    orderBy: [{ city: "asc" }, { name: "asc" }]
  });

  const latest = teams.map((team) => team.updatedAt.toISOString()).sort().at(-1) ?? null;
  return NextResponse.json({ league, lastUpdatedAt: latest, teams });
}
