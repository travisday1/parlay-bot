// ============================================================
// PARLAY BOT — Pick Settler
// Fetches completed game scores from The-Odds-API, compares
// against daily_picks, and populates pick_results with
// win/loss/push outcomes for the Performance Tracker.
// ============================================================
require('dotenv').config();
const { query, queryOne, execute, closePool } = require('./db');

const ODDS_API_KEY = process.env.ODDS_API_KEY;

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
    const picks = await query(
        `SELECT dp.id, dp.game_id, dp.tier, dp.pick_type, dp.picked_team,
                dp.picked_odds, dp.picked_line, dp.pick_date, dp.confidence
         FROM daily_picks dp
         LEFT JOIN pick_results pr ON pr.pick_id = dp.id
         WHERE pr.id IS NULL
         ORDER BY dp.pick_date DESC`
    );

    return picks || [];
}

// ===== SETTLE A SINGLE PICK =====
function settlePickResult(pick, homeTeam, awayTeam, homeScore, awayScore) {
    const pickType = pick.pick_type?.toLowerCase();
    const pickedTeam = pick.picked_team;
    const pickedLine = parseFloat(pick.picked_line) || 0;
    const pickedOdds = parseFloat(pick.picked_odds) || -110;

    let result = null;

    if (pickType === 'moneyline') {
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
            payoutOn100 = 100 + pickedOdds;
        } else {
            payoutOn100 = 100 + (100 / Math.abs(pickedOdds)) * 100;
        }
    } else if (result === 'push') {
        payoutOn100 = 100;
    }

    return { result, payoutOn100: Math.round(payoutOn100 * 100) / 100 };
}

function isTeamMatch(pickedTeam, fullTeamName) {
    if (!pickedTeam || !fullTeamName) return false;
    const picked = pickedTeam.toLowerCase().trim();
    const full = fullTeamName.toLowerCase().trim();
    return full.includes(picked) || picked.includes(full) ||
        full.split(' ').pop() === picked.split(' ').pop();
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
        await closePool();
        return;
    }

    // Step 2: Get the game_ids we need scores for
    const gameIds = [...new Set(unsettledPicks.map(p => p.game_id))];
    console.log(`🎮 Need scores for ${gameIds.length} unique games`);

    // Step 3: Look up the games to get sport_key and team names
    const games = await query(
        `SELECT game_id, sport_key, home_team, away_team, commence_time
         FROM games WHERE game_id = ANY($1)`,
        [gameIds]
    );

    if (!games || games.length === 0) {
        console.log('⚠️ No games found in database for unsettled picks.');
        await closePool();
        return;
    }

    const gameMap = {};
    games.forEach(g => { gameMap[g.game_id] = g; });

    // Step 4: Fetch scores from The-Odds-API for each sport
    const sportKeys = [...new Set(games.map(g => g.sport_key).filter(k => ALL_SPORT_KEYS.includes(k)))];
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
            skipped++;
            continue;
        }

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
        try {
            await query(
                `INSERT INTO pick_results (pick_id, game_id, result, home_final_score, away_final_score, payout_on_100)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (pick_id) DO UPDATE SET
                   result = EXCLUDED.result,
                   home_final_score = EXCLUDED.home_final_score,
                   away_final_score = EXCLUDED.away_final_score,
                   payout_on_100 = EXCLUDED.payout_on_100,
                   settled_at = NOW()`,
                [pick.id, pick.game_id, result, homeScore, awayScore, payoutOn100]
            );

            settled++;
            if (result === 'win') wins++;
            else if (result === 'loss') losses++;
            else pushes++;

            const emoji = result === 'win' ? '✅' : result === 'loss' ? '❌' : '➖';
            console.log(`   ${emoji} ${pick.picked_team} (${pick.pick_type}) → ${result.toUpperCase()} | ${game.away_team} ${awayScore} - ${game.home_team} ${homeScore}${payoutOn100 > 0 ? ` | $${payoutOn100}` : ''}`);
        } catch (err) {
            console.error(`   ⚠️ Error storing result for ${pick.picked_team}:`, err.message);
        }
    }

    // Step 6: Settle recommended parlays
    console.log('\n🎲 Settling recommended parlays...');
    await settleParlays(allScores, gameMap);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`⚖️  Settlement complete!`);
    console.log(`   ✅ ${wins} wins | ❌ ${losses} losses | ➖ ${pushes} pushes`);
    console.log(`   📊 ${settled} picks settled, ${skipped} skipped (games not completed)`);
    await closePool();
}

// ===== SETTLE RECOMMENDED PARLAYS =====
async function settleParlays(allScores, gameMap) {
    const parlays = await query(
        `SELECT * FROM recommended_parlays WHERE result = 'pending'`
    );

    if (!parlays || parlays.length === 0) {
        console.log('   No pending parlays to settle.');
        return;
    }

    for (const parlay of parlays) {
        const legs = parlay.legs || [];
        let allLegsDetermined = true;
        let parlayWin = true;

        for (const leg of legs) {
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
                if (adjustedScore === opponentScore) continue; // Push
                legWon = adjustedScore > opponentScore;

            } else if (legPickType === 'over') {
                const line = parseFloat(leg.picked_line) || 0;
                const total = homeScore + awayScore;
                if (total === line) continue;
                legWon = total > line;

            } else if (legPickType === 'under') {
                const line = parseFloat(leg.picked_line) || 0;
                const total = homeScore + awayScore;
                if (total === line) continue;
                legWon = total < line;
            }

            if (!legWon) {
                parlayWin = false;
            }
        }

        if (!allLegsDetermined) continue;

        const result = parlayWin ? 'win' : 'loss';
        const actualPayout = parlayWin ? parlay.payout_on_100 : 0;

        try {
            await execute(
                `UPDATE recommended_parlays SET result = $1, actual_payout = $2 WHERE id = $3`,
                [result, actualPayout, parlay.id]
            );

            const emoji = parlayWin ? '🎉' : '❌';
            console.log(`   ${emoji} ${parlay.name} → ${result.toUpperCase()}${parlayWin ? ` ($${actualPayout})` : ''}`);
        } catch (err) {
            console.error(`   ⚠️ Error settling parlay ${parlay.name}:`, err.message);
        }
    }
}

runSettler();
