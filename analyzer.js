// ============================================================
// PARLAY BOT — AI Analysis Engine (Phase 2)
// Pulls raw odds from Supabase, sends to Gemini for analysis,
// and stores structured picks + recommended parlays back in DB.
// ============================================================
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Group games by sport for batched analysis
async function fetchTodaysGames() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get games starting from now through tomorrow
    const { data: games, error } = await supabase
        .from('games')
        .select(`
            *,
            odds (*)
        `)
        .gte('commence_time', today.toISOString())
        .lte('commence_time', tomorrow.toISOString())
        .order('commence_time', { ascending: true });

    if (error) throw error;
    return games;
}

function buildAnalysisPrompt(games, sportTitle) {
    const gameLines = games.map((g, i) => {
        const odds = g.odds?.[0]; // combined record
        if (!odds) return null;

        return `
Game ${i + 1}: ${g.away_team} @ ${g.home_team}
  Time: ${new Date(g.commence_time).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET
  Moneyline: ${g.away_team} ${odds.away_odds > 0 ? '+' : ''}${odds.away_odds} | ${g.home_team} ${odds.home_odds > 0 ? '+' : ''}${odds.home_odds}
  Spread: ${g.home_team} ${odds.home_point > 0 ? '+' : ''}${odds.home_point} | ${g.away_team} ${odds.away_point > 0 ? '+' : ''}${odds.away_point}
  Over/Under: ${odds.over_point} (O ${odds.over_odds > 0 ? '+' : ''}${odds.over_odds} / U ${odds.under_odds > 0 ? '+' : ''}${odds.under_odds})`;
    }).filter(Boolean).join('\n');

    return `You are an elite sports betting analyst AI called "Parlay Bot". Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

Analyze the following ${sportTitle} games with their DraftKings odds. For EACH game, use your knowledge of:
- Current team records and standings
- Key injuries / player availability
- Recent form (last 5-10 games)
- Rest days / back-to-back situations
- Home/away performance splits
- Historical matchup trends

For each game, produce a pick with a tier classification:
- "lock" = 75%+ confidence, strong edge identified
- "value" = 60-74% confidence, good value on the line
- "longshot" = Below 60% confidence, but the odds offer significant value
- "skip" = No clear edge, avoid

IMPORTANT: Be selective. Only assign "lock" to games where you have VERY HIGH confidence. Most games should be "value" or "skip".

Here are today's ${sportTitle} games:
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
      "rationale": "2-3 sentence analysis explaining the pick, referencing specific stats/injuries/trends"
    }
  ],
  "recommended_parlays": [
    {
      "tier": "safe",
      "name": "The Safe Bag",
      "legs": [
        {"picked_team": "Team B ML", "odds": -200, "game": "Team A @ Team B"}
      ],
      "rationale": "Why this parlay makes sense together"
    },
    {
      "tier": "value",
      "name": "The Value Play",
      "legs": [...],
      "rationale": "..."
    },
    {
      "tier": "longshot",
      "name": "The Big Swing",
      "legs": [...],
      "rationale": "..."
    }
  ]
}

CRITICAL PARLAY RULES:
1. "The Safe Bag" MUST include your 3 highest-confidence LOCK picks (75%+ confidence). These should be heavy favorites with the best chance of winning. The combined payout will be low — that's expected.
2. "The Value Play" MUST use DIFFERENT picks than The Safe Bag. Focus on "value" tier picks (60-74% confidence) where the odds offer a better risk/reward ratio.
3. "The Big Swing" MUST include at least one longshot pick (under 60% confidence) where the odds payout is significantly higher.
4. NO two parlays should share the same legs. Each parlay must be a DISTINCT combination.
5. Each parlay should have 3 legs.`;
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

async function analyzeGames(games, sportTitle) {
    if (games.length === 0) return { picks: [], recommended_parlays: [] };

    const prompt = buildAnalysisPrompt(games, sportTitle);

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

        const { error } = await supabase
            .from('daily_picks')
            .upsert({
                game_id: game.game_id,
                pick_date: new Date().toISOString().split('T')[0],
                tier: pick.tier,
                pick_type: pick.pick_type,
                picked_team: pick.picked_team,
                picked_odds: pick.picked_odds,
                picked_line: pick.picked_line || null,
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
    let totalParlays = 0;
    const allAnalysis = {};

    for (const [sportTitle, games] of Object.entries(sportGroups)) {
        console.log(`\n🏟️ Analyzing ${sportTitle} (${games.length} games)...`);

        try {
            // If there are too many games, batch them (Gemini handles ~50 games well)
            const batchSize = 25;
            let sportPicks = 0;
            let sportParlays = 0;

            for (let i = 0; i < games.length; i += batchSize) {
                const batch = games.slice(i, i + batchSize);
                const batchLabel = games.length > batchSize
                    ? ` [batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(games.length / batchSize)}]`
                    : '';

                process.stdout.write(`   🤖 Sending to Gemini${batchLabel}...`);
                const analysis = await analyzeGames(batch, sportTitle);

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

                const { storedPicks, storedParlays } = await storePicks(analysis, batch, sportTitle);
                sportPicks += storedPicks;
                sportParlays += storedParlays;
            }

            totalPicks += sportPicks;
            totalParlays += sportParlays;
            console.log(`   💾 Stored ${sportPicks} picks, ${sportParlays} parlays`);

        } catch (error) {
            console.error(`   ❌ Error analyzing ${sportTitle}:`, error.message);
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎯 Analysis complete!`);
    console.log(`   📊 ${totalPicks} picks stored across all sports`);
    console.log(`   🎲 ${totalParlays} recommended parlays created`);
    console.log(`   💾 All data saved to Supabase`);
}

runFullAnalysis();
