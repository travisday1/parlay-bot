// ============================================================
// PARLAY BOT — Daily Model Refiner
// Reviews settled pick results and calibration data to
// recommend model parameter adjustments. Runs after settler
// and before analyzer in the daily pipeline.
//
// Pipeline position: updater → settler → refiner → analyzer
// ============================================================
require('dotenv').config();
const { query, queryOne, execute, closePool } = require('./db');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { SPORT_CONFIG } = require('./model');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SPORT_NAMES = {
    'basketball_nba': 'NBA',
    'basketball_ncaab': 'NCAAB',
    'icehockey_nhl': 'NHL',
    'americanfootball_nfl': 'NFL',
    'baseball_mlb': 'MLB',
    'soccer_usa_mls': 'MLS',
    'soccer_epl': 'EPL',
    'soccer_spain_la_liga': 'La Liga',
    'soccer_germany_bundesliga': 'Bundesliga',
    'soccer_france_ligue_one': 'Ligue 1',
    'soccer_italy_serie_a': 'Serie A',
};

// ============================================================
// STEP 1: Gather Performance Metrics
// ============================================================
async function gatherPerformanceData(lookbackDays = 14) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackDays);
    const startStr = startDate.toISOString().split('T')[0];

    // Get all settled picks with their details
    const results = await query(
        `SELECT pr.result, pr.payout_on_100,
                dp.tier, dp.pick_type, dp.confidence, dp.picked_odds, dp.pick_date,
                g.sport_key, g.home_team, g.away_team
         FROM pick_results pr
         JOIN daily_picks dp ON dp.id = pr.pick_id
         JOIN games g ON g.game_id = dp.game_id
         WHERE dp.pick_date >= $1
         ORDER BY dp.pick_date DESC`,
        [startStr]
    );

    if (!results || results.length === 0) {
        return { hasData: false, results: [], metrics: null };
    }

    // Compute metrics grouped by sport × tier × pick_type
    const groups = {};
    const sportTotals = {};
    const tierTotals = {};

    for (const r of results) {
        const sport = r.sport_key;
        const tier = r.tier;
        const pickType = r.pick_type;

        // Group key
        const key = `${sport}|${tier}|${pickType}`;
        if (!groups[key]) {
            groups[key] = {
                sport, tier, pickType,
                wins: 0, losses: 0, pushes: 0,
                totalConf: 0, count: 0,
                totalPayout: 0, totalWagered: 0,
            };
        }

        const g = groups[key];
        g.count++;
        g.totalConf += parseFloat(r.confidence) || 0;
        g.totalWagered += 100;

        if (r.result === 'win') {
            g.wins++;
            g.totalPayout += parseFloat(r.payout_on_100) || 0;
        } else if (r.result === 'loss') {
            g.losses++;
        } else if (r.result === 'push') {
            g.pushes++;
            g.totalPayout += 100;
        }

        // Sport totals
        if (!sportTotals[sport]) sportTotals[sport] = { wins: 0, losses: 0, pushes: 0, count: 0, pnl: 0 };
        sportTotals[sport].count++;
        if (r.result === 'win') { sportTotals[sport].wins++; sportTotals[sport].pnl += (parseFloat(r.payout_on_100) || 0) - 100; }
        else if (r.result === 'loss') { sportTotals[sport].losses++; sportTotals[sport].pnl -= 100; }
        else { sportTotals[sport].pushes++; }

        // Tier totals
        if (!tierTotals[tier]) tierTotals[tier] = { wins: 0, losses: 0, pushes: 0, count: 0, pnl: 0 };
        tierTotals[tier].count++;
        if (r.result === 'win') { tierTotals[tier].wins++; tierTotals[tier].pnl += (parseFloat(r.payout_on_100) || 0) - 100; }
        else if (r.result === 'loss') { tierTotals[tier].losses++; tierTotals[tier].pnl -= 100; }
        else { tierTotals[tier].pushes++; }
    }

    return { hasData: true, results, groups, sportTotals, tierTotals };
}

