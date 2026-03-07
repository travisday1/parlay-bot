// ============================================================
// PARLAY BOT — AI Analysis Engine (Phase 2)
// Pulls raw odds from Supabase, sends to Gemini for analysis,
// and stores structured picks + recommended parlays back in DB.
// ============================================================
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { enrichGames, formatEnrichmentForPrompt } = require('./enricher');
const { generateCalibrationContext } = require('./calibrator');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Group games by sport for batched analysis
const US_SPORT_KEYS = [
    'basketball_nba',
    'basketball_ncaab',
    'icehockey_nhl',
    'americanfootball_nfl',
    'baseball_mlb',
];

async function fetchTodaysGames() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get games starting from now through tomorrow — US sports only
    const { data: games, error } = await supabase
        .from('games')
        .select(`
            *,
            odds (*)
        `)
        .in('sport_key', US_SPORT_KEYS)
        .gte('commence_time', today.toISOString())
        .lte('commence_time', tomorrow.toISOString())
        .order('commence_time', { ascending: true });

    if (error) throw error;
    return games;
}

function buildAnalysisPrompt(games, sportTitle, calibrationText) {
    const gameLines = games.map((g, i) => {
        const odds = g.odds?.[0];
        if (!odds) return null;

        let block = `
Game ${i + 1}: ${g.away_team} @ ${g.home_team}
  Time: ${new Date(g.commence_time).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET
  Moneyline: ${g.away_team} ${odds.away_odds > 0 ? '+' : ''}${odds.away_odds} | ${g.home_team} ${odds.home_odds > 0 ? '+' : ''}${odds.home_odds}
  Spread: ${g.home_team} ${odds.home_point > 0 ? '+' : ''}${odds.home_point} | ${g.away_team} ${odds.away_point > 0 ? '+' : ''}${odds.away_point}
  Over/Under: ${odds.over_point} (O ${odds.over_odds > 0 ? '+' : ''}${odds.over_odds} / U ${odds.under_odds > 0 ? '+' : ''}${odds.under_odds})`;

        // Append enrichment data if available
        const enrichment = formatEnrichmentForPrompt(g);
        if (enrichment) block += enrichment;

        return block;
    }).filter(Boolean).join('\n');

    return `You are an elite sports betting analyst AI called "Parlay Bot". Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

Analyze the following ${sportTitle} games with their DraftKings odds AND enrichment data.

For EACH game, use ALL of the following — especially the REAL-TIME DATA provided below each game:
- The fatigue/schedule data (🔴 Fatigued teams cover the spread ~45% of the time in the NBA)
- The injury report (missing star players can swing a line 3-5+ points)
- The recency-weighted O/U trends (recent 5-game trends matter more than season averages)
- Line movement signals (significant movement = sharp money activity)
- Current team records and standings (use your training knowledge)
- Historical matchup trends (use your training knowledge)

For each game, produce:
1. A SIDE pick (moneyline or spread) with a tier classification:
   - "lock" = 75%+ confidence, strong edge identified
   - "value" = 60-74% confidence, good value on the line
   - "longshot" = Below 60% confidence, but the odds offer significant value
   - "skip" = No clear edge, avoid

2. An OVER/UNDER assessment for every game (even if the side pick is skip).
   Factor in: team pace, recent scoring trends, injuries to key scorers, fatigue/back-to-backs, and how the posted total compares to recency-weighted averages.

IMPORTANT: Be selective. Only assign "lock" to games where you have VERY HIGH confidence. Most games should be "value" or "skip".

${calibrationText || ''}

Here are today's ${sportTitle} games with enrichment data:
${gameLines}

Respond in VALID JSON format only. No markdown, no explanation outside the JSON.
{
  "picks": [
    {
      "game_index": 1,
      "away_team": "Team A",
      "home_team": "Team B",
      "tier": "lock|value|longshot|skip",
      "pick_type": "moneyline|spread|over|under",
      "picked_team": "Team A or Team B or Over or Under",
      "picked_odds": -150,
      "picked_line": null,
      "confidence": 82,
      "rationale": "2-3 sentence analysis referencing the enrichment data (fatigue, injuries, trends)",
      "over_confidence": 65,
      "under_confidence": 35,
      "ou_pick": "over|under|skip",
      "ou_rationale": "Why Over or Under based on scoring trends, pace, fatigue, injuries to scorers"
    }
  ]
}`;
}

