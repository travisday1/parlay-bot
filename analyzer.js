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
const { modelAllGames, calculateEV, impliedProbFromOdds, SPORT_CONFIG } = require('./model');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Group games by sport for batched analysis
const ALL_SPORT_KEYS = [
    'basketball_nba',
    'basketball_ncaab',
    'icehockey_nhl',
    'americanfootball_nfl',
    'baseball_mlb',
    // Soccer
    'soccer_usa_mls',
    'soccer_epl',
    'soccer_spain_la_liga',
    'soccer_germany_bundesliga',
    'soccer_france_ligue_one',
    'soccer_italy_serie_a',
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
        .in('sport_key', ALL_SPORT_KEYS)
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

        // Append model output if available
        if (g.modelResult) {
            const m = g.modelResult;
            block += `\n  📐 MATHEMATICAL MODEL OUTPUT:`;
            block += `\n    Home win probability: ${(m.model.homeWinProb * 100).toFixed(1)}%`;
            block += `\n    Away win probability: ${(m.model.awayWinProb * 100).toFixed(1)}%`;
            block += `\n    Power rating differential: ${m.model.powerDiff.toFixed(1)} (positive = home advantage)`;
            if (m.totalProjection) {
                block += `\n    Projected total: ${m.totalProjection.projectedTotal} (Home ${m.totalProjection.homeProjected} + Away ${m.totalProjection.awayProjected})`;
            }
            if (m.bestBet) {
                block += `\n    Best +EV bet: ${m.bestBet.team} ${m.bestBet.type} (edge: ${(m.bestBet.ev.edge * 100).toFixed(1)}%, EV: ${(m.bestBet.ev.ev * 100).toFixed(1)}%)`;
            } else {
                block += `\n    No +EV bet identified by the model`;
            }
            if (m.homeStats) {
                block += `\n    Home stats: NRtg ${m.homeStats.netRating || 'N/A'}, eFG% ${m.homeStats.eFGPct || 'N/A'}, Pace ${m.homeStats.pace || 'N/A'}`;
            }
            if (m.awayStats) {
                block += `\n    Away stats: NRtg ${m.awayStats.netRating || 'N/A'}, eFG% ${m.awayStats.eFGPct || 'N/A'}, Pace ${m.awayStats.pace || 'N/A'}`;
            }
        }

        return block;
    }).filter(Boolean).join('\n');

    return `You are a sports betting VALIDATOR called "Parlay Bot". Your job is to CONFIRM or REJECT the mathematical model's picks — NOT to generate your own.
Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

For each game below, you will see:
1. The raw odds from DraftKings
2. Enrichment data (fatigue, injuries, O/U trends, line movement)
3. The MATHEMATICAL MODEL'S OUTPUT — including independent win probabilities, power ratings, and +EV analysis

YOUR ROLE: You are a FILTER, not a generator. Your job is to:
1. CONFIRM model picks that align with the enrichment context (injuries support the edge, fatigue favors the pick, etc.)
2. REJECT model picks where contextual data contradicts the edge (star player just ruled out, line has already moved past the value, etc.)
3. You may adjust the model's probability by a MAXIMUM of ±3 percentage points (NOT ±5) — only for concrete, verifiable reasons like a confirmed injury.

CRITICAL RULES:
- If the model says "No +EV bet found" → you MUST output tier: "skip". Do NOT invent picks.
- You may NOT upgrade a "longshot" to a "lock". You may only DOWNGRADE tiers or leave them.
- You may NOT adjust probabilities based on narratives ("revenge game", "team is hot", "rivalry"). Only adjust for: confirmed injuries, confirmed rest advantages, extreme weather, or line movement signals.
- VOLUME CONTROL: Out of all games presented, you should skip at LEAST 40% of them. If the model found +EV on a game but the edge is small (under 5%), default to skip unless enrichment data strongly confirms the edge.

Tier classification (set by the model, you can only downgrade):
- "lock" = 8%+ edge (strong +EV, confirmed by context)
- "value" = 5-8% edge (moderate +EV)  
- "longshot" = 3-5% edge (marginal +EV, only take with strong contextual support)
- "skip" = No +EV or context contradicts the edge

For each game, produce:
- Whether you CONFIRM or REJECT the model's recommendation
- Your adjusted probability (if different from model, max ±3%)
- A 1-2 sentence rationale referencing SPECIFIC data points (not narratives)
- An O/U assessment ONLY if the model projects a total 3+ points different from the posted line

${calibrationText || ''}

Here are today's ${sportTitle} games with model output and enrichment data:
${gameLines}

Respond in VALID JSON format only. No markdown, no explanation outside the JSON.
{
  "picks": [
    {
      "game_index": 1,
      "away_team": "Team A",
      "home_team": "Team B",
      "model_home_prob": 0.62,
      "adjusted_home_prob": 0.60,
      "adjustment_reason": "No adjustment — model aligns with context",
      "agree_with_model_ev": true,
      "tier": "lock|value|longshot|skip",
      "pick_type": "moneyline|spread|over|under",
      "picked_team": "Team B",
      "picked_odds": -182,
      "picked_line": null,
      "confidence": 57,
      "rationale": "1-2 sentence analysis referencing SPECIFIC model data AND contextual factors",
      "ou_pick": "over|under|skip",
      "ou_rationale": "O/U reasoning using projected total vs posted line"
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
        model: 'gemini-3.1-pro-preview',
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

        // REVISED: Confidence should reflect our certainty in the EDGE, not the raw win prob.
        // A 55% win probability bet might have a strong edge vs the line, or no edge at all.
        // Use the model's edge (model prob - implied prob) scaled to a confidence score.
        // Edge of 3% → ~55 confidence, 5% → ~65, 8% → ~75, 12%+ → ~85+
        let finalConfidence = pick.confidence; // AI's confidence as fallback

        const modelResult = game.modelResult;
        if (modelResult?.bestBet?.ev?.edge) {
            const edgePct = modelResult.bestBet.ev.edge * 100; // e.g. 0.08 → 8
            // Scale edge to confidence: base 50 + edge * 4, capped at 90
            finalConfidence = Math.min(90, Math.max(50, Math.round(50 + edgePct * 4)));
        } else if (pick.adjusted_home_prob) {
            // If no model result but AI adjusted, use the AI's number (capped)
            const rawProb = pick.picked_team === game.home_team ? pick.adjusted_home_prob : (1 - pick.adjusted_home_prob);
            finalConfidence = Math.min(85, Math.round(rawProb * 100));
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
                confidence: finalConfidence,
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
    const rawGames = await fetchTodaysGames();
    console.log(`\n📦 Found ${rawGames.length} games in the database for today.`);

    // Filter out games with invalid/incomplete market data
    const allGames = rawGames.filter(g => {
        const odds = g.odds?.[0];
        if (!odds) return false;
        const validML = odds.home_odds && odds.away_odds
            && Math.abs(odds.home_odds) <= 10000
            && Math.abs(odds.away_odds) <= 10000;
        const validSpread = odds.home_point !== null && odds.home_point !== undefined;
        const validTotal = odds.over_point !== null && odds.over_point !== undefined && odds.over_point !== 0;
        if (!validML || !validSpread || !validTotal) {
            console.log(`   🚫 Filtered ${g.away_team} @ ${g.home_team} from analysis — invalid market data (spread: ${odds.home_point}, total: ${odds.over_point}, ML: ${odds.home_odds}/${odds.away_odds})`);
            return false;
        }
        return true;
    });
    if (allGames.length < rawGames.length) {
        console.log(`   📊 ${rawGames.length - allGames.length} games filtered out, ${allGames.length} valid games remaining\n`);
    } else {
        console.log('');
    }

    // Load calibration data from recent settled results
    const calibration = await generateCalibrationContext(14);
    if (calibration.hasData) {
        console.log(`📊 Calibration loaded — feeding accuracy data into AI prompt`);
    } else {
        console.log(`📊 No calibration data yet — run settler.js after games complete to build feedback loop`);
    }

    if (allGames.length === 0) {
        console.log('⚠️ No valid games found. Run updater.js first to fetch odds.');
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

                // Run the mathematical probability model
                const modelResults = await modelAllGames(enrichedBatch);

                // Attach model results to each game for the AI prompt
                for (const game of enrichedBatch) {
                    game.modelResult = modelResults.find(m => m.game_id === game.game_id) || null;
                }

                // Store model predictions for historical analysis
                for (const result of modelResults) {
                    const { error: mpErr } = await supabase.from('model_predictions').upsert({
                        game_id: result.game_id,
                        prediction_date: new Date().toISOString().split('T')[0],
                        sport_key: result.sportKey,
                        home_win_prob: result.model.homeWinProb,
                        away_win_prob: result.model.awayWinProb,
                        power_diff: result.model.powerDiff,
                        rest_adjustment: result.model.restAdjustment,
                        projected_total: result.totalProjection?.projectedTotal || null,
                        home_ml_ev: result.ev.homeML?.ev || null,
                        away_ml_ev: result.ev.awayML?.ev || null,
                        over_ev: result.ev.over?.ev || null,
                        under_ev: result.ev.under?.ev || null,
                        best_bet_type: result.bestBet?.type || null,
                        best_bet_team: result.bestBet?.team || null,
                        best_bet_edge: result.bestBet?.ev?.edge || null,
                        tier: result.tier,
                        home_net_rating: result.homeStats?.netRating || null,
                        away_net_rating: result.awayStats?.netRating || null,
                        home_efg_pct: result.homeStats?.eFGPct || null,
                        away_efg_pct: result.awayStats?.eFGPct || null,
                    }, { onConflict: 'game_id,prediction_date' });
                    if (mpErr) console.log(`   ⚠️ Error storing model prediction: ${mpErr.message}`);
                }

                process.stdout.write(`   🤖 Sending to Gemini${batchLabel}...`);
                const analysis = await analyzeGames(enrichedBatch, sportTitle, calibration.text);

                // === EDGE FLOOR FILTER ===
                // Reject picks where the mathematical model's edge is below 3%
                for (const pick of (analysis.picks || [])) {
                    if (pick.tier === 'skip') continue;
                    const gameIdx = pick.game_index - 1;
                    const game = enrichedBatch[gameIdx];
                    const modelEdge = game?.modelResult?.bestBet?.ev?.edge;
                    if (modelEdge != null && modelEdge < 0.03) {
                        console.log(`   ⚠️ Edge floor: rejected ${pick.picked_team} ${pick.pick_type} — model edge only ${(modelEdge * 100).toFixed(1)}%`);
                        pick.tier = 'skip';
                    }
                }

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
                        const modelEdge = game?.modelResult?.bestBet?.ev?.edge || 0;
                        allPicksForParlays.push({
                            sport: sportTitle,
                            team: pick.picked_team,
                            type: pick.pick_type,
                            picked_line: pick.picked_line || 0,
                            odds: pick.picked_odds,
                            confidence: pick.confidence,
                            tier: pick.tier,
                            edge: modelEdge,
                            game_id: game?.game_id || null,
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

    // === HARD PICK COUNT CAP ===
    // Keep only the top 12 picks by model edge across all sports
    const PICK_CAP = 12;
    if (allPicksForParlays.length > PICK_CAP) {
        // Sort by edge descending — highest edge first
        allPicksForParlays.sort((a, b) => b.edge - a.edge);
        const culled = allPicksForParlays.splice(PICK_CAP);
        console.log(`\n⚠️ Volume cap: kept top ${PICK_CAP} picks, culled ${culled.length} lower-edge picks`);

        // Delete culled picks from Supabase
        const today = new Date().toISOString().split('T')[0];
        for (const drop of culled) {
            if (!drop.game_id) continue;
            const { error } = await supabase
                .from('daily_picks')
                .delete()
                .eq('game_id', drop.game_id)
                .eq('pick_date', today)
                .eq('pick_type', drop.type);
            if (error) {
                console.log(`   ⚠️ Could not delete culled pick ${drop.team}: ${error.message}`);
            }
        }
        console.log(`   🗑️ Deleted ${culled.length} culled picks from daily_picks`);
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
        `${i + 1}. [${p.sport}] ${p.team} ${p.type}${p.picked_line ? ` (line: ${p.picked_line})` : ''} @ ${p.odds > 0 ? '+' : ''}${p.odds} — ${p.confidence}% (${p.tier}) — game_id: ${p.game_id} — ${p.game}`
    ).join('\n');

    const prompt = `You are the Parlay Bot. You have analyzed today's games across multiple sports and identified these picks:

