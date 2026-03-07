// ============================================================
// PARLAY BOT — Brier Score & Calibration Tracker
// Computes calibration metrics from settled picks to measure
// whether our probability estimates are well-calibrated.
//
// A model that says "60% chance" should win ~60% of the time.
// Brier Score ranges from 0 (perfect) to 1 (worst).
// A Brier Score below 0.25 is considered good for sports.
// ============================================================
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function computeBrierScore(lookbackDays = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackDays);
    const startStr = startDate.toISOString().split('T')[0];

    const { data: results, error } = await supabase
        .from('pick_results')
        .select('result, daily_picks!inner(confidence, pick_type, tier, pick_date, game_id, games!inner(sport_key))')
        .gte('daily_picks.pick_date', startStr);

    if (error || !results || results.length === 0) {
        return { brierScore: null, calibrationBuckets: [], totalPicks: 0 };
    }

    // Compute Brier Score: (1/N) × Σ(predicted_prob - actual_outcome)²
    let brierSum = 0;
    const buckets = {}; // For calibration curve: bucket by predicted probability

    for (const r of results) {
        const confidence = parseFloat(r.daily_picks.confidence) / 100; // convert to 0-1
        const actual = r.result === 'win' ? 1 : 0;

        brierSum += Math.pow(confidence - actual, 2);

        // Bucket into 5% bands for calibration curve
        const bucketKey = Math.round(confidence * 20) * 5; // 50, 55, 60, 65, etc.
        if (!buckets[bucketKey]) {
            buckets[bucketKey] = { predicted: bucketKey, wins: 0, total: 0, sumPredicted: 0 };
        }
        buckets[bucketKey].total++;
        if (actual === 1) buckets[bucketKey].wins++;
        buckets[bucketKey].sumPredicted += confidence * 100;
    }

    const brierScore = brierSum / results.length;

    // Compute calibration curve
    const calibrationBuckets = Object.values(buckets)
        .filter(b => b.total >= 3) // need at least 3 picks per bucket
        .map(b => ({
            predictedPct: b.predicted,
            actualPct: Math.round((b.wins / b.total) * 100),
            avgPredicted: Math.round(b.sumPredicted / b.total),
            count: b.total,
            deviation: Math.round(Math.abs((b.wins / b.total) * 100 - b.predicted)),
        }))
        .sort((a, b) => a.predictedPct - b.predictedPct);

    return {
        brierScore: Math.round(brierScore * 10000) / 10000,
        calibrationBuckets,
        totalPicks: results.length,
        interpretation: brierScore < 0.20 ? 'Excellent calibration' :
            brierScore < 0.25 ? 'Good calibration' :
                brierScore < 0.30 ? 'Fair calibration — room for improvement' :
                    'Poor calibration — model needs significant adjustment',
    };
}

async function computeCLV(lookbackDays = 14) {
    // Compare the odds at pick time to closing odds (last snapshot before game)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackDays);
    const startStr = startDate.toISOString().split('T')[0];

    const { data: picks } = await supabase
        .from('daily_picks')
        .select('game_id, pick_type, picked_team, picked_odds, created_at')
        .gte('pick_date', startStr);

    if (!picks || picks.length === 0) return { avgCLV: null, totalPicks: 0 };

    let clvSum = 0;
    let clvCount = 0;

    for (const pick of picks) {
        // Get closing odds (last snapshot before game time)
        const { data: closingOdds } = await supabase
            .from('odds_history')
            .select('home_odds, away_odds, over_odds, under_odds')
            .eq('game_id', pick.game_id)
            .order('captured_at', { ascending: false })
            .limit(1);

        if (!closingOdds?.[0]) continue;

        const pickOdds = parseFloat(pick.picked_odds);
        const closing = closingOdds[0];

        // Determine closing odds for the picked side
        let closingPickOdds;
        if (pick.pick_type === 'over') closingPickOdds = parseFloat(closing.over_odds);
        else if (pick.pick_type === 'under') closingPickOdds = parseFloat(closing.under_odds);
        else {
            // Moneyline or spread — use placeholder since we'd need game data
            closingPickOdds = pickOdds;
        }

        if (closingPickOdds && closingPickOdds !== pickOdds) {
            const { impliedProbFromOdds } = require('./model');
            const pickImplied = impliedProbFromOdds(pickOdds);
            const closingImplied = impliedProbFromOdds(closingPickOdds);
            const clv = closingImplied - pickImplied;

            clvSum += clv;
            clvCount++;
        }
    }

    return {
        avgCLV: clvCount > 0 ? Math.round((clvSum / clvCount) * 10000) / 10000 : null,
        totalPicks: clvCount,
        interpretation: clvCount === 0 ? 'Not enough data' :
            (clvSum / clvCount) > 0.02 ? 'Strong positive CLV — model is finding value ahead of the market' :
                (clvSum / clvCount) > 0 ? 'Slightly positive CLV — on the right track' :
                    'Negative CLV — model is not beating the closing line',
    };
}

module.exports = { computeBrierScore, computeCLV };
