-- ============================================================
-- PARLAY BOT – Complete Database Schema
-- Run in Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================================

-- 1) GAMES — raw game schedule from The-Odds-API
CREATE TABLE IF NOT EXISTS public.games (
    id TEXT PRIMARY KEY,              -- The-Odds-API game ID
    game_id TEXT UNIQUE NOT NULL,      
    sport_key TEXT NOT NULL,           -- e.g. basketball_nba, icehockey_nhl
    sport_title TEXT,                  -- e.g. "NBA", "NHL"
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    commence_time TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) ODDS — parsed bookmaker odds per game
CREATE TABLE IF NOT EXISTS public.odds (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_id TEXT REFERENCES public.games(game_id) ON DELETE CASCADE,
    bookmaker TEXT NOT NULL,
    market TEXT NOT NULL,              -- 'combined' (h2h + spreads + totals in one row)
    home_odds NUMERIC,                -- moneyline home
    away_odds NUMERIC,                -- moneyline away
    home_point NUMERIC,               -- spread home
    away_point NUMERIC,               -- spread away
    over_odds NUMERIC,
    over_point NUMERIC,
    under_odds NUMERIC,
    under_point NUMERIC,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(game_id, bookmaker, market)
);

-- 2b) ODDS_HISTORY — append-only snapshots for line movement tracking
CREATE TABLE IF NOT EXISTS public.odds_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_id TEXT REFERENCES public.games(game_id) ON DELETE CASCADE,
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
CREATE TABLE IF NOT EXISTS public.daily_picks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_id TEXT REFERENCES public.games(game_id) ON DELETE CASCADE,
    pick_date DATE NOT NULL DEFAULT CURRENT_DATE,
    tier TEXT NOT NULL,                -- 'lock', 'value', 'longshot', 'probable'
    pick_type TEXT NOT NULL,           -- 'moneyline', 'spread', 'over', 'under'
    picked_team TEXT,                  -- team name or 'Over'/'Under'
    picked_odds NUMERIC,              -- the odds at time of pick
    picked_line NUMERIC,              -- spread or total line
    confidence NUMERIC,               -- 0-100 confidence score
    rationale TEXT,                    -- AI reasoning
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(game_id, pick_date, pick_type)
);

-- 4) PICK_RESULTS — settled results for historical tracking / ROI
CREATE TABLE IF NOT EXISTS public.pick_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pick_id UUID REFERENCES public.daily_picks(id) ON DELETE CASCADE,
    game_id TEXT REFERENCES public.games(game_id) ON DELETE CASCADE,
    result TEXT NOT NULL,              -- 'win', 'loss', 'push'
    home_final_score INTEGER,
    away_final_score INTEGER,
    payout_on_100 NUMERIC,            -- how much a $100 bet would return
    settled_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(pick_id)
);

-- 5) RECOMMENDED_PARLAYS — the curated parlay combos (Safe Bag, Value Play, Big Swing)
CREATE TABLE IF NOT EXISTS public.recommended_parlays (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    parlay_date DATE NOT NULL DEFAULT CURRENT_DATE,
    tier TEXT NOT NULL,                -- 'safe', 'value', 'longshot'
    name TEXT NOT NULL,                -- 'The Safe Bag', 'The Value Play', etc.
    legs JSONB NOT NULL,              -- array of pick references [{team, odds, type}]
    combined_odds NUMERIC,
    payout_on_100 NUMERIC,
    confidence NUMERIC,
    rationale TEXT,
    result TEXT DEFAULT 'pending',     -- 'win', 'loss', 'pending'
    actual_payout NUMERIC,             -- settled payout
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(parlay_date, tier)
);

-- 6) USER PROFILES — for authenticated users
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY,              -- maps to auth.users.id
    email TEXT,
    display_name TEXT,
    avatar_url TEXT,
    subscription_tier TEXT DEFAULT 'free',  -- 'free', 'plus', 'pro'
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT,
    subscription_status TEXT DEFAULT 'inactive',
    subscription_period_end TIMESTAMPTZ,
    is_admin BOOLEAN DEFAULT FALSE,
    granted_tier TEXT DEFAULT NULL,       -- admin-granted tier override
    granted_by UUID REFERENCES public.profiles(id),
    granted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7) LEADERBOARD_ENTRIES — user-submitted verified bet screenshots
CREATE TABLE IF NOT EXISTS public.leaderboard_entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    screenshot_url TEXT NOT NULL,       -- stored in Supabase Storage
    bet_amount NUMERIC NOT NULL,
    payout_amount NUMERIC NOT NULL,
    profit NUMERIC GENERATED ALWAYS AS (payout_amount - bet_amount) STORED,
    bet_date DATE NOT NULL,
    verification_status TEXT DEFAULT 'pending',  -- 'pending', 'verified', 'rejected'
    verification_notes TEXT,
    submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.odds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pick_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommended_parlays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.odds_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_entries ENABLE ROW LEVEL SECURITY;

-- Public read access for game data, picks, results, and leaderboard
CREATE POLICY "Allow public read on games" ON public.games FOR SELECT USING (true);
CREATE POLICY "Allow public read on odds" ON public.odds FOR SELECT USING (true);
CREATE POLICY "Allow public read on daily_picks" ON public.daily_picks FOR SELECT USING (true);
CREATE POLICY "Allow public read on pick_results" ON public.pick_results FOR SELECT USING (true);
CREATE POLICY "Allow public read on recommended_parlays" ON public.recommended_parlays FOR SELECT USING (true);
CREATE POLICY "Allow public read on odds_history" ON public.odds_history FOR SELECT USING (true);
CREATE POLICY "Allow public read on leaderboard_entries" ON public.leaderboard_entries FOR SELECT USING (true);

-- Profile policies
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can read all profiles" ON public.profiles
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));
CREATE POLICY "Admins can update all profiles" ON public.profiles
    FOR UPDATE USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));
CREATE POLICY "Allow insert for new users" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Users can insert their own leaderboard entries
CREATE POLICY "Users can insert own leaderboard entries" ON public.leaderboard_entries 
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- INDEXES for fast queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_games_commence ON public.games(commence_time);
CREATE INDEX IF NOT EXISTS idx_games_sport ON public.games(sport_key);
CREATE INDEX IF NOT EXISTS idx_picks_date ON public.daily_picks(pick_date);
CREATE INDEX IF NOT EXISTS idx_picks_tier ON public.daily_picks(tier);
CREATE INDEX IF NOT EXISTS idx_results_pick ON public.pick_results(pick_id);
CREATE INDEX IF NOT EXISTS idx_parlays_date ON public.recommended_parlays(parlay_date);
CREATE INDEX IF NOT EXISTS idx_odds_history_game ON public.odds_history(game_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_leaderboard_user ON public.leaderboard_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_date ON public.leaderboard_entries(bet_date);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer ON public.profiles(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription ON public.profiles(subscription_tier);

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name, avatar_url, subscription_tier)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'avatar_url',
        'free'
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
