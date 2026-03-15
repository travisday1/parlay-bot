// ============================================================
// PARLAY BOT — Social Media Poster
// Queries today's picks & results from Cloud SQL and posts
// formatted updates to Twitter/X.
//
// Usage:
//   node poster.js --morning    (post today's picks)
//   node poster.js --evening    (post today's results)
//
// Requires TWITTER_BEARER_TOKEN, TWITTER_API_KEY,
// TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET
// in .env — leave them blank to run in dry-run mode.
// ============================================================
require('dotenv').config();
const { query, closePool } = require('./db');

// Twitter API credentials (leave blank for dry-run)
const TWITTER_API_KEY = process.env.TWITTER_API_KEY || '';
const TWITTER_API_SECRET = process.env.TWITTER_API_SECRET || '';
const TWITTER_ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN || '';
const TWITTER_ACCESS_SECRET = process.env.TWITTER_ACCESS_SECRET || '';
const DRY_RUN = !TWITTER_API_KEY || !TWITTER_ACCESS_TOKEN;

// ===== EMOJI MAP =====
const SPORT_EMOJI = {
    'basketball_nba': '🏀',
    'basketball_ncaab': '🏀',
    'icehockey_nhl': '🏒',
    'americanfootball_nfl': '🏈',
    'baseball_mlb': '⚾'
};

const TIER_EMOJI = {
    'lock': '🔒',
    'value': '💎',
    'probable': '📊',
    'longshot': '🎯'
};

const TIER_LABEL = {
    'lock': 'LOCK',
    'value': 'VALUE',
    'probable': 'PROBABLE',
    'longshot': 'LONGSHOT'
};

// ===== FORMAT ODDS =====
function formatOdds(odds) {
    if (!odds) return '';
    return odds > 0 ? `(+${odds})` : `(${odds})`;
}

// ===== FETCH TODAY'S PICKS =====
async function fetchTodaysPicks() {
    const today = new Date().toISOString().split('T')[0];
    const picks = await query(
        `SELECT dp.*, g.sport_key, g.sport_title, g.home_team, g.away_team, g.commence_time
         FROM daily_picks dp
         JOIN games g ON g.game_id = dp.game_id
         WHERE dp.pick_date = $1
         ORDER BY dp.confidence DESC`,
        [today]
    );
    // Reshape to match old structure
    return (picks || []).map(p => ({
        ...p,
        games: { sport_key: p.sport_key, sport_title: p.sport_title, home_team: p.home_team, away_team: p.away_team, commence_time: p.commence_time }
    }));
}

// ===== FETCH TODAY'S RESULTS =====
async function fetchTodaysResults() {
    const today = new Date().toISOString().split('T')[0];
    const results = await query(
        `SELECT pr.*, dp.pick_date, dp.tier, dp.pick_type, dp.picked_team, dp.picked_odds, dp.confidence,
                g.sport_key, g.sport_title, g.home_team, g.away_team
         FROM pick_results pr
         JOIN daily_picks dp ON dp.id = pr.pick_id
         JOIN games g ON g.game_id = dp.game_id
         WHERE dp.pick_date = $1`,
        [today]
    );
    // Reshape to match old structure
    return (results || []).map(r => ({
        ...r,
        daily_picks: {
            pick_date: r.pick_date, tier: r.tier, pick_type: r.pick_type,
            picked_team: r.picked_team, picked_odds: r.picked_odds, confidence: r.confidence,
            games: { sport_key: r.sport_key, sport_title: r.sport_title, home_team: r.home_team, away_team: r.away_team }
        }
    }));
}

// ===== FETCH TODAY'S PARLAYS =====
async function fetchTodaysParlays() {
    const today = new Date().toISOString().split('T')[0];
    return await query(
        `SELECT * FROM recommended_parlays WHERE parlay_date = $1 ORDER BY confidence DESC`,
        [today]
    );
}

