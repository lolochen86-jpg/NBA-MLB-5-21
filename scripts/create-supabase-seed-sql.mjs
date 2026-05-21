import { readFileSync, writeFileSync } from "node:fs";

const seedSource = readFileSync("prisma/seed.ts", "utf8");

function readArray(name) {
  const match = seedSource.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\]);`));
  if (!match) throw new Error(`Cannot find ${name}`);
  return Function(`return ${match[1]}`)();
}

function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function teamValues(league, rows) {
  return rows
    .map(
      ([externalId, name, abbreviation, city, conference, division]) =>
        `(${sqlString(league)}, ${sqlString(externalId)}, ${sqlString(name)}, ${sqlString(
          abbreviation
        )}, ${sqlString(city)}, ${sqlString(conference)}, ${sqlString(
          division
        )}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    )
    .join(",\n");
}

const nbaTeams = readArray("nbaTeams");
const mlbTeams = readArray("mlbTeams");

const sql = `INSERT INTO "Team" ("league", "externalId", "name", "abbreviation", "city", "conference", "division", "createdAt", "updatedAt") VALUES
${teamValues("NBA", nbaTeams)},
${teamValues("MLB", mlbTeams)}
ON CONFLICT ("league", "externalId") DO UPDATE SET
  "name" = EXCLUDED."name",
  "abbreviation" = EXCLUDED."abbreviation",
  "city" = EXCLUDED."city",
  "conference" = EXCLUDED."conference",
  "division" = EXCLUDED."division",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "SourceSync" ("league", "source", "entity", "status", "message", "fetchedAt", "createdAt", "updatedAt") VALUES
('NBA', 'NBA.com Stats API', 'teams', 'SEEDED_TEAMS_ONLY', '已匯入真實球隊清單，尚未同步比賽資料', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', 'MLB StatsAPI', 'teams', 'SEEDED_TEAMS_ONLY', '已匯入真實球隊清單，尚未同步比賽資料', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("league", "source", "entity") DO UPDATE SET
  "status" = EXCLUDED."status",
  "message" = EXCLUDED."message",
  "fetchedAt" = CURRENT_TIMESTAMP,
  "updatedAt" = CURRENT_TIMESTAMP;
`;

writeFileSync("scripts/supabase-seed-teams.sql", sql);
console.log("Wrote scripts/supabase-seed-teams.sql");
