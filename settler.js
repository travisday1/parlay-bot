// ============================================================
// PARLAY BOT — Pick Settler
// Fetches completed game scores from The-Odds-API, compares
// against daily_picks, and populates pick_results with
// win/loss/push outcomes for the Performance Tracker.
// ============================================================
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ODDS_API_KEY = process.env.ODDS_API_KEY;

const US_SPORT_KEYS = [
    'basketball_nba',
    'basketball_ncaab',
    'icehockey_nhl',
    'americanfootball_nfl',
    'baseball_mlb',
];

// ===== FETCH COMPLETED SCORES =====
async function fetchScoresForSport(sportKey) {
    const url = new URL(`https://api.the-odds-api.com/v4/sports/${sportKey}/scores`);
    url.searchParams.append('apiKey', ODDS_API_KEY);
    url.searchParams.append('daysFrom', '3'); // look back 3 days for completed games
    url.searchParams.append('dateFormat', 'iso');

    const response = await fetch(url.toString());

    if (!response.ok) {
        if (response.status === 422 || response.status === 404) return [];
        throw new Error(`Scores API error for ${sportKey}: ${response.status}`);
    }

    const remaining = response.headers.get('x-requests-remaining');
    const used = response.headers.get('x-requests-used');
    console.log(`   📊 API quota: ${used} used / ${remaining} remaining`);

    return await response.json();
}

// ===== GET UNSETTLED PICKS =====
async function getUnsettledPicks() {
    // Find all daily_picks that don't have a corresponding pick_result yet
    const { data: picks, error } = await supabase
        .from('daily_picks')
        .select('id, game_id, tier, pick_type, picked_team, picked_odds, picked_line, pick_date, confidence')
        .order('pick_date', { ascending: false });

    if (error) {
        console.error('Error fetching picks:', error.message);
        return [];
    }

    if (!picks || picks.length === 0) return [];

    // Check which picks already have results
    const pickIds = picks.map(p => p.id);
    // Query in batches of 100 to avoid URL length limits
    const settledIds = new Set();
    for (let i = 0; i < pickIds.length; i += 100) {
        const batch = pickIds.slice(i, i + 100);
        const { data: existingResults } = await supabase
            .from('pick_results')
            .select('pick_id')
            .in('pick_id', batch);
        (existingResults || []).forEach(r => settledIds.add(r.pick_id));
    }

    return picks.filter(p => !settledIds.has(p.id));
}

// ===== SETTLE A SINGLE PICK =====
function settlePickResult(pick, homeTeam, awayTeam, homeScore, awayScore) {
    const pickType = pick.pick_type?.toLowerCase();
    const pickedTeam = pick.picked_team;
    const pickedLine = parseFloat(pick.picked_line) || 0;
    const pickedOdds = parseFloat(pick.picked_odds) || -110;

    let result = null;

    if (pickType === 'moneyline') {
        // Moneyline: did the picked team win?
        const pickedIsHome = isTeamMatch(pickedTeam, homeTeam);
        const pickedTeamScore = pickedIsHome ? homeScore : awayScore;
        const opponentScore = pickedIsHome ? awayScore : homeScore;

        if (pickedTeamScore > opponentScore) {
            result = 'win';
        } else if (pickedTeamScore === opponentScore) {
            result = 'push';
        } else {
            result = 'loss';
        }
    } else if (pickType === 'spread') {
        // Spread: picked team score + spread line vs opponent
        const pickedIsHome = isTeamMatch(pickedTeam, homeTeam);
        const pickedTeamScore = pickedIsHome ? homeScore : awayScore;
        const opponentScore = pickedIsHome ? awayScore : homeScore;
        const adjustedScore = pickedTeamScore + pickedLine;

        if (adjustedScore > opponentScore) {
            result = 'win';
        } else if (adjustedScore === opponentScore) {
            result = 'push';
        } else {
            result = 'loss';
        }
    } else if (pickType === 'over') {
        const totalScore = homeScore + awayScore;
        if (totalScore > pickedLine) {
            result = 'win';
        } else if (totalScore === pickedLine) {
            result = 'push';
        } else {
            result = 'loss';
        }
    } else if (pickType === 'under') {
        const totalScore = homeScore + awayScore;
        if (totalScore < pickedLine) {
            result = 'win';
        } else if (totalScore === pickedLine) {
            result = 'push';
        } else {
            result = 'loss';
        }
    }

    // Calculate payout on $100 bet
    let payoutOn100 = 0;
    if (result === 'win') {
        if (pickedOdds > 0) {
            payoutOn100 = 100 + pickedOdds; // e.g., +150 → $250
        } else {
            payoutOn100 = 100 + (100 / Math.abs(pickedOdds)) * 100; // e.g., -200 → $150
        }
    } else if (result === 'push') {
        payoutOn100 = 100; // stake returned
    }
    // loss = $0

    return { result, payoutOn100: Math.round(payoutOn100 * 100) / 100 };
}

