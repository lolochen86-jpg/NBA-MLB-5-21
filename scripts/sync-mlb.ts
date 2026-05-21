import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const MLB_API = "https://statsapi.mlb.com/api/v1";

type MlbTeam = {
  id: number;
  name: string;
  abbreviation?: string;
  teamName?: string;
  locationName?: string;
  league?: { name?: string };
  division?: { name?: string };
};

async function main() {
  const fetchedAt = new Date();
  try {
    const response = await fetch(`${MLB_API}/teams?sportId=1&activeStatus=Y`);
    if (!response.ok) throw new Error(`MLB StatsAPI teams failed: ${response.status}`);
    const data = (await response.json()) as { teams: MlbTeam[] };

    for (const team of data.teams) {
      await prisma.team.upsert({
        where: { league_externalId: { league: "MLB", externalId: String(team.id) } },
        update: {
          name: team.name,
          abbreviation: team.abbreviation ?? team.teamName ?? team.name,
          city: team.locationName,
          conference: team.league?.name,
          division: team.division?.name
        },
        create: {
          league: "MLB",
          externalId: String(team.id),
          name: team.name,
          abbreviation: team.abbreviation ?? team.teamName ?? team.name,
          city: team.locationName,
          conference: team.league?.name,
          division: team.division?.name
        }
      });
    }

    await prisma.sourceSync.upsert({
      where: { league_source_entity: { league: "MLB", source: "MLB StatsAPI", entity: "teams" } },
      update: { status: "OK", message: `synced ${data.teams.length} teams`, fetchedAt },
      create: { league: "MLB", source: "MLB StatsAPI", entity: "teams", status: "OK", message: `synced ${data.teams.length} teams`, fetchedAt }
    });
  } catch (error) {
    await prisma.sourceSync.upsert({
      where: { league_source_entity: { league: "MLB", source: "MLB StatsAPI", entity: "teams" } },
      update: { status: "FAILED", message: error instanceof Error ? error.message : "unknown error", fetchedAt },
      create: { league: "MLB", source: "MLB StatsAPI", entity: "teams", status: "FAILED", message: error instanceof Error ? error.message : "unknown error", fetchedAt }
    });
    throw error;
  }
}

main()
  .finally(async () => prisma.$disconnect());
