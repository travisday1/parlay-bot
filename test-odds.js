require('dotenv').config();
const API_KEY = process.env.ODDS_API_KEY;

async function testOddsAPI() {
    try {
        console.log('Testing The-Odds-API connection...');

        // Let's fetch the currently in-season sports to see what is active right now
        const sportsRes = await fetch(`https://api.the-odds-api.com/v4/sports?apiKey=${API_KEY}`);
        const sportsData = await sportsRes.json();

        console.log(`\n✅ Successfully connected! Found ${sportsData.length} active sports.`);

        // Grab NBA specifically to test the odds endpoint
        const url = new URL(`https://api.the-odds-api.com/v4/sports/basketball_nba/odds`);
        url.searchParams.append('apiKey', API_KEY);
        url.searchParams.append('regions', 'us');
        url.searchParams.append('markets', 'h2h,spreads,totals');
        url.searchParams.append('oddsFormat', 'american');
        url.searchParams.append('dateFormat', 'iso');

        const nbaRes = await fetch(url.toString());
        const nbaData = await nbaRes.json();

        console.log(`\n🏀 Successfully fetched odds for ${nbaData.length} upcoming NBA games.`);

        if (nbaData.length > 0) {
            const firstGame = nbaData[0];
            console.log('\nSample Game Data Structure:');
            console.log(`Matchup: ${firstGame.away_team} @ ${firstGame.home_team}`);
            console.log(`Commence Time: ${firstGame.commence_time}`);
            console.log(`Number of Bookmakers parsed: ${firstGame.bookmakers.length}`);

            // Log DraftKings specifically if available
            const dk = firstGame.bookmakers.find(b => b.key === 'draftkings');
            if (dk) {
                console.log('\nDraftKings Lines:');
                console.log(JSON.stringify(dk.markets, null, 2));
            }
        }

    } catch (error) {
        console.error('❌ Error testing API:', error);
    }
}

testOddsAPI();
