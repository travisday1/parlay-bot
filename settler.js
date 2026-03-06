// ============================================================
// PARLAY BOT — Settlement Engine
// Fetches final scores from The-Odds-API, grades picks as
// win/loss/push, calculates $100 payouts, and settles parlays.
// ============================================================
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ODDS_API_KEY = process.env.ODDS_API_KEY;

// Sports to check scores for
const SCORE_SPORTS = [
    'basketball_nba', 'basketball_ncaab', 'basketball_wncaab',
    'americanfootball_nfl', 'americanfootball_ncaaf',
    'icehockey_nhl', 'baseball_mlb',
    'soccer_usa_mls', 'soccer_epl', 'soccer_spain_la_liga',
    'soccer_italy_serie_a', 'soccer_germany_bundesliga',
    'soccer_uefa_champs_league'
];

// ===== FETCH SCORES FROM API =====
async function fetchScores(sportKey, daysFrom = 3) {
    const url = new URL(`https://api.the-odds-api.com/v4/sports/${sportKey}/scores`);
    url.searchParams.append('apiKey', ODDS_API_KEY);
    url.searchParams.append('daysFrom', daysFrom.toString());
    url.searchParams.append('dateFormat', 'iso');

    const response = await fetch(url.toString());

    if (!response.ok) {
        if (response.status === 422 || response.status === 404) return [];
        if (response.status === 429) {
            console.log(`   ⏳ Rate limited, waiting 2s...`);
            await new Promise(r => setTimeout(r, 2000));
            return fetchScores(sportKey, daysFrom);
        }
        const errText = await response.text();
        throw new Error(`Scores API error for ${sportKey}: ${response.status} - ${errText}`);
    }

    const remaining = response.headers.get('x-requests-remaining');
    console.log(`   📊 API quota remaining: ${remaining}`);

    return await response.json();
}

// ===== PAYOUT CALCULATION =====
function calculatePayout(americanOdds, betAmount = 100) {
    if (americanOdds > 0) {
        // Underdog: +150 means $100 bet wins $150 profit
        return betAmount + (betAmount * americanOdds / 100);
    } else {
        // Favorite: -150 means $150 bet wins $100 profit
        return betAmount + (betAmount * 100 / Math.abs(americanOdds));
    }
}

// ===== GRADE A SINGLE PICK =====
function gradePick(pick, homeScore, awayScore, homeTeam, awayTeam) {
    const pickType = pick.pick_type;
    const pickedTeam = pick.picked_team;
    const pickedLine = pick.picked_line;
    const totalScore = homeScore + awayScore;

    if (pickType === 'moneyline') {
        // Who won the game?
        const winner = homeScore > awayScore ? homeTeam : awayTeam;
        if (homeScore === awayScore) return 'push'; // rare tie
        return pickedTeam === winner ? 'win' : 'loss';
    }

    if (pickType === 'spread') {
        // Apply spread to the picked team's score
        const isHome = pickedTeam === homeTeam;
        const teamScore = isHome ? homeScore : awayScore;
        const oppScore = isHome ? awayScore : homeScore;
        const adjustedScore = teamScore + (pickedLine || 0);

        if (adjustedScore > oppScore) return 'win';
        if (adjustedScore === oppScore) return 'push';
        return 'loss';
    }

    if (pickType === 'over') {
        if (totalScore > pickedLine) return 'win';
        if (totalScore === pickedLine) return 'push';
        return 'loss';
    }

    if (pickType === 'under') {
        if (totalScore < pickedLine) return 'win';
        if (totalScore === pickedLine) return 'push';
        return 'loss';
    }

    return 'loss'; // fallback
}

// ===== SETTLE PARLAYS =====
async function settleParlays() {
    console.log('\n🎲 Settling recommended parlays...');

    // Get pending parlays
    const { data: parlays, error } = await supabase
        .from('recommended_parlays')
        .select('*')
        .eq('result', 'pending');

    if (error) {
        console.error('   ❌ Error fetching parlays:', error.message);
        return;
    }

    if (!parlays || parlays.length === 0) {
        console.log('   ℹ️  No pending parlays to settle');
        return;
    }

    let settled = 0;

    for (const parlay of parlays) {
        const legs = parlay.legs || [];
        if (legs.length === 0) continue;

        // Check if ALL games in this parlay have been completed
        // We need to find the matching picks/results for each leg
        let allSettled = true;
        let allWins = true;
        let anyLoss = false;

        for (const leg of legs) {
            // Try to find the matching pick result
            const teamName = leg.picked_team || leg.team;
            const game = leg.game || '';

            // Search for this pick in pick_results via daily_picks
            const { data: matchingPicks } = await supabase
                .from('daily_picks')
                .select('id, game_id')
                .eq('pick_date', parlay.parlay_date)
                .ilike('picked_team', `%${teamName.replace(/ ML$| ATS$| Spread$/i, '')}%`)
                .limit(1);

            if (!matchingPicks || matchingPicks.length === 0) {
                allSettled = false;
                break;
            }

            const { data: result } = await supabase
                .from('pick_results')
                .select('result')
                .eq('pick_id', matchingPicks[0].id)
                .limit(1);

            if (!result || result.length === 0) {
                allSettled = false;
                break;
            }

            if (result[0].result === 'loss') {
                anyLoss = true;
            }
            if (result[0].result !== 'win') {
                allWins = false;
            }
        }

        if (!allSettled) continue;

        // Determine parlay result
        let parlayResult = 'loss';
        let actualPayout = 0;

        if (allWins) {
            parlayResult = 'win';
            actualPayout = parlay.payout_on_100 || 0;
        } else if (anyLoss) {
            parlayResult = 'loss';
            actualPayout = 0;
        } else {
            // Mix of wins and pushes — reduce payout
            parlayResult = 'push';
            actualPayout = 100;
        }

        const { error: updateError } = await supabase
            .from('recommended_parlays')
            .update({
                result: parlayResult,
                actual_payout: actualPayout
            })
            .eq('id', parlay.id);

        if (!updateError) {
            const emoji = parlayResult === 'win' ? '✅' : parlayResult === 'push' ? '🟡' : '❌';
            console.log(`   ${emoji} ${parlay.name}: ${parlayResult.toUpperCase()} — $${actualPayout.toFixed(2)} payout`);
            settled++;
        }
    }

    console.log(`   💾 Settled ${settled} parlays`);
}

