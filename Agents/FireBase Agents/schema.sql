-- ============================================================
-- PARLAY BOT — Cloud SQL Schema for Firebase
-- Run against the Cloud SQL instance after provisioning
-- ============================================================

-- 1) GAMES — raw game schedule from The-Odds-API
CREATE TABLE IF NOT EXISTS games (
    game_id TEXT PRIMARY KEY,
    sport_key TEXT NOT NULL,
    sport_title TEXT,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    commence_time TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) ODDS — parsed bookmaker odds per game
CREATE TABLE IF NOT EXISTS odds (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_id TEXT REFERENCES games(game_id) ON DELETE CASCADE,
    bookmaker TEXT NOT NULL,
    market TEXT NOT NULL,
    home_odds NUMERIC,
    away_odds NUMERIC,
    home_point NUMERIC,
    away_point NUMERIC,
    over_odds NUMERIC,
    over_point NUMERIC,
    under_odds NUMERIC,
    under_point NUMERIC,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(game_id, bookmaker, market)
);

-- 2b) ODDS_HISTORY — append-only snapshots for line movement tracking
CREATE TABLE IF NOT EXISTS odds_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_id TEXT REFERENCES games(game_id) ON DELETE CASCADE,
    bookmaker TEXT,
    home_odds NUMERIC,
    away_odds NUMERIC,
    home_point NUMERIC,
    away_point NUMERIC,
    over_odds NUMERIC,
    over_point NUMERIC,
    under_odds NUMERIC,
    under_point NUMERIC,
    captured_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3) DAILY_PICKS — AI-generated picks stored each day
CREATE TABLE IF NOT EXISTS daily_picks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_id TEXT REFERENCES games(game_id) ON DELETE CASCADE,
    pick_date DATE NOT NULL DEFAULT CURRENT_DATE,
    tier TEXT NOT NULL,
    pick_type TEXT NOT NULL,
    picked_team TEXT,
    picked_odds NUMERIC,
    picked_line NUMERIC,
    confidence NUMERIC,
    rationale TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(game_id, pick_date, pick_type)
);

-- 4) PICK_RESULTS — settled results for historical tracking / ROI
CREATE TABLE IF NOT EXISTS pick_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pick_id UUID REFERENCES daily_picks(id) ON DELETE CASCADE,
    game_id TEXT REFERENCES games(game_id) ON DELETE CASCADE,
    result TEXT NOT NULL,
    home_final_score INTEGER,
    away_final_score INTEGER,
    payout_on_100 NUMERIC,
    settled_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(pick_id)
);

-- 5) RECOMMENDED_PARLAYS
CREATE TABLE IF NOT EXISTS recommended_parlays (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    parlay_date DATE NOT NULL DEFAULT CURRENT_DATE,
    tier TEXT NOT NULL,
    name TEXT NOT NULL,
    legs JSONB NOT NULL,
    combined_odds NUMERIC,
    payout_on_100 NUMERIC,
    confidence NUMERIC,
    rationale TEXT,
    result TEXT DEFAULT 'pending',
    actual_payout NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(parlay_date, tier)
);

-- 6) PROFILES — mapped to Firebase Auth UID
CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    email TEXT,
    display_name TEXT,
    avatar_url TEXT,
    subscription_tier TEXT DEFAULT 'free',
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT,
    subscription_status TEXT DEFAULT 'inactive',
    subscription_period_end TIMESTAMPTZ,
    is_admin BOOLEAN DEFAULT FALSE,
    granted_tier TEXT DEFAULT NULL,
    granted_by TEXT,
    granted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7) LEADERBOARD_ENTRIES
CREATE TABLE IF NOT EXISTS leaderboard_entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
    screenshot_url TEXT NOT NULL,
    bet_amount NUMERIC NOT NULL,
    payout_amount NUMERIC NOT NULL,
    profit NUMERIC GENERATED ALWAYS AS (payout_amount - bet_amount) STORED,
    bet_date DATE NOT NULL,
    verification_status TEXT DEFAULT 'pending',
    verification_notes TEXT,
    submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8) PENDING_INVITES
CREATE TABLE IF NOT EXISTS pending_invites (
    email TEXT PRIMARY KEY,
    granted_tier TEXT NOT NULL DEFAULT 'free',
    granted_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9) PIPELINE_RUNS
CREATE TABLE IF NOT EXISTS pipeline_runs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    run_date DATE NOT NULL,
    status TEXT NOT NULL,
    games_updated INTEGER,
    picks_generated INTEGER,
    picks_settled INTEGER,
    errors TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 10) MODEL_PREDICTIONS
CREATE TABLE IF NOT EXISTS model_predictions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_id TEXT REFERENCES games(game_id) ON DELETE CASCADE,
    prediction_date DATE NOT NULL,
    home_win_prob NUMERIC,
    away_win_prob NUMERIC,
    projected_total NUMERIC,
    spread_value NUMERIC,
    model_version TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(game_id, prediction_date)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_games_commence ON games(commence_time);
CREATE INDEX IF NOT EXISTS idx_games_sport ON games(sport_key);
CREATE INDEX IF NOT EXISTS idx_picks_date ON daily_picks(pick_date);
CREATE INDEX IF NOT EXISTS idx_picks_tier ON daily_picks(tier);
CREATE INDEX IF NOT EXISTS idx_results_pick ON pick_results(pick_id);
CREATE INDEX IF NOT EXISTS idx_parlays_date ON recommended_parlays(parlay_date);
CREATE INDEX IF NOT EXISTS idx_odds_history_game ON odds_history(game_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_leaderboard_user ON leaderboard_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_date ON leaderboard_entries(bet_date);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe ON profiles(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_profiles_tier ON profiles(subscription_tier);