// ===== BUILD MORNING TWEET =====
function buildMorningThread(picks, parlays) {
    const tweets = [];
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

    const lockPicks = picks.filter(p => p.tier === 'lock');
    const valuePicks = picks.filter(p => p.tier === 'value');
    const totalPicks = picks.length;

    let main = `🤖 PARLAY BOT — ${today}\n\n`;
    main += `📊 ${totalPicks} picks across ${[...new Set(picks.map(p => p.games?.sport_title))].filter(Boolean).join(', ')}\n`;
    main += `🔒 ${lockPicks.length} locks | 💎 ${valuePicks.length} value plays\n\n`;

    const topPicks = picks.slice(0, 5);
    for (const pick of topPicks) {
        const emoji = SPORT_EMOJI[pick.games?.sport_key] || '🎲';
        const tierEmoji = TIER_EMOJI[pick.tier] || '';
        const odds = formatOdds(pick.picked_odds);
        const conf = pick.confidence;

        let pickLabel = pick.picked_team;
        if (pick.pick_type === 'spread' && pick.picked_line) {
            pickLabel += ` ${pick.picked_line > 0 ? '+' : ''}${pick.picked_line}`;
        } else if (pick.pick_type === 'over' || pick.pick_type === 'under') {
            pickLabel = `${pick.pick_type.toUpperCase()} ${pick.picked_line}`;
        }

        main += `${emoji} ${tierEmoji} ${pickLabel} ${odds} (${conf}%)\n`;
    }

    if (picks.length > 5) {
        main += `\n+${picks.length - 5} more on parlaybot.ai`;
    }

    main += `\n\n🔗 Full analysis: parlaybot.ai`;
    tweets.push(main);

    if (parlays.length > 0) {
        let parlayTweet = `🎰 RECOMMENDED PARLAYS\n\n`;
        for (const parlay of parlays.slice(0, 3)) {
            const legs = parlay.legs || [];
            const payout = parlay.payout_on_100 ? `$${parlay.payout_on_100}` : '?';
            parlayTweet += `${parlay.name}\n`;
            for (const leg of legs.slice(0, 4)) {
                parlayTweet += `  • ${leg.picked_team} ${formatOdds(leg.odds)}\n`;
            }
            if (legs.length > 4) parlayTweet += `  + ${legs.length - 4} more legs\n`;
            parlayTweet += `  💰 $100 → ${payout}\n\n`;
        }
        tweets.push(parlayTweet.trim());
    }

    return tweets;
}

// ===== BUILD EVENING TWEET =====
function buildEveningThread(results) {
    const tweets = [];
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

    const wins = results.filter(r => r.result === 'win');
    const losses = results.filter(r => r.result === 'loss');
    const pushes = results.filter(r => r.result === 'push');

    if (results.length === 0) {
        tweets.push(`🤖 PARLAY BOT — ${today}\n\n📊 No results to report yet. Games may still be in progress.\n\nCheck back tomorrow for full results!`);
        return tweets;
    }

    let totalWagered = results.length * 100;
    let totalReturned = 0;
    for (const r of results) {
        if (r.result === 'win') totalReturned += (r.payout_on_100 || 200);
        else if (r.result === 'push') totalReturned += 100;
    }
    const roi = ((totalReturned - totalWagered) / totalWagered * 100).toFixed(1);

    let main = `🤖 PARLAY BOT RESULTS — ${today}\n\n`;
    main += `✅ ${wins.length}W - ${losses.length}L`;
    if (pushes.length > 0) main += ` - ${pushes.length}P`;
    main += `\n`;
    main += `📈 ROI: ${roi > 0 ? '+' : ''}${roi}%\n\n`;

    const lockResults = results.filter(r => r.daily_picks?.tier === 'lock');
    if (lockResults.length > 0) {
        main += `🔒 LOCKS:\n`;
        for (const r of lockResults) {
            const icon = r.result === 'win' ? '✅' : r.result === 'push' ? '🟡' : '❌';
            const pick = r.daily_picks;
            main += `${icon} ${pick?.picked_team} ${formatOdds(pick?.picked_odds)}\n`;
        }
        main += `\n`;
    }

    const valueResults = results.filter(r => r.daily_picks?.tier === 'value');
    if (valueResults.length > 0) {
        main += `💎 VALUE:\n`;
        for (const r of valueResults.slice(0, 5)) {
            const icon = r.result === 'win' ? '✅' : r.result === 'push' ? '🟡' : '❌';
            const pick = r.daily_picks;
            main += `${icon} ${pick?.picked_team} ${formatOdds(pick?.picked_odds)}\n`;
        }
    }

    main += `\n🔗 Full breakdown: parlaybot.ai`;
    tweets.push(main);

    return tweets;
}

