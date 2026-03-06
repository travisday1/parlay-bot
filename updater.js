// ============================================================
// PARLAY BOT — Full Multi-Sport Odds Updater
// Fetches live odds from The-Odds-API for all major sports
// and stores them in the Supabase database.
// ============================================================
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
        id: game.id,
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

async function updateAllSports() {
    console.log('🚀 PARLAY BOT — Full Multi-Sport Odds Update');
    console.log(`📅 ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
    console.log('='.repeat(60));

    const allGames = [];
    const allOdds = [];
    let totalGames = 0;

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
                if (oddsRecord) allOdds.push(oddsRecord);
                totalGames++;
            }
        } catch (error) {
            console.log(` ❌ Error: ${error.message}`);
        }
    }


    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 Total: ${totalGames} games across all sports`);
    console.log('💾 Saving to Supabase...');

    // Batch upsert games
    if (allGames.length > 0) {
        const { error: gamesError } = await supabase
            .from('games')
            .upsert(allGames, { onConflict: 'game_id' });
        if (gamesError) {
            console.error('❌ Error saving games:', gamesError.message);
        } else {
            console.log(`   ✅ ${allGames.length} games saved`);
        }
    }

    // Batch upsert odds
    if (allOdds.length > 0) {
        const { error: oddsError } = await supabase
            .from('odds')
            .upsert(allOdds, { onConflict: 'game_id,bookmaker,market' });
        if (oddsError) {
            console.error('❌ Error saving odds:', oddsError.message);
        } else {
            console.log(`   ✅ ${allOdds.length} odds records saved`);
        }
    }

    console.log('\n🎯 Update complete!');
}

updateAllSports();
