// ============================================================
// PARLAY BOT — Calibration Engine
// Generates accuracy stats from recent pick_results to inject
// into the AI analysis prompt as a feedback/calibration signal.
// Called by analyzer.js before building prompts.
// ============================================================
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SPORT_NAMES = {
    'basketball_nba': 'NBA',
    'basketball_ncaab': 'NCAAB',
    'icehockey_nhl': 'NHL',
    'americanfootball_nfl': 'NFL',
    'baseball_mlb': 'MLB',
};

async function generateCalibrationContext(lookbackDays = 14) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackDays);
    const startStr = startDate.toISOString().split('T')[0];

    // Join pick_results → daily_picks → games to get sport, tier, pick_type, confidence
    const { data: results, error } = await supabase
        .from('pick_results')
        .select(`
            result,
            daily_picks!inner (
                tier,
                pick_type,
                confidence,
                pick_date,
                game_id,
                games!inner ( sport_key )
            )
        `)
        .gte('daily_picks.pick_date', startStr);

    if (error || !results || results.length === 0) {
        console.log('   📊 No calibration data available yet (need settled picks).');
        return { hasData: false, text: '' };
    }

    // Group results by sport × pick_type × tier
    const groups = {};
    for (const r of results) {
        const sport = r.daily_picks.games.sport_key;
        const type = r.daily_picks.pick_type;
        const tier = r.daily_picks.tier;
        const key = `${sport}|${type}|${tier}`;

        if (!groups[key]) {
            groups[key] = { sport, type, tier, wins: 0, losses: 0, pushes: 0, totalConf: 0, count: 0 };
        }

        if (r.result === 'win') groups[key].wins++;
        else if (r.result === 'loss') groups[key].losses++;
        else groups[key].pushes++;

        groups[key].totalConf += parseFloat(r.daily_picks.confidence) || 0;
        groups[key].count++;
    }

    // Build calibration text for the prompt
    let text = `\nCALIBRATION DATA — Your actual pick accuracy over the last ${lookbackDays} days (${results.length} settled picks):\n`;
    text += `Use this data to adjust your confidence scores. If a category shows you are OVERCONFIDENT, lower your confidence for those picks. If UNDERCONFIDENT, you can be bolder.\n\n`;

    const sortedKeys = Object.keys(groups).sort();
    let meaningfulGroups = 0;

    for (const key of sortedKeys) {
        const g = groups[key];
        const decided = g.wins + g.losses;
        if (decided < 3) continue; // Need at least 3 decided picks to be meaningful

        meaningfulGroups++;
        const hitRate = ((g.wins / decided) * 100).toFixed(0);
        const avgConf = (g.totalConf / g.count).toFixed(0);
        const sport = SPORT_NAMES[g.sport] || g.sport;

        let calibration;
        const diff = parseInt(avgConf) - parseInt(hitRate);
        if (diff > 10) calibration = '⚠️ SIGNIFICANTLY OVERCONFIDENT — reduce confidence by 10-15 points for these picks';
        else if (diff > 5) calibration = '⚠️ OVERCONFIDENT — reduce confidence by 5-10 points for these picks';
        else if (diff < -10) calibration = '✅ UNDERCONFIDENT — you can increase confidence by 10+ points';
        else if (diff < -5) calibration = '✅ UNDERCONFIDENT — you can increase confidence by 5-10 points';
        else calibration = '✅ Well calibrated — confidence roughly matches actual hit rate';

        text += `- ${sport} ${g.type} (${g.tier}): ${hitRate}% actual hit rate (${g.wins}W-${g.losses}L), your avg confidence was ${avgConf}% → ${calibration}\n`;
    }

    if (meaningfulGroups === 0) {
        console.log('   📊 Not enough settled picks per category for calibration (need 3+ per group).');
        return { hasData: false, text: '' };
    }

    // Overall summary
    const totalWins = results.filter(r => r.result === 'win').length;
    const totalLosses = results.filter(r => r.result === 'loss').length;
    const overallRate = totalWins + totalLosses > 0
        ? ((totalWins / (totalWins + totalLosses)) * 100).toFixed(1)
        : 'N/A';
    text += `\nOVERALL: ${overallRate}% hit rate (${totalWins}W-${totalLosses}L) across all sports and pick types.\n`;

    return { hasData: true, text };
}

module.exports = { generateCalibrationContext };