// ============================================================
// STEP 2: Compute Brier Score (Calibration Quality)
// ============================================================
function computeBrierFromResults(results) {
    if (!results || results.length === 0) return null;

    let brierSum = 0;
    const buckets = {};

    for (const r of results) {
        if (r.result === 'push') continue;

        const confidence = (parseFloat(r.confidence) || 50) / 100;
        const actual = r.result === 'win' ? 1 : 0;

        brierSum += Math.pow(confidence - actual, 2);

        // Bucket by 5% bands
        const bucketKey = Math.round(confidence * 20) * 5;
        if (!buckets[bucketKey]) buckets[bucketKey] = { predicted: bucketKey, wins: 0, total: 0 };
        buckets[bucketKey].total++;
        if (actual === 1) buckets[bucketKey].wins++;
    }

    const decidedPicks = results.filter(r => r.result !== 'push');
    const brierScore = decidedPicks.length > 0 ? brierSum / decidedPicks.length : null;

    const calibrationBuckets = Object.values(buckets)
        .filter(b => b.total >= 3)
        .map(b => ({
            predicted: b.predicted,
            actual: Math.round((b.wins / b.total) * 100),
            count: b.total,
            deviation: Math.abs(Math.round((b.wins / b.total) * 100) - b.predicted),
        }))
        .sort((a, b) => a.predicted - b.predicted);

    return {
        brierScore: brierScore != null ? Math.round(brierScore * 10000) / 10000 : null,
        calibrationBuckets,
        totalDecided: decidedPicks.length,
    };
}

// ============================================================
// STEP 3: Analyze Model Predictions vs Outcomes
// ============================================================
async function analyzeModelPredictions(lookbackDays = 14) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackDays);
    const startStr = startDate.toISOString().split('T')[0];

    const predictions = await query(
        `SELECT mp.game_id, mp.home_win_prob, mp.away_win_prob, mp.best_bet_type,
                mp.best_bet_team, mp.best_bet_edge, mp.tier as model_tier,
                pr.result,
                dp.tier as final_tier, dp.pick_type, dp.confidence
         FROM model_predictions mp
         LEFT JOIN daily_picks dp ON dp.game_id = mp.game_id AND dp.pick_date = mp.prediction_date
         LEFT JOIN pick_results pr ON pr.pick_id = dp.id
         WHERE mp.prediction_date >= $1`,
        [startStr]
    );

    if (!predictions || predictions.length === 0) {
        return { hasData: false };
    }

    // Calculate model accuracy by tier
    const tierAccuracy = {};
    const edgeBuckets = { small: { wins: 0, total: 0 }, medium: { wins: 0, total: 0 }, large: { wins: 0, total: 0 } };

    for (const p of predictions) {
        if (!p.result || p.result === 'push') continue;

        const tier = p.final_tier || p.model_tier || 'unknown';
        if (!tierAccuracy[tier]) tierAccuracy[tier] = { wins: 0, total: 0 };
        tierAccuracy[tier].total++;
        if (p.result === 'win') tierAccuracy[tier].wins++;

        // Edge analysis
        const edge = Math.abs(parseFloat(p.best_bet_edge) || 0);
        if (edge < 0.05) { edgeBuckets.small.total++; if (p.result === 'win') edgeBuckets.small.wins++; }
        else if (edge < 0.08) { edgeBuckets.medium.total++; if (p.result === 'win') edgeBuckets.medium.wins++; }
        else { edgeBuckets.large.total++; if (p.result === 'win') edgeBuckets.large.wins++; }
    }

    return { hasData: true, tierAccuracy, edgeBuckets, totalPredictions: predictions.length };
}

