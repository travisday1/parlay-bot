-- ============================================================
-- PARLAY BOT — Model Predictions Table
-- Stores raw mathematical model output for each game to enable
-- historical calibration analysis independent of AI adjustments.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.model_predictions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_id TEXT REFERENCES public.games(game_id) ON DELETE CASCADE,
    prediction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    sport_key TEXT NOT NULL,
    home_win_prob NUMERIC NOT NULL,
    away_win_prob NUMERIC NOT NULL,
    power_diff NUMERIC,
    rest_adjustment NUMERIC,
    projected_total NUMERIC,
    home_ml_ev NUMERIC,
    away_ml_ev NUMERIC,
    over_ev NUMERIC,
    under_ev NUMERIC,
    best_bet_type TEXT,
    best_bet_team TEXT,
    best_bet_edge NUMERIC,
    tier TEXT,
    home_net_rating NUMERIC,
    away_net_rating NUMERIC,
    home_efg_pct NUMERIC,
    away_efg_pct NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(game_id, prediction_date)
);

ALTER TABLE public.model_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on model_predictions"
    ON public.model_predictions FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_model_predictions_date
    ON public.model_predictions(prediction_date);

CREATE INDEX IF NOT EXISTS idx_model_predictions_game
    ON public.model_predictions(game_id);
