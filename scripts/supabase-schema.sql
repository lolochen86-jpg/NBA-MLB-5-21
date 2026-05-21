-- CreateTable
CREATE TABLE "Team" (
    "id" SERIAL NOT NULL,
    "league" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "city" TEXT,
    "conference" TEXT,
    "division" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" SERIAL NOT NULL,
    "league" TEXT NOT NULL,
    "externalGameId" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "seasonType" TEXT NOT NULL,
    "gameDate" TIMESTAMP(3) NOT NULL,
    "homeTeamId" INTEGER NOT NULL,
    "awayTeamId" INTEGER NOT NULL,
    "homeScoreFinal" INTEGER,
    "awayScoreFinal" INTEGER,
    "homeScoreRegulation" INTEGER,
    "awayScoreRegulation" INTEGER,
    "wentOvertime" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL,
    "rawJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GamePeriodScore" (
    "id" SERIAL NOT NULL,
    "gameId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "periodNumber" INTEGER NOT NULL,
    "periodType" TEXT NOT NULL,
    "runsOrPoints" INTEGER NOT NULL,
    "isOvertimeOrExtra" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GamePeriodScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" SERIAL NOT NULL,
    "league" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "teamId" INTEGER,
    "position" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerGameStat" (
    "id" SERIAL NOT NULL,
    "league" TEXT NOT NULL,
    "gameId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "minutes" DOUBLE PRECISION,
    "points" INTEGER,
    "rebounds" INTEGER,
    "assists" INTEGER,
    "steals" INTEGER,
    "blocks" INTEGER,
    "turnovers" INTEGER,
    "fgPct" DOUBLE PRECISION,
    "threePtPct" DOUBLE PRECISION,
    "ftPct" DOUBLE PRECISION,
    "plusMinus" DOUBLE PRECISION,
    "atBats" INTEGER,
    "runs" INTEGER,
    "hits" INTEGER,
    "homeRuns" INTEGER,
    "rbi" INTEGER,
    "walks" INTEGER,
    "strikeouts" INTEGER,
    "inningsPitched" DOUBLE PRECISION,
    "earnedRuns" INTEGER,
    "era" DOUBLE PRECISION,
    "whip" DOUBLE PRECISION,
    "rawJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerGameStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceSync" (
    "id" SERIAL NOT NULL,
    "league" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Team_league_abbreviation_idx" ON "Team"("league", "abbreviation");

-- CreateIndex
CREATE UNIQUE INDEX "Team_league_externalId_key" ON "Team"("league", "externalId");

-- CreateIndex
CREATE INDEX "Game_league_season_seasonType_gameDate_idx" ON "Game"("league", "season", "seasonType", "gameDate");

-- CreateIndex
CREATE INDEX "Game_homeTeamId_gameDate_idx" ON "Game"("homeTeamId", "gameDate");

-- CreateIndex
CREATE INDEX "Game_awayTeamId_gameDate_idx" ON "Game"("awayTeamId", "gameDate");

-- CreateIndex
CREATE UNIQUE INDEX "Game_league_externalGameId_key" ON "Game"("league", "externalGameId");

-- CreateIndex
CREATE INDEX "GamePeriodScore_teamId_periodNumber_idx" ON "GamePeriodScore"("teamId", "periodNumber");

-- CreateIndex
CREATE UNIQUE INDEX "GamePeriodScore_gameId_teamId_periodNumber_key" ON "GamePeriodScore"("gameId", "teamId", "periodNumber");

-- CreateIndex
CREATE INDEX "Player_league_name_idx" ON "Player"("league", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Player_league_externalId_key" ON "Player"("league", "externalId");

-- CreateIndex
CREATE INDEX "PlayerGameStat_league_teamId_playerId_idx" ON "PlayerGameStat"("league", "teamId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerGameStat_gameId_playerId_key" ON "PlayerGameStat"("gameId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceSync_league_source_entity_key" ON "SourceSync"("league", "source", "entity");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePeriodScore" ADD CONSTRAINT "GamePeriodScore_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePeriodScore" ADD CONSTRAINT "GamePeriodScore_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerGameStat" ADD CONSTRAINT "PlayerGameStat_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerGameStat" ADD CONSTRAINT "PlayerGameStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerGameStat" ADD CONSTRAINT "PlayerGameStat_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

