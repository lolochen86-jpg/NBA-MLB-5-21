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


INSERT INTO "Team" ("league", "externalId", "name", "abbreviation", "city", "conference", "division", "createdAt", "updatedAt") VALUES
('NBA', '1610612737', 'Atlanta Hawks', 'ATL', 'Atlanta', 'Eastern', 'Southeast', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612738', 'Boston Celtics', 'BOS', 'Boston', 'Eastern', 'Atlantic', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612751', 'Brooklyn Nets', 'BKN', 'Brooklyn', 'Eastern', 'Atlantic', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612766', 'Charlotte Hornets', 'CHA', 'Charlotte', 'Eastern', 'Southeast', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612741', 'Chicago Bulls', 'CHI', 'Chicago', 'Eastern', 'Central', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612739', 'Cleveland Cavaliers', 'CLE', 'Cleveland', 'Eastern', 'Central', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612742', 'Dallas Mavericks', 'DAL', 'Dallas', 'Western', 'Southwest', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612743', 'Denver Nuggets', 'DEN', 'Denver', 'Western', 'Northwest', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612765', 'Detroit Pistons', 'DET', 'Detroit', 'Eastern', 'Central', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612744', 'Golden State Warriors', 'GSW', 'Golden State', 'Western', 'Pacific', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612745', 'Houston Rockets', 'HOU', 'Houston', 'Western', 'Southwest', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612754', 'Indiana Pacers', 'IND', 'Indiana', 'Eastern', 'Central', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612746', 'LA Clippers', 'LAC', 'LA', 'Western', 'Pacific', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612747', 'Los Angeles Lakers', 'LAL', 'Los Angeles', 'Western', 'Pacific', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612763', 'Memphis Grizzlies', 'MEM', 'Memphis', 'Western', 'Southwest', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612748', 'Miami Heat', 'MIA', 'Miami', 'Eastern', 'Southeast', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612749', 'Milwaukee Bucks', 'MIL', 'Milwaukee', 'Eastern', 'Central', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612750', 'Minnesota Timberwolves', 'MIN', 'Minnesota', 'Western', 'Northwest', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612740', 'New Orleans Pelicans', 'NOP', 'New Orleans', 'Western', 'Southwest', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612752', 'New York Knicks', 'NYK', 'New York', 'Eastern', 'Atlantic', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612760', 'Oklahoma City Thunder', 'OKC', 'Oklahoma City', 'Western', 'Northwest', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612753', 'Orlando Magic', 'ORL', 'Orlando', 'Eastern', 'Southeast', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612755', 'Philadelphia 76ers', 'PHI', 'Philadelphia', 'Eastern', 'Atlantic', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612756', 'Phoenix Suns', 'PHX', 'Phoenix', 'Western', 'Pacific', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612757', 'Portland Trail Blazers', 'POR', 'Portland', 'Western', 'Northwest', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612758', 'Sacramento Kings', 'SAC', 'Sacramento', 'Western', 'Pacific', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612759', 'San Antonio Spurs', 'SAS', 'San Antonio', 'Western', 'Southwest', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612761', 'Toronto Raptors', 'TOR', 'Toronto', 'Eastern', 'Atlantic', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612762', 'Utah Jazz', 'UTA', 'Utah', 'Western', 'Northwest', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('NBA', '1610612764', 'Washington Wizards', 'WAS', 'Washington', 'Eastern', 'Southeast', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '109', 'Arizona Diamondbacks', 'ARI', 'Arizona', 'National', 'West', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '144', 'Atlanta Braves', 'ATL', 'Atlanta', 'National', 'East', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '110', 'Baltimore Orioles', 'BAL', 'Baltimore', 'American', 'East', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '111', 'Boston Red Sox', 'BOS', 'Boston', 'American', 'East', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '112', 'Chicago Cubs', 'CHC', 'Chicago', 'National', 'Central', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '145', 'Chicago White Sox', 'CWS', 'Chicago', 'American', 'Central', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '113', 'Cincinnati Reds', 'CIN', 'Cincinnati', 'National', 'Central', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '114', 'Cleveland Guardians', 'CLE', 'Cleveland', 'American', 'Central', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '115', 'Colorado Rockies', 'COL', 'Colorado', 'National', 'West', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '116', 'Detroit Tigers', 'DET', 'Detroit', 'American', 'Central', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '117', 'Houston Astros', 'HOU', 'Houston', 'American', 'West', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '118', 'Kansas City Royals', 'KC', 'Kansas City', 'American', 'Central', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '108', 'Los Angeles Angels', 'LAA', 'Los Angeles', 'American', 'West', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '119', 'Los Angeles Dodgers', 'LAD', 'Los Angeles', 'National', 'West', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '146', 'Miami Marlins', 'MIA', 'Miami', 'National', 'East', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '158', 'Milwaukee Brewers', 'MIL', 'Milwaukee', 'National', 'Central', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '142', 'Minnesota Twins', 'MIN', 'Minnesota', 'American', 'Central', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '121', 'New York Mets', 'NYM', 'New York', 'National', 'East', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '147', 'New York Yankees', 'NYY', 'New York', 'American', 'East', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '133', 'Athletics', 'ATH', 'Athletics', 'American', 'West', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '143', 'Philadelphia Phillies', 'PHI', 'Philadelphia', 'National', 'East', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '134', 'Pittsburgh Pirates', 'PIT', 'Pittsburgh', 'National', 'Central', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '135', 'San Diego Padres', 'SD', 'San Diego', 'National', 'West', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '137', 'San Francisco Giants', 'SF', 'San Francisco', 'National', 'West', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '136', 'Seattle Mariners', 'SEA', 'Seattle', 'American', 'West', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '138', 'St. Louis Cardinals', 'STL', 'St. Louis', 'National', 'Central', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '139', 'Tampa Bay Rays', 'TB', 'Tampa Bay', 'American', 'East', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '140', 'Texas Rangers', 'TEX', 'Texas', 'American', 'West', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '141', 'Toronto Blue Jays', 'TOR', 'Toronto', 'American', 'East', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', '120', 'Washington Nationals', 'WSH', 'Washington', 'National', 'East', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("league", "externalId") DO UPDATE SET
  "name" = EXCLUDED."name",
  "abbreviation" = EXCLUDED."abbreviation",
  "city" = EXCLUDED."city",
  "conference" = EXCLUDED."conference",
  "division" = EXCLUDED."division",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "SourceSync" ("league", "source", "entity", "status", "message", "fetchedAt", "createdAt", "updatedAt") VALUES
('NBA', 'NBA.com Stats API', 'teams', 'SEEDED_TEAMS_ONLY', '撌脣?亦?撖衣????殷?撠?郊瘥魚鞈?', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MLB', 'MLB StatsAPI', 'teams', 'SEEDED_TEAMS_ONLY', '撌脣?亦?撖衣????殷?撠?郊瘥魚鞈?', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("league", "source", "entity") DO UPDATE SET
  "status" = EXCLUDED."status",
  "message" = EXCLUDED."message",
  "fetchedAt" = CURRENT_TIMESTAMP,
  "updatedAt" = CURRENT_TIMESTAMP;

