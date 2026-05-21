import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const dbPath = join(process.cwd(), "prisma", "dev.db");
mkdirSync(dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "Team" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "league" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "abbreviation" TEXT NOT NULL,
  "city" TEXT,
  "conference" TEXT,
  "division" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "Game" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "league" TEXT NOT NULL,
  "externalGameId" TEXT NOT NULL,
  "season" TEXT NOT NULL,
  "seasonType" TEXT NOT NULL,
  "gameDate" DATETIME NOT NULL,
  "homeTeamId" INTEGER NOT NULL,
  "awayTeamId" INTEGER NOT NULL,
  "homeScoreFinal" INTEGER,
  "awayScoreFinal" INTEGER,
  "homeScoreRegulation" INTEGER,
  "awayScoreRegulation" INTEGER,
  "wentOvertime" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL,
  "rawJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Game_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Game_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "GamePeriodScore" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "gameId" INTEGER NOT NULL,
  "teamId" INTEGER NOT NULL,
  "periodNumber" INTEGER NOT NULL,
  "periodType" TEXT NOT NULL,
  "runsOrPoints" INTEGER NOT NULL,
  "isOvertimeOrExtra" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "GamePeriodScore_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GamePeriodScore_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Player" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "league" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "teamId" INTEGER,
  "position" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "PlayerGameStat" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "league" TEXT NOT NULL,
  "gameId" INTEGER NOT NULL,
  "playerId" INTEGER NOT NULL,
  "teamId" INTEGER NOT NULL,
  "minutes" REAL,
  "points" INTEGER,
  "rebounds" INTEGER,
  "assists" INTEGER,
  "steals" INTEGER,
  "blocks" INTEGER,
  "turnovers" INTEGER,
  "fgPct" REAL,
  "threePtPct" REAL,
  "ftPct" REAL,
  "plusMinus" REAL,
  "atBats" INTEGER,
  "runs" INTEGER,
  "hits" INTEGER,
  "homeRuns" INTEGER,
  "rbi" INTEGER,
  "walks" INTEGER,
  "strikeouts" INTEGER,
  "inningsPitched" REAL,
  "earnedRuns" INTEGER,
  "era" REAL,
  "whip" REAL,
  "rawJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PlayerGameStat_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlayerGameStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PlayerGameStat_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SourceSync" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "league" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "message" TEXT,
  "fetchedAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS "Team_league_abbreviation_idx" ON "Team"("league", "abbreviation");
CREATE UNIQUE INDEX IF NOT EXISTS "Team_league_externalId_key" ON "Team"("league", "externalId");
CREATE INDEX IF NOT EXISTS "Game_league_season_seasonType_gameDate_idx" ON "Game"("league", "season", "seasonType", "gameDate");
CREATE INDEX IF NOT EXISTS "Game_homeTeamId_gameDate_idx" ON "Game"("homeTeamId", "gameDate");
CREATE INDEX IF NOT EXISTS "Game_awayTeamId_gameDate_idx" ON "Game"("awayTeamId", "gameDate");
CREATE UNIQUE INDEX IF NOT EXISTS "Game_league_externalGameId_key" ON "Game"("league", "externalGameId");
CREATE INDEX IF NOT EXISTS "GamePeriodScore_teamId_periodNumber_idx" ON "GamePeriodScore"("teamId", "periodNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "GamePeriodScore_gameId_teamId_periodNumber_key" ON "GamePeriodScore"("gameId", "teamId", "periodNumber");
CREATE INDEX IF NOT EXISTS "Player_league_name_idx" ON "Player"("league", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "Player_league_externalId_key" ON "Player"("league", "externalId");
CREATE INDEX IF NOT EXISTS "PlayerGameStat_league_teamId_playerId_idx" ON "PlayerGameStat"("league", "teamId", "playerId");
CREATE UNIQUE INDEX IF NOT EXISTS "PlayerGameStat_gameId_playerId_key" ON "PlayerGameStat"("gameId", "playerId");
CREATE UNIQUE INDEX IF NOT EXISTS "SourceSync_league_source_entity_key" ON "SourceSync"("league", "source", "entity");
`);

db.close();
console.log(`SQLite database initialized at ${dbPath}`);