function americanToDecimal(american) {
    if (american > 0) return (american / 100) + 1;
    return (100 / Math.abs(american)) + 1;
}

function calculateParlayOdds(legs) {
    let combined = 1;
    for (const leg of legs) {
        combined *= americanToDecimal(leg.odds);
    }
    return Math.round((combined - 1) * 100) / 100; // decimal multiplier
}

async function analyzeGames(games, sportTitle, calibrationText) {
    if (games.length === 0) return { picks: [], recommended_parlays: [] };

    const prompt = buildAnalysisPrompt(games, sportTitle, calibrationText);

    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
            temperature: 0.3,
            responseMimeType: 'application/json'
        }
    });

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    try {
        return JSON.parse(responseText);
    } catch (e) {
        // Try to extract JSON from the response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
        throw new Error(`Failed to parse AI response: ${responseText.substring(0, 200)}`);
    }
}

async function storePicks(analysis, games, sportTitle) {
    const picks = analysis.picks || [];
    const parlays = analysis.recommended_parlays || [];

    let storedPicks = 0;
    let storedParlays = 0;

    // Store individual picks
    for (const pick of picks) {
        if (pick.tier === 'skip') continue;

        const gameIndex = pick.game_index - 1;
        const game = games[gameIndex];
        if (!game) continue;

        // Ensure picked_line is set for spread and O/U picks (settler needs this)
        let pickedLine = pick.picked_line || null;
        const gameOdds = game.odds?.[0];
        if (gameOdds && !pickedLine) {
            if (pick.pick_type === 'spread') {
                // Use the spread points for the picked team
                if (pick.picked_team === game.home_team) {
                    pickedLine = gameOdds.home_point;
                } else if (pick.picked_team === game.away_team) {
                    pickedLine = gameOdds.away_point;
                }
            } else if (pick.pick_type === 'over' || pick.pick_type === 'under') {
                // Use the total line
                pickedLine = gameOdds.over_point;
            }
        }

        const { error } = await supabase
            .from('daily_picks')
            .upsert({
                game_id: game.game_id,
                pick_date: new Date().toISOString().split('T')[0],
                tier: pick.tier,
                pick_type: pick.pick_type,
                picked_team: pick.picked_team,
                picked_odds: pick.picked_odds,
                picked_line: pickedLine,
                confidence: pick.confidence,
                rationale: pick.rationale
            }, { onConflict: 'game_id,pick_date,pick_type' });

        if (error) {
            console.error(`   ⚠️ Error storing pick for ${pick.picked_team}:`, error.message);
        } else {
            storedPicks++;
        }
    }

    // Store recommended parlays
    for (const parlay of parlays) {
        const combinedOdds = calculateParlayOdds(parlay.legs);
        const payoutOn100 = Math.round(combinedOdds * 100 * 100) / 100;

        // Calculate average confidence from the parlay legs
        const legTeams = parlay.legs.map(l => l.picked_team);
        const matchingPicks = picks.filter(p => legTeams.includes(p.picked_team));
        const avgConfidence = matchingPicks.length > 0
            ? Math.round(matchingPicks.reduce((s, p) => s + p.confidence, 0) / matchingPicks.length)
            : 50;

        const { error } = await supabase
            .from('recommended_parlays')
            .upsert({
                parlay_date: new Date().toISOString().split('T')[0],
                tier: parlay.tier,
                name: `${sportTitle}: ${parlay.name}`,
                legs: parlay.legs,
                combined_odds: combinedOdds,
                payout_on_100: payoutOn100,
                confidence: avgConfidence,
                rationale: parlay.rationale
            }, { onConflict: 'parlay_date,tier' });

        if (error) {
            console.error(`   ⚠️ Error storing parlay ${parlay.name}:`, error.message);
        } else {
            storedParlays++;
        }
    }

    return { storedPicks, storedParlays };
}