// ============================================================
// STEP 4: Generate Refinement Recommendations via Gemini
// ============================================================
async function generateRefinementRecommendations(perfData, brierData, predictionData) {
    const currentConfig = {};
    for (const [sport, config] of Object.entries(SPORT_CONFIG)) {
        const name = SPORT_NAMES[sport] || sport;
        currentConfig[sport] = { name, ...config };
    }

    // Build the refinement prompt
    let prompt = `You are a sports betting model calibration expert. Analyze the following performance data from our betting model and recommend specific parameter adjustments.

CURRENT MODEL CONFIGURATION (SPORT_CONFIG):
${JSON.stringify(currentConfig, null, 2)}

`;

    // Add performance data
    if (perfData.hasData) {
        prompt += `\nPERFORMANCE DATA (last 14 days):\n`;

        // Sport totals
        prompt += `\nBy Sport:\n`;
        for (const [sport, stats] of Object.entries(perfData.sportTotals)) {
            const name = SPORT_NAMES[sport] || sport;
            const decided = stats.wins + stats.losses;
            const wr = decided > 0 ? ((stats.wins / decided) * 100).toFixed(1) : 'N/A';
            prompt += `  ${name}: ${stats.wins}W-${stats.losses}L (${wr}% win rate), P&L: ${stats.pnl >= 0 ? '+' : ''}$${stats.pnl.toFixed(0)}\n`;
        }

        // Tier totals
        prompt += `\nBy Tier:\n`;
        for (const [tier, stats] of Object.entries(perfData.tierTotals)) {
            const decided = stats.wins + stats.losses;
            const wr = decided > 0 ? ((stats.wins / decided) * 100).toFixed(1) : 'N/A';
            prompt += `  ${tier}: ${stats.wins}W-${stats.losses}L (${wr}% win rate), P&L: ${stats.pnl >= 0 ? '+' : ''}$${stats.pnl.toFixed(0)}\n`;
        }

        // Detailed groups
        prompt += `\nDetailed Breakdown:\n`;
        for (const [key, g] of Object.entries(perfData.groups)) {
            const decided = g.wins + g.losses;
            if (decided < 2) continue;
            const wr = ((g.wins / decided) * 100).toFixed(0);
            const avgConf = (g.totalConf / g.count).toFixed(0);
            const name = SPORT_NAMES[g.sport] || g.sport;
            const pnl = g.totalPayout - g.totalWagered;
            prompt += `  ${name} ${g.pickType} (${g.tier}): ${wr}% hit rate (${g.wins}W-${g.losses}L), avg confidence: ${avgConf}%, P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(0)}\n`;
        }
    }

    // Add Brier score data
    if (brierData && brierData.brierScore != null) {
        prompt += `\nCALIBRATION (Brier Score): ${brierData.brierScore} (0=perfect, 0.25=good for sports, 1=worst)\n`;
        if (brierData.calibrationBuckets.length > 0) {
            prompt += `Calibration Curve:\n`;
            for (const b of brierData.calibrationBuckets) {
                const emoji = b.deviation > 10 ? '⚠️' : '✅';
                prompt += `  ${emoji} Predicted ${b.predicted}% → Actual ${b.actual}% (${b.count} picks, deviation: ${b.deviation}%)\n`;
            }
        }
    }

    // Add model prediction accuracy
    if (predictionData.hasData) {
        prompt += `\nMODEL PREDICTION ACCURACY:\n`;
        for (const [tier, stats] of Object.entries(predictionData.tierAccuracy)) {
            const wr = stats.total > 0 ? ((stats.wins / stats.total) * 100).toFixed(1) : 'N/A';
            prompt += `  ${tier}: ${wr}% (${stats.wins}/${stats.total})\n`;
        }
        prompt += `By Edge Size:\n`;
        for (const [bucket, stats] of Object.entries(predictionData.edgeBuckets)) {
            if (stats.total === 0) continue;
            const wr = ((stats.wins / stats.total) * 100).toFixed(1);
            prompt += `  ${bucket} edge: ${wr}% (${stats.wins}/${stats.total})\n`;
        }
    }

    prompt += `
Based on this data, provide SPECIFIC numerical adjustments to improve the model. Focus on:
1. Sports where we are consistently losing money — consider raising evThreshold
2. Tiers where win rates diverge from confidence — recalibrate
3. Edge buckets where small-edge picks are losing — raise the floor
4. Sports where home advantage seems off — adjust homeAdvantage
5. Weight adjustments if net rating or form weight seems over/underweighted

Respond in VALID JSON only:
{
  "overall_assessment": "1-2 sentence summary of model health",
  "brier_assessment": "calibration quality assessment",
  "adjustments": [
    {
      "sport": "sport_key from SPORT_CONFIG",
      "parameter": "parameter name (e.g. evThreshold, homeAdvantage, netRatingWeight)",
      "current_value": 0.05,
      "recommended_value": 0.06,
      "reason": "specific data-backed reason for the change"
    }
  ],
  "general_recommendations": ["list of broader model improvement suggestions"]
}`;

    try {
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
        });

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        return JSON.parse(text);
    } catch (err) {
        console.error('   ⚠️ Gemini refinement analysis failed:', err.message);
        return null;
    }
}