${pickSummary}

Now build 3 recommended parlays. Follow these rules EXACTLY:

1. "The Safe Bag" (tier: "safe") — HIGHEST CONFIDENCE / FAVORITES ONLY:
   - MUST use exactly 3 legs
   - Every leg MUST be from a pick where the team is the MONEYLINE FAVORITE (negative American odds) OR where the spread favors them
   - Prefer legs where the moneyline odds are between -110 and -400 (strong but not extreme favorites)
   - Do NOT include any underdog moneyline picks (positive American odds like +100, +150, +235) in The Safe Bag
   - Sort candidate legs by implied probability from the actual odds (NOT AI confidence alone), and pick the 3 with the highest implied win probability
   - If fewer than 3 qualifying favorite picks exist, use spread picks on favorites instead
   - NEVER include a leg with American odds of +100 or higher in The Safe Bag

2. "The Value Play" (tier: "value") — BEST VALUE / EDGE PICKS:
   - MUST use exactly 3 legs
   - Should include picks where the AI confidence is notably higher than the implied probability from the odds — this is where the model sees edge the market doesn't
   - Can include moderate favorites (-110 to -200) and slight underdogs (+100 to +180) where the AI sees value
   - At least 1 leg should come from a different sport than the other 2 (when multiple sports are available)
   - No legs shared with The Safe Bag

