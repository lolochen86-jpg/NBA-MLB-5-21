CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league VARCHAR NOT NULL,
    external_game_id TEXT,
    commence_time TIMESTAMPTZ,
    home_team VARCHAR NOT NULL,
    away_team VARCHAR NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE games ADD COLUMN IF NOT EXISTS external_game_id TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS commence_time TIMESTAMPTZ;

UPDATE games
SET external_game_id = external_id
WHERE external_game_id IS NULL
  AND external_id IS NOT NULL;

UPDATE games
SET commence_time = game_time
WHERE commence_time IS NULL
  AND game_time IS NOT NULL;

CREATE TABLE IF NOT EXISTS odds_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    league TEXT,
    sportsbook TEXT,
    bookmaker VARCHAR,
    market TEXT,
    market_type VARCHAR,
    side TEXT,
    line NUMERIC,
    decimal_odds DOUBLE PRECISION,
    implied_probability DOUBLE PRECISION,
    snapshot_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    source VARCHAR,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE odds_snapshots ADD COLUMN IF NOT EXISTS league TEXT;
ALTER TABLE odds_snapshots ADD COLUMN IF NOT EXISTS sportsbook TEXT;
ALTER TABLE odds_snapshots ADD COLUMN IF NOT EXISTS market TEXT;
ALTER TABLE odds_snapshots ADD COLUMN IF NOT EXISTS side TEXT;
ALTER TABLE odds_snapshots ADD COLUMN IF NOT EXISTS decimal_odds DOUBLE PRECISION;
ALTER TABLE odds_snapshots ADD COLUMN IF NOT EXISTS implied_probability DOUBLE PRECISION;

UPDATE odds_snapshots
SET sportsbook = bookmaker
WHERE sportsbook IS NULL
  AND bookmaker IS NOT NULL;

UPDATE odds_snapshots
SET market = market_type
WHERE market IS NULL
  AND market_type IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS games_league_external_game_id_key ON games(league, external_game_id);
CREATE INDEX IF NOT EXISTS games_league_commence_time_idx ON games(league, commence_time);
CREATE INDEX IF NOT EXISTS odds_snapshots_league_market_snapshot_time_idx ON odds_snapshots(league, market, snapshot_time);
CREATE INDEX IF NOT EXISTS odds_snapshots_game_id_snapshot_time_idx ON odds_snapshots(game_id, snapshot_time);