// ===== MAIN SETTLEMENT FLOW =====
async function runSettlement() {
    console.log('⚖️  PARLAY BOT — Settlement Engine');
    console.log(`📅 ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
    console.log('='.repeat(60));

    // Step 1: Get all unsettled picks (picks without a matching pick_result)
    console.log('\n📋 Finding unsettled picks...');

    const { data: allPicks, error: picksError } = await supabase
        .from('daily_picks')
        .select('*, pick_results(id)')
        .is('pick_results', null);

    if (picksError) {
        // Fallback — get all picks and filter client-side
        console.log('   Using fallback query...');
        const { data: picks2 } = await supabase
            .from('daily_picks')
            .select('*')
            .order('pick_date', { ascending: false })
            .limit(200);

        const { data: existingResults } = await supabase
            .from('pick_results')
            .select('pick_id');

        const settledIds = new Set((existingResults || []).map(r => r.pick_id));
        var unsettledPicks = (picks2 || []).filter(p => !settledIds.has(p.id));
    } else {
        var unsettledPicks = allPicks || [];
    }

    if (unsettledPicks.length === 0) {
        console.log('   ✅ All picks are already settled!');
        await settleParlays();
        return;
    }

    console.log(`   📦 Found ${unsettledPicks.length} unsettled picks`);

    // Step 2: Get unique game IDs and their sport keys
    const gameIds = [...new Set(unsettledPicks.map(p => p.game_id))];
    const { data: games } = await supabase
        .from('games')
        .select('*')
        .in('game_id', gameIds);

    const gameMap = {};
    for (const g of (games || [])) {
        gameMap[g.game_id] = g;
    }

    // Step 3: Fetch scores for each sport
    const sportKeys = [...new Set((games || []).map(g => g.sport_key))];
    console.log(`\n🏟️  Fetching scores for ${sportKeys.length} sports...`);

    const scoreMap = {}; // game_id -> { home_score, away_score, completed }

    for (const sportKey of sportKeys) {
        try {
            process.stdout.write(`   ⚡ ${sportKey}...`);
            const scores = await fetchScores(sportKey);

            let completed = 0;
            for (const game of scores) {
                if (game.completed) {
                    const homeScore = game.scores?.find(s => s.name === game.home_team);
                    const awayScore = game.scores?.find(s => s.name === game.away_team);

                    if (homeScore && awayScore) {
                        scoreMap[game.id] = {
                            home_team: game.home_team,
                            away_team: game.away_team,
                            home_score: parseInt(homeScore.score),
                            away_score: parseInt(awayScore.score),
                            completed: true
                        };
                        completed++;
                    }
                }
            }
            console.log(` ✅ ${completed} completed games found`);

            // Small delay between API calls to avoid rate limiting
            await new Promise(r => setTimeout(r, 500));
        } catch (error) {
            console.log(` ❌ ${error.message}`);
        }
    }

    console.log(`\n📦 Scores found for ${Object.keys(scoreMap).length} completed games`);

    // Step 4: Grade each pick
    console.log('\n⚖️  Grading picks...');
    let wins = 0, losses = 0, pushes = 0, skipped = 0;

    for (const pick of unsettledPicks) {
        const score = scoreMap[pick.game_id];
        if (!score) {
            skipped++;
            continue; // Game not completed yet
        }

        const game = gameMap[pick.game_id];
        if (!game) {
            skipped++;
            continue;
        }

        const result = gradePick(pick, score.home_score, score.away_score, score.home_team, score.away_team);

        let payoutOn100 = 0;
        if (result === 'win') {
            payoutOn100 = calculatePayout(pick.picked_odds);
            wins++;
        } else if (result === 'push') {
            payoutOn100 = 100; // stake returned
            pushes++;
        } else {
            payoutOn100 = 0;
            losses++;
        }

        // Store the result
        const { error: resultError } = await supabase
            .from('pick_results')
            .upsert({
                pick_id: pick.id,
                game_id: pick.game_id,
                result: result,
                home_final_score: score.home_score,
                away_final_score: score.away_score,
                payout_on_100: Math.round(payoutOn100 * 100) / 100
            }, { onConflict: 'pick_id' });

        if (resultError) {
            console.error(`   ⚠️ Error storing result for pick ${pick.id}:`, resultError.message);
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 Settlement Summary:');
    console.log(`   ✅ Wins:    ${wins}`);
    console.log(`   ❌ Losses:  ${losses}`);
    console.log(`   🟡 Pushes:  ${pushes}`);
    console.log(`   ⏭️  Skipped: ${skipped} (games not yet completed)`);

    if (wins + losses > 0) {
        const winRate = ((wins / (wins + losses)) * 100).toFixed(1);
        const totalPayout = wins > 0 ? wins * 100 : 0; // simplified
        console.log(`   📈 Win Rate: ${winRate}%`);
    }

    // Step 6: Settle parlays
    await settleParlays();

    console.log('\n🎯 Settlement complete!');
}

runSettlement();