function isTeamMatch(pickedTeam, fullTeamName) {
    if (!pickedTeam || !fullTeamName) return false;
    const picked = pickedTeam.toLowerCase().trim();
    const full = fullTeamName.toLowerCase().trim();
    // Check if one contains the other
    return full.includes(picked) || picked.includes(full) ||
        full.split(' ').pop() === picked.split(' ').pop(); // match last word (team nickname)
}

// ===== MAIN SETTLER =====
async function runSettler() {
    console.log('⚖️  PARLAY BOT — Pick Settler');
    console.log(`📅 ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
    console.log('='.repeat(60));

    // Step 1: Get unsettled picks
    const unsettledPicks = await getUnsettledPicks();
    console.log(`\n📋 Found ${unsettledPicks.length} unsettled picks`);

    if (unsettledPicks.length === 0) {
        console.log('✅ All picks are settled! Nothing to do.');
        return;
    }

    // Step 2: Get the game_ids we need scores for
    const gameIds = [...new Set(unsettledPicks.map(p => p.game_id))];
    console.log(`🎮 Need scores for ${gameIds.length} unique games`);

    // Step 3: Look up the games to get sport_key and team names
    const { data: games } = await supabase
        .from('games')
        .select('game_id, sport_key, home_team, away_team, commence_time')
        .in('game_id', gameIds);

    if (!games || games.length === 0) {
        console.log('⚠️ No games found in database for unsettled picks.');
        return;
    }

    const gameMap = {};
    games.forEach(g => { gameMap[g.game_id] = g; });

    // Step 4: Fetch scores from The-Odds-API for each sport
    const sportKeys = [...new Set(games.map(g => g.sport_key).filter(k => US_SPORT_KEYS.includes(k)))];
    const allScores = {};

    for (const sportKey of sportKeys) {
        console.log(`\n🏟️  Fetching scores for ${sportKey}...`);
        try {
            const scores = await fetchScoresForSport(sportKey);
            const completed = scores.filter(s => s.completed);
            console.log(`   ✅ ${completed.length} completed games out of ${scores.length} total`);

            for (const game of completed) {
                allScores[game.id] = game;
            }
        } catch (error) {
            console.error(`   ❌ Error fetching scores for ${sportKey}:`, error.message);
        }
    }

    console.log(`\n📊 Total completed games with scores: ${Object.keys(allScores).length}`);

    // Step 5: Settle each pick
    let settled = 0, wins = 0, losses = 0, pushes = 0, skipped = 0;

    for (const pick of unsettledPicks) {
        const game = gameMap[pick.game_id];
        if (!game) {
            skipped++;
            continue;
        }

        const scoreData = allScores[pick.game_id];
        if (!scoreData || !scoreData.scores || scoreData.scores.length < 2) {
            skipped++; // Game not completed yet
            continue;
        }

        // Parse scores
        const homeScoreEntry = scoreData.scores.find(s => s.name === game.home_team);
        const awayScoreEntry = scoreData.scores.find(s => s.name === game.away_team);
        const homeScore = parseInt(homeScoreEntry?.score);
        const awayScore = parseInt(awayScoreEntry?.score);

        if (isNaN(homeScore) || isNaN(awayScore)) {
            console.log(`   ⚠️ Could not parse scores for ${game.away_team} @ ${game.home_team}`);
            skipped++;
            continue;
        }

        const { result, payoutOn100 } = settlePickResult(pick, game.home_team, game.away_team, homeScore, awayScore);

        if (!result) {
            skipped++;
            continue;
        }

        // Store the result
        const { error } = await supabase
            .from('pick_results')
            .upsert({
                pick_id: pick.id,
                game_id: pick.game_id,
                result: result,
                home_final_score: homeScore,
                away_final_score: awayScore,
                payout_on_100: payoutOn100,
            }, { onConflict: 'pick_id' });

        if (error) {
            console.error(`   ⚠️ Error storing result for ${pick.picked_team}:`, error.message);
        } else {
            settled++;
            if (result === 'win') wins++;
            else if (result === 'loss') losses++;
            else pushes++;

            const emoji = result === 'win' ? '✅' : result === 'loss' ? '❌' : '➖';
            console.log(`   ${emoji} ${pick.picked_team} (${pick.pick_type}) → ${result.toUpperCase()} | ${game.away_team} ${awayScore} - ${game.home_team} ${homeScore}${payoutOn100 > 0 ? ` | $${payoutOn100}` : ''}`);
        }
    }

    // Step 6: Settle recommended parlays
    console.log('\n🎲 Settling recommended parlays...');
    await settleParlays(allScores, gameMap);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`⚖️  Settlement complete!`);
    console.log(`   ✅ ${wins} wins | ❌ ${losses} losses | ➖ ${pushes} pushes`);
    console.log(`   📊 ${settled} picks settled, ${skipped} skipped (games not completed)`);
}

// ===== SETTLE RECOMMENDED PARLAYS =====
async function settleParlays(allScores, gameMap) {
    const { data: parlays } = await supabase
        .from('recommended_parlays')
        .select('*')
        .eq('result', 'pending');

    if (!parlays || parlays.length === 0) {
        console.log('   No pending parlays to settle.');
        return;
    }

    for (const parlay of parlays) {
        const legs = parlay.legs || [];
        let allLegsDetermined = true;
        let parlayWin = true;

        for (const leg of legs) {
            // Find the game for this leg by team name
            const matchingGame = Object.values(gameMap).find(g =>
                isTeamMatch(leg.picked_team, g.home_team) || isTeamMatch(leg.picked_team, g.away_team)
            );

            if (!matchingGame) {
                allLegsDetermined = false;
                break;
            }

            const scoreData = allScores[matchingGame.game_id];
            if (!scoreData || !scoreData.scores || scoreData.scores.length < 2) {
                allLegsDetermined = false;
                break;
            }

            const homeScore = parseInt(scoreData.scores.find(s => s.name === matchingGame.home_team)?.score);
            const awayScore = parseInt(scoreData.scores.find(s => s.name === matchingGame.away_team)?.score);

            if (isNaN(homeScore) || isNaN(awayScore)) {
                allLegsDetermined = false;
                break;
            }

            // Grade leg based on its actual pick_type
            const legPickType = (leg.pick_type || 'moneyline').toLowerCase();
            let legWon = false;

            if (legPickType === 'moneyline') {
                const isHome = isTeamMatch(leg.picked_team, matchingGame.home_team);
                const pickedScore = isHome ? homeScore : awayScore;
                const opponentScore = isHome ? awayScore : homeScore;
                legWon = pickedScore > opponentScore;

            } else if (legPickType === 'spread') {
                const isHome = isTeamMatch(leg.picked_team, matchingGame.home_team);
                const pickedScore = isHome ? homeScore : awayScore;
                const opponentScore = isHome ? awayScore : homeScore;
                const line = parseFloat(leg.picked_line) || 0;
                const adjustedScore = pickedScore + line;
                if (adjustedScore === opponentScore) {
                    // Push — no action on this leg, skip without busting the parlay
                    continue;
                }
                legWon = adjustedScore > opponentScore;

            } else if (legPickType === 'over') {
                const line = parseFloat(leg.picked_line) || 0;
                const total = homeScore + awayScore;
                if (total === line) continue; // Push
                legWon = total > line;

            } else if (legPickType === 'under') {
                const line = parseFloat(leg.picked_line) || 0;
                const total = homeScore + awayScore;
                if (total === line) continue; // Push
                legWon = total < line;
            }

            if (!legWon) {
                parlayWin = false;
            }
        }

        if (!allLegsDetermined) continue;

        const result = parlayWin ? 'win' : 'loss';
        const actualPayout = parlayWin ? parlay.payout_on_100 : 0;

        const { error } = await supabase
            .from('recommended_parlays')
            .update({ result, actual_payout: actualPayout })
            .eq('id', parlay.id);

        if (!error) {
            const emoji = parlayWin ? '🎉' : '❌';
            console.log(`   ${emoji} ${parlay.name} → ${result.toUpperCase()}${parlayWin ? ` ($${actualPayout})` : ''}`);
        }
    }
}

runSettler();