// ============================================================
// STEP 5: Log Refinement Results
// ============================================================
async function logRefinement(perfData, brierData, predictionData, recommendations) {
    try {
        // Ensure table exists
        await execute(`
            CREATE TABLE IF NOT EXISTS model_refinement_log (
                id SERIAL PRIMARY KEY,
                run_date DATE NOT NULL DEFAULT CURRENT_DATE,
                total_picks INTEGER,
                brier_score NUMERIC(6,4),
                overall_win_rate NUMERIC(5,2),
                overall_pnl NUMERIC(10,2),
                sport_breakdown JSONB,
                tier_breakdown JSONB,
                calibration_buckets JSONB,
                adjustments JSONB,
                general_recommendations JSONB,
                overall_assessment TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(run_date)
            )
        `);

        // Calculate overall stats
        const allResults = perfData.results || [];
        const totalWins = allResults.filter(r => r.result === 'win').length;
        const totalLosses = allResults.filter(r => r.result === 'loss').length;
        const decided = totalWins + totalLosses;
        const overallWinRate = decided > 0 ? Math.round((totalWins / decided) * 10000) / 100 : 0;
        const overallPnl = Object.values(perfData.sportTotals || {}).reduce((s, t) => s + t.pnl, 0);

        await execute(
            `INSERT INTO model_refinement_log (run_date, total_picks, brier_score, overall_win_rate, overall_pnl,
                sport_breakdown, tier_breakdown, calibration_buckets, adjustments, general_recommendations, overall_assessment)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (run_date) DO UPDATE SET
                total_picks = EXCLUDED.total_picks, brier_score = EXCLUDED.brier_score,
                overall_win_rate = EXCLUDED.overall_win_rate, overall_pnl = EXCLUDED.overall_pnl,
                sport_breakdown = EXCLUDED.sport_breakdown, tier_breakdown = EXCLUDED.tier_breakdown,
                calibration_buckets = EXCLUDED.calibration_buckets, adjustments = EXCLUDED.adjustments,
                general_recommendations = EXCLUDED.general_recommendations, overall_assessment = EXCLUDED.overall_assessment`,
            [
                new Date().toISOString().split('T')[0],
                allResults.length,
                brierData?.brierScore || null,
                overallWinRate,
                Math.round(overallPnl * 100) / 100,
                JSON.stringify(perfData.sportTotals || {}),
                JSON.stringify(perfData.tierTotals || {}),
                JSON.stringify(brierData?.calibrationBuckets || []),
                JSON.stringify(recommendations?.adjustments || []),
                JSON.stringify(recommendations?.general_recommendations || []),
                recommendations?.overall_assessment || 'No assessment generated',
            ]
        );

        console.log('   💾 Refinement log saved to model_refinement_log');
    } catch (err) {
        console.error('   ⚠️ Failed to log refinement:', err.message);
    }
}