3. "The Big Swing" (tier: "longshot") — HIGH RISK / HIGH REWARD:
   - MUST use exactly 3 legs
   - MUST include at least 1 underdog moneyline pick (+150 or higher)
   - Should include at least 1 longshot-tier pick (AI confidence below 60%)
   - Target combined decimal odds of 10x+ (big payout potential)
   - Can use totals (over/under) picks as legs
   - No legs shared with The Safe Bag or The Value Play

GLOBAL RULES:
- Each parlay MUST have exactly 3 legs
- NO two parlays may share the same leg
- When multiple sports are available, mix sports across parlays when possible
- Use the EXACT team names and odds from the pick list above
- Every leg must include: game_id, team (picked team name), pick_type (one of: moneyline, spread, over, under), picked_line (numeric or null for moneyline), odds (American odds integer), confidence (0-100)

Respond in VALID JSON only:
{
  "recommended_parlays": [
    {
      "tier": "safe",
      "name": "The Safe Bag",
      "legs": [
        {"game_id": "abc123", "team": "Team Name", "pick_type": "moneyline", "picked_line": null, "odds": -200, "confidence": 72, "game": "Away @ Home"}
      ],
      "rationale": "Why this combination works"
    }
  ]
}`;

    const model = genAI.getGenerativeModel({
        model: 'gemini-3.1-pro-preview',
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
        // Normalize leg fields — Gemini may use 'team' or 'picked_team'
        const normalizedLegs = parlay.legs.map(leg => {
            const teamName = (leg.team || leg.picked_team || '').replace(/ ml$/i, '');
            const match = allPicks.find(p =>
                p.team && p.team.toLowerCase() === teamName.toLowerCase()
            );
            return {
                game_id: leg.game_id || match?.game_id || null,
                team: teamName,
                picked_team: teamName,
                pick_type: leg.pick_type || match?.type || 'moneyline',
                picked_line: leg.picked_line != null ? leg.picked_line : (match?.picked_line || null),
                odds: leg.odds || match?.odds || 0,
                confidence: leg.confidence || match?.confidence || 50,
                game: leg.game || match?.game || ''
            };
        });

        let finalLegs = normalizedLegs;

        // Programmatic override for Safe Bag hallucinations
        if (parlay.tier === 'safe') {
            const hasUnderdog = finalLegs.some(l => l.odds > -100);
            if (hasUnderdog) {
                console.log(`   ⚠️ WARNING: Gemini hallucinated an underdog in The Safe Bag. Overriding programmatically...`);
                const safeFavorites = allPicks
                    .filter(p => p.odds < 0)
                    .sort((a, b) => a.odds - b.odds); // most negative first

                if (safeFavorites.length > 0) {
                    const legsCount = Math.min(3, safeFavorites.length);
                    finalLegs = safeFavorites.slice(0, legsCount).map(match => ({
                        game_id: match.game_id,
                        team: match.team,
                        picked_team: match.team,
                        pick_type: match.type,
                        picked_line: match.picked_line || null,
                        odds: match.odds,
                        confidence: match.confidence,
                        game: match.game
                    }));
                } else {
                    console.log(`   ⚠️ Could not override Safe Bag: no negative odds favorites available.`);
                }
            }
        }

        const combinedOdds = calculateParlayOdds(finalLegs);
        const payoutOn100 = Math.round(combinedOdds * 100 * 100) / 100;
        const avgConfidence = Math.round(finalLegs.reduce((s, l) => s + l.confidence, 0) / finalLegs.length);

        const { error } = await supabase
            .from('recommended_parlays')
            .upsert({
                parlay_date: new Date().toISOString().split('T')[0],
                tier: parlay.tier,
                name: parlay.name,
                legs: finalLegs,
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