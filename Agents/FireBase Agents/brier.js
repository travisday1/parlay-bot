// ============================================================
// PARLAY BOT — Brier Score & Calibration Tracker
// Computes calibration metrics from settled picks to measure
// whether our probability estimates are well-calibrated.
//
// A model that says "60% chance" should win ~60% of the time.
// Brier Score ranges from 0 (perfect) to 1 (worst).
// A Brier Score below 0.25 is considered good for sports.
//
// Migrated from Supabase to Cloud SQL (pg via db.js)
// ============================================================
require('dotenv').config();
const { query } = require('./db');

async function computeBrierScore(lookbackDays = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackDays);
    const startStr = startDate.toISOString().split('T')[0];

    const results = await query(
        `SELECT pr.result, dp.confidence, dp.pick_type, dp.tier, dp.pick_date,
                dp.game_id, g.sport_key
         FROM pick_results pr
         JOIN daily_picks dp ON dp.id = pr.pick_id
         JOIN games g ON g.game_id = dp.game_id
         WHERE dp.pick_date >= $1`,
        [startStr]
    );

    if (!results || results.length === 0) {
        return { brierScore: null, calibrationBuckets: [], totalPicks: 0 };
    }

    // Compute Brier Score: (1/N) × Σ(predicted_prob - actual_outcome)²
    let brierSum = 0;
    const buckets = {}; // For calibration curve: bucket by predicted probability

    for (const r of results) {
        const confidence = parseFloat(r.confidence) / 100; // convert to 0-1
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
    const { impliedProbFromOdds } = require('./model');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackDays);
    const startStr = startDate.toISOString().split('T')[0];

    const picks = await query(
        `SELECT game_id, pick_type, picked_team, picked_odds, picked_line, created_at
         FROM daily_picks
         WHERE pick_date >= $1`,
        [startStr]
    );

    if (!picks || picks.length === 0) return { avgCLV: null, totalPicks: 0 };

    // Build a map of game_id → {home_team, away_team}
    const gameIds = [...new Set(picks.map(p => p.game_id))];
    const gameMap = {};

    // Fetch games in batches
    for (let i = 0; i < gameIds.length; i += 100) {
        const batch = gameIds.slice(i, i + 100);
        const placeholders = batch.map((_, idx) => `$${idx + 1}`).join(', ');
        const games = await query(
            `SELECT game_id, home_team, away_team FROM games WHERE game_id IN (${placeholders})`,
            batch
        );
        (games || []).forEach(g => { gameMap[g.game_id] = g; });
    }

    let clvSum = 0;
    let clvCount = 0;

    for (const pick of picks) {
        // Get closing odds (last snapshot before game time)
        const closingOdds = await query(
            `SELECT home_odds, away_odds, home_point, away_point, over_odds, under_odds
             FROM odds_history
             WHERE game_id = $1
             ORDER BY captured_at DESC
             LIMIT 1`,
            [pick.game_id]
        );

        if (!closingOdds?.[0]) continue;

        const pickOdds = parseFloat(pick.picked_odds);
        const closing = closingOdds[0];
        const game = gameMap[pick.game_id];

        // Determine closing odds for the picked side
        let closingPickOdds;
        if (pick.pick_type === 'over') {
            closingPickOdds = parseFloat(closing.over_odds);
        } else if (pick.pick_type === 'under') {
            closingPickOdds = parseFloat(closing.under_odds);
        } else if (pick.pick_type === 'moneyline' && game) {
            if (pick.picked_team === game.home_team) {
                closingPickOdds = parseFloat(closing.home_odds);
            } else if (pick.picked_team === game.away_team) {
                closingPickOdds = parseFloat(closing.away_odds);
            }
        } else if (pick.pick_type === 'spread' && game) {
            const pickLine = parseFloat(pick.picked_line) || 0;
            let closingLine;
            if (pick.picked_team === game.home_team) {
                closingLine = parseFloat(closing.home_point);
            } else if (pick.picked_team === game.away_team) {
                closingLine = parseFloat(closing.away_point);
            }
            if (closingLine != null && !isNaN(closingLine)) {
                const spreadShift = (closingLine - pickLine) * 0.03;
                clvSum += spreadShift;
                clvCount++;
            }
            continue;
        }

        if (closingPickOdds && !isNaN(closingPickOdds) && closingPickOdds !== pickOdds) {
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