// ============================================================
// STEP 6: Generate Enhanced Calibration Context for Analyzer
// ============================================================
function generateEnhancedCalibrationText(perfData, brierData, recommendations) {
    if (!perfData.hasData) return '';

    let text = '\nMODEL REFINEMENT INSIGHTS (auto-generated from recent performance):\n';

    // Brier score
    if (brierData?.brierScore != null) {
        text += `Calibration Quality (Brier Score): ${brierData.brierScore} — `;
        if (brierData.brierScore < 0.20) text += 'Excellent calibration.\n';
        else if (brierData.brierScore < 0.25) text += 'Good calibration.\n';
        else if (brierData.brierScore < 0.30) text += 'Fair calibration — confidence adjustments needed.\n';
        else text += 'Poor calibration — significant confidence recalibration needed.\n';
    }

    // Per-sport performance
    text += '\nRecent Performance by Sport:\n';
    for (const [sport, stats] of Object.entries(perfData.sportTotals)) {
        const name = SPORT_NAMES[sport] || sport;
        const decided = stats.wins + stats.losses;
        if (decided < 3) continue;
        const wr = ((stats.wins / decided) * 100).toFixed(0);
        const pnlStr = stats.pnl >= 0 ? `+$${stats.pnl.toFixed(0)}` : `-$${Math.abs(stats.pnl).toFixed(0)}`;
        const status = stats.pnl >= 0 ? '✅ Profitable' : '⚠️ Losing money';
        text += `  ${name}: ${wr}% win rate (${stats.wins}W-${stats.losses}L), ${pnlStr} → ${status}\n`;
    }

    // Tier performance
    text += '\nPerformance by Tier:\n';
    for (const [tier, stats] of Object.entries(perfData.tierTotals)) {
        const decided = stats.wins + stats.losses;
        if (decided < 3) continue;
        const wr = ((stats.wins / decided) * 100).toFixed(0);
        text += `  ${tier}: ${wr}% win rate (${stats.wins}W-${stats.losses}L)\n`;
    }

    // Key recommendations
    if (recommendations?.adjustments?.length > 0) {
        text += '\nKEY ADJUSTMENTS FROM REFINEMENT BOT:\n';
        for (const adj of recommendations.adjustments.slice(0, 5)) {
            const sportName = SPORT_NAMES[adj.sport] || adj.sport;
            text += `  ⚙️ ${sportName}: ${adj.parameter} ${adj.current_value} → ${adj.recommended_value} (${adj.reason})\n`;
        }
    }

    if (recommendations?.general_recommendations?.length > 0) {
        text += '\nGENERAL GUIDANCE:\n';
        for (const rec of recommendations.general_recommendations.slice(0, 3)) {
            text += `  • ${rec}\n`;
        }
    }

    return text;
}

