// ============================================================
// PARLAY BOT — Full Multi-Sport Odds Updater
// Fetches live odds from The-Odds-API for all major sports
// and stores them in the Cloud SQL database (Firebase).
// ============================================================
require('dotenv').config();
const { query, execute, closePool } = require('./db');

const ODDS_API_KEY = process.env.ODDS_API_KEY;

// All major sports we cover (The-Odds-API sport keys)
// maxGames: cap per-sport
const TARGET_SPORTS = [
    // Basketball
    { key: 'basketball_nba', title: 'NBA' },
    { key: 'basketball_ncaab', title: 'NCAAB', maxGames: 20 },
    // Football (seasonal — will return empty when not in-season)
    { key: 'americanfootball_nfl', title: 'NFL' },
    // Hockey
    { key: 'icehockey_nhl', title: 'NHL' },
    // Baseball (seasonal)
    { key: 'baseball_mlb', title: 'MLB' },
    // Soccer
    { key: 'soccer_usa_mls', title: 'MLS' },
    { key: 'soccer_epl', title: 'English Premier League' },
    { key: 'soccer_spain_la_liga', title: 'La Liga' },
    { key: 'soccer_germany_bundesliga', title: 'Bundesliga' },
    { key: 'soccer_france_ligue_one', title: 'Ligue 1' },
    { key: 'soccer_italy_serie_a', title: 'Serie A' },
];

