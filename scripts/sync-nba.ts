import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const NBA_TEAMS_URL = "https://stats.nba.com/stats/leaguedashteamstats?LeagueID=00&PerMode=Totals&Season=2025-26&SeasonType=Regular%20Season";

async function main() {
  const fetchedAt = new Date();
  try {
    const response = await fetch(NBA_TEAMS_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json, text/plain, */*",
        Origin: "https://www.nba.com",
        Referer: "https://www.nba.com/"
      }
    });
    if (!response.ok) throw new Error(`NBA.com stats failed: ${response.status}`);
    const data = await response.json();

    await prisma.sourceSync.upsert({
      where: { league_source_entity: { league: "NBA", source: "NBA.com Stats API", entity: "teams" } },
      update: { status: "OK", message: "NBA.com reachable; detailed game sync is phase 2", fetchedAt },
      create: { league: "NBA", source: "NBA.com Stats API", entity: "teams", status: "OK", message: "NBA.com reachable; detailed game sync is phase 2", fetchedAt }
    });

    console.log(JSON.stringify({ message: "NBA.com reachable", resultSets: data.resultSets?.length ?? 0 }, null, 2));
  } catch (error) {
    await prisma.sourceSync.upsert({
      where: { league_source_entity: { league: "NBA", source: "NBA.com Stats API", entity: "teams" } },
      update: { status: "FAILED", message: error instanceof Error ? error.message : "unknown error", fetchedAt },
      create: { league: "NBA", source: "NBA.com Stats API", entity: "teams", status: "FAILED", message: error instanceof Error ? error.message : "unknown error", fetchedAt }
    });
    throw error;
  }
}

main()
  .finally(async () => prisma.$disconnect());