// ============================================================
// MAIN: Run Daily Refinement
// ============================================================
async function runRefiner() {
    console.log('🔧 PARLAY BOT — Daily Model Refiner');
    console.log(`📅 ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
    console.log('='.repeat(60));

    // Step 1: Gather performance data
    console.log('\n📊 Step 1: Gathering performance data (last 14 days)...');
    const perfData = await gatherPerformanceData(14);

    if (!perfData.hasData) {
        console.log('   ⚠️ No settled picks found. Refinement requires settled data from the settler.');
        console.log('   Skipping refinement run.');
        await closePool();
        return;
    }

    console.log(`   ✅ Found ${perfData.results.length} settled picks across ${Object.keys(perfData.sportTotals).length} sports`);

    // Print quick summary
    for (const [sport, stats] of Object.entries(perfData.sportTotals)) {
        const name = SPORT_NAMES[sport] || sport;
        const decided = stats.wins + stats.losses;
        const wr = decided > 0 ? ((stats.wins / decided) * 100).toFixed(0) : 'N/A';
        const pnlStr = stats.pnl >= 0 ? `+$${stats.pnl.toFixed(0)}` : `-$${Math.abs(stats.pnl).toFixed(0)}`;
        console.log(`   ${stats.pnl >= 0 ? '✅' : '❌'} ${name}: ${wr}% (${stats.wins}W-${stats.losses}L) ${pnlStr}`);
    }

    // Step 2: Compute Brier score
    console.log('\n📐 Step 2: Computing Brier Score...');
    const brierData = computeBrierFromResults(perfData.results);

    if (brierData?.brierScore != null) {
        const quality = brierData.brierScore < 0.20 ? 'Excellent' : brierData.brierScore < 0.25 ? 'Good' : brierData.brierScore < 0.30 ? 'Fair' : 'Poor';
        console.log(`   📊 Brier Score: ${brierData.brierScore} (${quality})`);

        if (brierData.calibrationBuckets.length > 0) {
            console.log('   Calibration curve:');
            for (const b of brierData.calibrationBuckets) {
                const emoji = b.deviation > 10 ? '⚠️' : '✅';
                console.log(`     ${emoji} Predicted ${b.predicted}% → Actual ${b.actual}% (n=${b.count}, dev=${b.deviation}%)`);
            }
        }
    } else {
        console.log('   ⚠️ Not enough data to compute Brier Score');
    }

    // Step 3: Analyze model predictions
    console.log('\n🔍 Step 3: Analyzing model predictions...');
    const predictionData = await analyzeModelPredictions(14);

    if (predictionData.hasData) {
        console.log('   Tier accuracy:');
        for (const [tier, stats] of Object.entries(predictionData.tierAccuracy)) {
            if (stats.total === 0) continue;
            const wr = ((stats.wins / stats.total) * 100).toFixed(1);
            console.log(`     ${tier}: ${wr}% (${stats.wins}/${stats.total})`);
        }
    }

    // Step 4: Get AI recommendations
    console.log('\n🤖 Step 4: Generating refinement recommendations via Gemini...');
    const recommendations = await generateRefinementRecommendations(perfData, brierData, predictionData);

    if (recommendations) {
        console.log(`   📋 Assessment: ${recommendations.overall_assessment}`);

        if (recommendations.adjustments?.length > 0) {
            console.log(`   ⚙️ ${recommendations.adjustments.length} parameter adjustments recommended:`);
            for (const adj of recommendations.adjustments) {
                const sportName = SPORT_NAMES[adj.sport] || adj.sport;
                console.log(`     → ${sportName}.${adj.parameter}: ${adj.current_value} → ${adj.recommended_value}`);
                console.log(`       Reason: ${adj.reason}`);
            }
        } else {
            console.log('   ✅ No parameter adjustments recommended — model is performing well');
        }

        if (recommendations.general_recommendations?.length > 0) {
            console.log('   📝 General recommendations:');
            for (const rec of recommendations.general_recommendations) {
                console.log(`     • ${rec}`);
            }
        }
    } else {
        console.log('   ⚠️ Could not generate recommendations (Gemini unavailable)');
    }

    // Step 5: Log results
    console.log('\n💾 Step 5: Logging refinement results...');
    await logRefinement(perfData, brierData, predictionData, recommendations);

    // Step 6: Generate enhanced calibration text for analyzer
    const calibrationText = generateEnhancedCalibrationText(perfData, brierData, recommendations);

    console.log(`\n${'='.repeat(60)}`);
    console.log('🔧 Daily Model Refinement Complete!');
    console.log(`   📊 Picks analyzed: ${perfData.results.length}`);
    console.log(`   📐 Brier Score: ${brierData?.brierScore ?? 'N/A'}`);
    console.log(`   ⚙️ Adjustments: ${recommendations?.adjustments?.length ?? 0}`);
    console.log('='.repeat(60));

    await closePool();
}

// Export for use by calibrator and pipeline
module.exports = { runRefiner, generateEnhancedCalibrationText, gatherPerformanceData, computeBrierFromResults };

// Run directly if called as script
if (require.main === module) {
    runRefiner().catch(async err => {
        console.error('💥 Refiner crashed:', err);
        await closePool();
        process.exit(1);
    });
}