async function runFullAnalysis() {
    console.log('🧠 PARLAY BOT — AI Analysis Engine');
    console.log(`📅 ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
    console.log('='.repeat(60));

    // Fetch all today's games from Supabase
    const allGames = await fetchTodaysGames();
    console.log(`\n📦 Found ${allGames.length} games in the database for today.\n`);

    // Load calibration data from recent settled results
    const calibration = await generateCalibrationContext(14);
    if (calibration.hasData) {
        console.log(`📊 Calibration loaded — feeding accuracy data into AI prompt`);
    } else {
        console.log(`📊 No calibration data yet — run settler.js after games complete to build feedback loop`);
    }

    if (allGames.length === 0) {
        console.log('⚠️ No games found. Run updater.js first to fetch odds.');
        return;
    }

    // Group games by sport
    const sportGroups = {};
    for (const game of allGames) {
        const title = game.sport_title || game.sport_key;
        if (!sportGroups[title]) sportGroups[title] = [];
        sportGroups[title].push(game);
    }

    let totalPicks = 0;
    const allPicksForParlays = []; // Collect all picks across sports for cross-sport parlays

    // PHASE 1: Analyze each sport for individual picks (with enrichment)
    for (const [sportTitle, games] of Object.entries(sportGroups)) {
        console.log(`\n🏟️ Analyzing ${sportTitle} (${games.length} games)...`);

        try {
            const batchSize = 25;
            let sportPicks = 0;

            for (let i = 0; i < games.length; i += batchSize) {
                const batch = games.slice(i, i + batchSize);
                const batchLabel = games.length > batchSize
                    ? ` [batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(games.length / batchSize)}]`
                    : '';

                // Enrich games with fatigue, injuries, O/U trends, line movement
                const enrichedBatch = await enrichGames(batch);

                process.stdout.write(`   🤖 Sending to Gemini${batchLabel}...`);
                const analysis = await analyzeGames(enrichedBatch, sportTitle, calibration.text);

                const lockCount = (analysis.picks || []).filter(p => p.tier === 'lock').length;
                const valueCount = (analysis.picks || []).filter(p => p.tier === 'value').length;
                const longshotCount = (analysis.picks || []).filter(p => p.tier === 'longshot').length;
                console.log(` ✅ ${lockCount} locks, ${valueCount} value, ${longshotCount} longshots`);

                // Print the locks
                for (const pick of (analysis.picks || [])) {
                    if (pick.tier === 'lock') {
                        console.log(`   🔒 LOCK: ${pick.picked_team} (${pick.pick_type}) @ ${pick.picked_odds > 0 ? '+' : ''}${pick.picked_odds} — ${pick.confidence}% confidence`);
                    }
                }

                // Store picks (without parlays)
                const picksOnly = { picks: analysis.picks || [], recommended_parlays: [] };
                const { storedPicks } = await storePicks(picksOnly, batch, sportTitle);
                sportPicks += storedPicks;

                // Collect non-skip picks for cross-sport parlay building
                for (const pick of (analysis.picks || [])) {
                    if (pick.tier !== 'skip') {
                        const gameIdx = pick.game_index - 1;
                        const game = batch[gameIdx];
                        allPicksForParlays.push({
                            sport: sportTitle,
                            team: pick.picked_team,
                            type: pick.pick_type,
                            odds: pick.picked_odds,
                            confidence: pick.confidence,
                            tier: pick.tier,
                            game: game ? `${game.away_team} @ ${game.home_team}` : '',
                        });
                    }
                }
            }

            totalPicks += sportPicks;
            console.log(`   💾 Stored ${sportPicks} picks`);

        } catch (error) {
            console.error(`   ❌ Error analyzing ${sportTitle}:`, error.message);
        }
    }

    // PHASE 2: Build cross-sport parlays from all collected picks
    console.log(`\n🎲 Building cross-sport recommended parlays from ${allPicksForParlays.length} picks...`);
    let totalParlays = 0;

    if (allPicksForParlays.length >= 3) {
        try {
            totalParlays = await buildCrossSportParlays(allPicksForParlays);
            console.log(`   ✅ ${totalParlays} cross-sport parlays created`);
        } catch (error) {
            console.error(`   ❌ Error building cross-sport parlays:`, error.message);
        }
    } else {
        console.log('   ⚠️ Not enough picks across sports to build parlays.');
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎯 Analysis complete!`);
    console.log(`   📊 ${totalPicks} picks stored across all sports`);
    console.log(`   🎲 ${totalParlays} recommended cross-sport parlays created`);
    console.log(`   💾 All data saved to Supabase`);
}