// ===== POST TO TWITTER/X =====
async function postToTwitter(text) {
    if (DRY_RUN) {
        console.log('📝 DRY RUN — would post:');
        console.log('─'.repeat(50));
        console.log(text);
        console.log('─'.repeat(50));
        console.log(`Character count: ${text.length}/280`);
        if (text.length > 280) {
            console.log('⚠️  Tweet exceeds 280 characters! Will be truncated.');
        }
        return { success: true, dry_run: true };
    }

    const crypto = require('crypto');
    const url = 'https://api.twitter.com/2/tweets';

    const oauthParams = {
        oauth_consumer_key: TWITTER_API_KEY,
        oauth_token: TWITTER_ACCESS_TOKEN,
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
        oauth_nonce: crypto.randomBytes(16).toString('hex'),
        oauth_version: '1.0'
    };

    const params = { ...oauthParams };
    const paramString = Object.keys(params).sort()
        .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
        .join('&');

    const signatureBase = `POST&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`;
    const signingKey = `${encodeURIComponent(TWITTER_API_SECRET)}&${encodeURIComponent(TWITTER_ACCESS_SECRET)}`;
    const signature = crypto.createHmac('sha1', signingKey).update(signatureBase).digest('base64');
    oauthParams.oauth_signature = signature;

    const authHeader = 'OAuth ' + Object.keys(oauthParams).sort()
        .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
        .join(', ');

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text })
        });

        if (!response.ok) {
            const err = await response.text();
            console.error('❌ Twitter API error:', response.status, err);
            return { success: false, error: err };
        }

        const result = await response.json();
        console.log('✅ Tweet posted! ID:', result.data?.id);
        return { success: true, tweet_id: result.data?.id };
    } catch (err) {
        console.error('❌ Twitter request failed:', err.message);
        return { success: false, error: err.message };
    }
}

// ===== MAIN =====
async function run() {
    const mode = process.argv.includes('--evening') ? 'evening'
        : process.argv.includes('--morning') ? 'morning'
            : 'morning';

    console.log(`🐦 Parlay Bot Poster — ${mode} mode`);
    console.log('='.repeat(50));

    if (DRY_RUN) {
        console.log('⚠️  No Twitter credentials found — running in DRY RUN mode');
        console.log('   Set TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN,');
        console.log('   TWITTER_ACCESS_SECRET in .env to enable live posting.\n');
    }

    if (mode === 'morning') {
        const picks = await fetchTodaysPicks();
        const parlays = await fetchTodaysParlays();

        if (picks.length === 0) {
            console.log('📭 No picks found for today. Skipping post.');
            await closePool();
            return;
        }

        console.log(`📊 Found ${picks.length} picks and ${parlays.length} parlays\n`);

        const tweets = buildMorningThread(picks, parlays);
        for (let i = 0; i < tweets.length; i++) {
            console.log(`\nPosting tweet ${i + 1}/${tweets.length}...`);
            await postToTwitter(tweets[i]);
        }

    } else if (mode === 'evening') {
        const results = await fetchTodaysResults();

        if (results.length === 0) {
            console.log('📭 No results settled yet. Skipping post.');
            await closePool();
            return;
        }

        console.log(`📊 Found ${results.length} settled results\n`);

        const tweets = buildEveningThread(results);
        for (let i = 0; i < tweets.length; i++) {
            console.log(`\nPosting tweet ${i + 1}/${tweets.length}...`);
            await postToTwitter(tweets[i]);
        }
    }

    console.log('\n🎯 Poster complete!');
    await closePool();
}

run();