async function fetchOddsForSport(sport) {
    const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport.key}/odds`);
    url.searchParams.append('apiKey', ODDS_API_KEY);
    url.searchParams.append('regions', 'us');
    url.searchParams.append('markets', 'h2h,spreads,totals');
    url.searchParams.append('oddsFormat', 'american');
    url.searchParams.append('dateFormat', 'iso');

    const response = await fetch(url.toString());

    if (!response.ok) {
        const errText = await response.text();
        // If sport is out of season, the API returns a 422 or similar — skip silently
        if (response.status === 422 || response.status === 404) {
            return [];
        }
        throw new Error(`API error for ${sport.key}: ${response.status} - ${errText}`);
    }

    const remaining = response.headers.get('x-requests-remaining');
    const used = response.headers.get('x-requests-used');
    console.log(`   📊 API quota: ${used} used / ${remaining} remaining`);

    return await response.json();
}

function parseOdds(game, sportTitle) {
    const gameRecord = {
        game_id: game.id,
        sport_key: game.sport_key,
        sport_title: sportTitle,
        home_team: game.home_team,
        away_team: game.away_team,
        commence_time: game.commence_time
    };

    // Parse DraftKings first, fallback to FanDuel, then first available
    const bookmaker = game.bookmakers.find(b => b.key === 'draftkings')
        || game.bookmakers.find(b => b.key === 'fanduel')
        || game.bookmakers[0];

    let oddsRecord = null;

    if (bookmaker) {
        const h2h = bookmaker.markets.find(m => m.key === 'h2h');
        const spreads = bookmaker.markets.find(m => m.key === 'spreads');
        const totals = bookmaker.markets.find(m => m.key === 'totals');

        const h2hHome = h2h?.outcomes.find(o => o.name === game.home_team);
        const h2hAway = h2h?.outcomes.find(o => o.name === game.away_team);
        const spreadHome = spreads?.outcomes.find(o => o.name === game.home_team);
        const spreadAway = spreads?.outcomes.find(o => o.name === game.away_team);
        const totalsOver = totals?.outcomes.find(o => o.name === 'Over');
        const totalsUnder = totals?.outcomes.find(o => o.name === 'Under');

        oddsRecord = {
            game_id: game.id,
            bookmaker: bookmaker.key,
            market: 'combined',
            home_odds: h2hHome?.price || null,
            away_odds: h2hAway?.price || null,
            home_point: spreadHome?.point || null,
            away_point: spreadAway?.point || null,
            over_odds: totalsOver?.price || null,
            over_point: totalsOver?.point || null,
            under_odds: totalsUnder?.price || null,
            under_point: totalsUnder?.point || null,
        };
    }

    return { gameRecord, oddsRecord };
}

// Validate odds data — reject games with incomplete or extreme market data
// Soccer is relaxed: only requires valid moneyline (spreads/totals often unavailable)
function isValidOddsData(odds, sportKey = '') {
    const validML = odds.home_odds && odds.away_odds
        && Math.abs(odds.home_odds) <= 10000
        && Math.abs(odds.away_odds) <= 10000;

    // Soccer only needs moneyline
    if (sportKey.startsWith('soccer_')) {
        return validML;
    }

    const validSpread = odds.home_point !== null
        && odds.home_point !== undefined;

    const validTotal = odds.over_point !== null
        && odds.over_point !== undefined
        && odds.over_point !== 0;

    return validML && validSpread && validTotal;
}

async function updateAllSports() {
    console.log('🚀 PARLAY BOT — Full Multi-Sport Odds Update');
    console.log(`📅 ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
    console.log('='.repeat(60));

    const allGames = [];
    const allOdds = [];
    let totalGames = 0;
    let skippedOdds = 0;

    // Collect all games
    for (const sport of TARGET_SPORTS) {
        try {
            process.stdout.write(`\n🏟️  Fetching ${sport.title} (${sport.key})...`);
            let games = await fetchOddsForSport(sport);

            if (games.length === 0) {
                console.log(` ⏭️  No games found (off-season or no odds available)`);
                continue;
            }

            // Apply per-sport cap (e.g., NCAA = 20)
            if (sport.maxGames && games.length > sport.maxGames) {
                games.sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time));
                console.log(` ✅ ${games.length} games found → capped to ${sport.maxGames}`);
                games = games.slice(0, sport.maxGames);
            } else {
                console.log(` ✅ ${games.length} games found`);
            }

            for (const game of games) {
                const { gameRecord, oddsRecord } = parseOdds(game, sport.title);
                allGames.push(gameRecord);

                if (oddsRecord) {
                    // Validate odds data — skip games with incomplete or extreme market data
                    if (isValidOddsData(oddsRecord, sport.key)) {
                        allOdds.push(oddsRecord);
                    } else {
                        skippedOdds++;
                        console.log(`   ⚠️ Skipping odds for ${game.away_team} @ ${game.home_team} — incomplete market data (spread: ${oddsRecord.home_point}, total: ${oddsRecord.over_point}, ML: ${oddsRecord.home_odds}/${oddsRecord.away_odds})`);
                    }
                }
                totalGames++;
            }
        } catch (error) {
            console.log(` ❌ Error: ${error.message}`);
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 Total: ${totalGames} games across all sports${skippedOdds > 0 ? ` (${skippedOdds} odds skipped — invalid data)` : ''}`);
    console.log('💾 Saving to Cloud SQL...');

    // Batch upsert games
    if (allGames.length > 0) {
        try {
            for (const g of allGames) {
                await query(
                    `INSERT INTO games (game_id, sport_key, sport_title, home_team, away_team, commence_time)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT (game_id) DO UPDATE SET
                       sport_key = EXCLUDED.sport_key,
                       sport_title = EXCLUDED.sport_title,
                       home_team = EXCLUDED.home_team,
                       away_team = EXCLUDED.away_team,
                       commence_time = EXCLUDED.commence_time`,
                    [g.game_id, g.sport_key, g.sport_title, g.home_team, g.away_team, g.commence_time]
                );
            }
            console.log(`   ✅ ${allGames.length} games saved`);
        } catch (err) {
            console.error('❌ Error saving games:', err.message);
        }
    }

    // Batch upsert odds
    if (allOdds.length > 0) {
        try {
            for (const o of allOdds) {
                await query(
                    `INSERT INTO odds (game_id, bookmaker, market, home_odds, away_odds, home_point, away_point, over_odds, over_point, under_odds, under_point)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                     ON CONFLICT (game_id, bookmaker, market) DO UPDATE SET
                       home_odds = EXCLUDED.home_odds,
                       away_odds = EXCLUDED.away_odds,
                       home_point = EXCLUDED.home_point,
                       away_point = EXCLUDED.away_point,
                       over_odds = EXCLUDED.over_odds,
                       over_point = EXCLUDED.over_point,
                       under_odds = EXCLUDED.under_odds,
                       under_point = EXCLUDED.under_point,
                       updated_at = NOW()`,
                    [o.game_id, o.bookmaker, o.market, o.home_odds, o.away_odds, o.home_point, o.away_point, o.over_odds, o.over_point, o.under_odds, o.under_point]
                );
            }
            console.log(`   ✅ ${allOdds.length} odds records saved`);
        } catch (err) {
            console.error('❌ Error saving odds:', err.message);
        }
    }

    // Append to odds_history for line movement tracking (never overwrites)
    if (allOdds.length > 0) {
        try {
            for (const o of allOdds) {
                await query(
                    `INSERT INTO odds_history (game_id, bookmaker, home_odds, away_odds, home_point, away_point, over_odds, over_point, under_odds, under_point)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                    [o.game_id, o.bookmaker, o.home_odds, o.away_odds, o.home_point, o.away_point, o.over_odds, o.over_point, o.under_odds, o.under_point]
                );
            }
            console.log(`   📜 ${allOdds.length} odds history snapshots saved`);
        } catch (err) {
            console.error('⚠️ Error saving odds history:', err.message);
        }
    }

    console.log('\n🎯 Update complete!');
    await closePool();
}

updateAllSports();