// ===== CROSS-SPORT PARLAY BUILDER =====
async function buildCrossSportParlays(allPicks) {
    const pickSummary = allPicks.map((p, i) =>
        `${i + 1}. [${p.sport}] ${p.team} ${p.type} @ ${p.odds > 0 ? '+' : ''}${p.odds} — ${p.confidence}% (${p.tier}) — ${p.game}`
    ).join('\n');

    const prompt = `You are the Parlay Bot. You have analyzed today's games across multiple sports and identified these picks:

${pickSummary}

Now build 3 recommended CROSS-SPORT parlays that MIX different sports for variety and value:

1. "The Safe Bag" (tier: "safe") — Use the 3 highest-confidence picks (75%+ lock tier). Prioritize mixing sports if possible.
2. "The Value Play" (tier: "value") — Use DIFFERENT picks than Safe Bag, targeting 60-74% confidence (value tier). Must mix at least 2 different sports.
3. "The Big Swing" (tier: "longshot") — Include at least one longshot pick (under 60%) for higher payout. Mix sports for variety.

CRITICAL RULES:
- Each parlay should have exactly 3 legs
- NO two parlays should share the same legs
- Mix different sports whenever possible for variety
- Use the exact team names and odds from the pick list above

Respond in VALID JSON only:
{
  "recommended_parlays": [
    {
      "tier": "safe",
      "name": "The Safe Bag",
      "legs": [
        {"picked_team": "Team ML", "odds": -200, "game": "Away @ Home"}
      ],
      "rationale": "Why this combination works across sports"
    }
  ]
}`;

    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
            temperature: 0.3,
            responseMimeType: 'application/json'
        }
    });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text);
    const parlays = parsed.recommended_parlays || [];

    let stored = 0;
    for (const parlay of parlays) {
        const combinedOdds = calculateParlayOdds(parlay.legs);
        const payoutOn100 = Math.round(combinedOdds * 100 * 100) / 100;

        // Look up confidence for each leg from our picks
        const legConfs = parlay.legs.map(leg => {
            const match = allPicks.find(p =>
                p.team.toLowerCase() === (leg.picked_team || '').toLowerCase().replace(/ ml$/i, '')
            );
            return match ? match.confidence : 50;
        });
        const avgConfidence = Math.round(legConfs.reduce((s, c) => s + c, 0) / legConfs.length);

        const { error } = await supabase
            .from('recommended_parlays')
            .upsert({
                parlay_date: new Date().toISOString().split('T')[0],
                tier: parlay.tier,
                name: parlay.name,
                legs: parlay.legs,
                combined_odds: combinedOdds,
                payout_on_100: payoutOn100,
                confidence: avgConfidence,
                rationale: parlay.rationale
            }, { onConflict: 'parlay_date,tier' });

        if (error) {
            console.error(`   ⚠️ Error storing parlay ${parlay.name}:`, error.message);
        } else {
            stored++;
        }
    }

    return stored;
}

runFullAnalysis();
