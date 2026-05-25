const fs = require("fs");
const path = require("path");

for (const line of fs.readFileSync(path.join(process.cwd(), ".env"), "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!match) continue;
  process.env[match[1]] = match[2].replace(/^"|"$/g, "");
}

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const sql = fs.readFileSync(path.join(process.cwd(), "scripts", "supabase-odds-schema.sql"), "utf8");
  const statements = sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  console.log("odds_schema=ok");
}

main()
  .catch((error) => {
    console.log("odds_schema=error");
    console.log(error.code || error.message);
    console.log(error.meta || {});
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
