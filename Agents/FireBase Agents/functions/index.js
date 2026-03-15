// ============================================================
// PARLAY BOT — Cloud Functions HTTP API
// Serves as the REST backend for the vanilla JS frontend,
// replacing Supabase's client library queries.
// Deployed via `firebase deploy --only functions`
// ============================================================
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { Pool } = require('pg');
const cors = require('cors')({ origin: true });

admin.initializeApp();

// Cloud SQL / PostgreSQL connection
const pool = new Pool(
    process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 }
        : { host: process.env.PGHOST, port: parseInt(process.env.PGPORT || '5432'), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: { rejectUnauthorized: false }, max: 5 }
);

// Helper: verify Firebase Auth token from Authorization header
async function verifyAuth(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    try {
        return await admin.auth().verifyIdToken(authHeader.split('Bearer ')[1]);
    } catch (e) {
        return null;
    }
}

// Helper: run SQL query
async function query(text, params = []) {
    const result = await pool.query(text, params);
    return result.rows;
}

// ============================================================
// PUBLIC ENDPOINTS (no auth required)
// ============================================================

// GET /api/games?date=YYYY-MM-DD
exports.api = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        try {
            const path = req.path.replace(/^\/api/, '');
            
            // Route to handler
            switch (true) {
                case path.startsWith('/games'): return await handleGames(req, res);
                case path.startsWith('/picks'): return await handlePicks(req, res);
                case path.startsWith('/parlays'): return await handleParlays(req, res);
                case path.startsWith('/results'): return await handleResults(req, res);
                case path.startsWith('/profile'): return await handleProfile(req, res);
                case path.startsWith('/admin'): return await handleAdmin(req, res);
                case path === '/health': return res.json({ status: 'ok', timestamp: new Date().toISOString() });
                default: return res.status(404).json({ error: 'Not found' });
            }
        } catch (err) {
            console.error('API error:', err);
            res.status(500).json({ error: err.message });
        }
    });
});

// GET /api/games — today's games with odds
async function handleGames(req, res) {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const nextDay = new Date(new Date(date).getTime() + 86400000).toISOString().split('T')[0];
    
    const games = await query(
        `SELECT * FROM games WHERE commence_time >= $1 AND commence_time < $2 ORDER BY commence_time ASC`,
        [date, nextDay]
    );
    
    // Fetch odds for these games
    if (games.length > 0) {
        const gameIds = games.map(g => g.game_id);
        const oddsRows = await query(
            `SELECT * FROM odds WHERE game_id = ANY($1)`,
            [gameIds]
        );
        const oddsMap = {};
        for (const o of oddsRows) {
            if (!oddsMap[o.game_id]) oddsMap[o.game_id] = [];
            oddsMap[o.game_id].push(o);
        }
        for (const g of games) {
            g.odds = oddsMap[g.game_id] || [];
        }
    }
    
    res.json({ data: games });
}

// GET /api/picks?date=YYYY-MM-DD — today's AI picks
async function handlePicks(req, res) {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    
    // Check user auth for tier gating
    const user = await verifyAuth(req);
    let tierFilter = "AND dp.tier IN ('lock')"; // Free tier: locks only
    
    if (user) {
        let tier = 'free';
        // Check custom claims first (works with Firebase UIDs)
        if (user.admin === true) tier = 'pro';
        // Try DB lookup (may fail if Firebase UID doesn't match Supabase UUID format)
        try {
            const profile = await query(`SELECT subscription_tier, granted_tier FROM profiles WHERE id = $1`, [user.uid]);
            if (profile?.[0]) {
                tier = profile[0].granted_tier || profile[0].subscription_tier || tier;
            }
        } catch (e) {
            // Try lookup by email as fallback
            try {
                const profile = await query(`SELECT subscription_tier, granted_tier FROM profiles WHERE email = $1`, [user.email]);
                if (profile?.[0]) {
                    tier = profile[0].granted_tier || profile[0].subscription_tier || tier;
                }
            } catch (e2) { /* DB not available */ }
        }
        
        if (tier === 'pro') {
            tierFilter = ''; // Pro: all picks
        } else if (tier === 'plus') {
            tierFilter = "AND dp.tier IN ('lock', 'value')"; // Plus: locks + value
        }
    }
    
    const picks = await query(
        `SELECT dp.*, g.sport_key, g.sport_title, g.home_team, g.away_team, g.commence_time
         FROM daily_picks dp
         JOIN games g ON g.game_id = dp.game_id
         WHERE dp.pick_date = $1 ${tierFilter}
         ORDER BY dp.confidence DESC`,
        [date]
    );
    
    res.json({ data: picks });
}

// GET /api/parlays?date=YYYY-MM-DD — recommended parlays
async function handleParlays(req, res) {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    
    const parlays = await query(
        `SELECT * FROM recommended_parlays WHERE parlay_date = $1 ORDER BY tier ASC`,
        [date]
    );
    
    res.json({ data: parlays });
}

// GET /api/results — performance tracker data
async function handleResults(req, res) {
    const days = parseInt(req.query.days) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const results = await query(
        `SELECT pr.*, dp.pick_date, dp.tier, dp.pick_type, dp.picked_team, dp.picked_odds,
                dp.picked_line, dp.confidence,
                g.sport_key, g.sport_title, g.home_team, g.away_team
         FROM pick_results pr
         JOIN daily_picks dp ON dp.id = pr.pick_id
         JOIN games g ON g.game_id = dp.game_id
         WHERE dp.pick_date >= $1
         ORDER BY pr.settled_at DESC`,
        [startDate.toISOString().split('T')[0]]
    );
    
    res.json({ data: results });
}

// GET/POST /api/profile — user profile management
async function handleProfile(req, res) {
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    
    // Fallback profile from Firebase Auth token (used when DB isn't connected)
    const authProfile = {
        id: user.uid,
        email: user.email,
        display_name: user.name || user.email?.split('@')[0] || 'User',
        is_admin: user.admin === true,
        subscription_tier: 'free',
        granted_tier: user.admin ? 'pro' : null,
    };
    
    if (req.method === 'GET') {
        try {
            const profile = await query(`SELECT * FROM profiles WHERE id = $1`, [user.uid]);
            if (!profile || profile.length === 0) {
                await query(
                    `INSERT INTO profiles (id, email, display_name, is_admin) VALUES ($1, $2, $3, $4)
                     ON CONFLICT (id) DO NOTHING`,
                    [user.uid, user.email, authProfile.display_name, user.admin === true]
                );
                const newProfile = await query(`SELECT * FROM profiles WHERE id = $1`, [user.uid]);
                return res.json({ data: newProfile[0] || authProfile });
            }
            // Merge custom claim admin into DB profile
            const p = profile[0];
            if (user.admin === true && !p.is_admin) p.is_admin = true;
            // Check for pending invite
            const invite = await query(`SELECT * FROM pending_invites WHERE email = $1`, [user.email]);
            if (invite && invite.length > 0) {
                await query(
                    `UPDATE profiles SET granted_tier = $1, granted_by = $2, granted_at = NOW() WHERE id = $3`,
                    [invite[0].granted_tier, invite[0].granted_by, user.uid]
                );
                await query(`DELETE FROM pending_invites WHERE email = $1`, [user.email]);
                const updatedProfile = await query(`SELECT * FROM profiles WHERE id = $1`, [user.uid]);
                return res.json({ data: updatedProfile[0] || authProfile });
            }
            return res.json({ data: p });
        } catch (e) {
            // DB not available — return auth-based profile
            console.warn('Profile DB query failed, using auth fallback:', e.message);
            return res.json({ data: authProfile });
        }
    }
    
    if (req.method === 'PUT') {
        try {
            const { display_name, avatar_url } = req.body;
            await query(
                `UPDATE profiles SET display_name = COALESCE($1, display_name), avatar_url = COALESCE($2, avatar_url) WHERE id = $3`,
                [display_name, avatar_url, user.uid]
            );
            const updated = await query(`SELECT * FROM profiles WHERE id = $1`, [user.uid]);
            return res.json({ data: updated[0] || authProfile });
        } catch (e) {
            return res.json({ data: authProfile });
        }
    }
    
    res.status(405).json({ error: 'Method not allowed' });
}

// Admin endpoints (requires admin role)
async function handleAdmin(req, res) {
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    
    // Check admin status: custom claims OR profiles table
    const isClaimAdmin = user.admin === true;
    let isDbAdmin = false;
    try {
        const profile = await query(`SELECT is_admin FROM profiles WHERE id = $1`, [user.uid]);
        isDbAdmin = profile?.[0]?.is_admin === true;
    } catch (e) {
        // DB not available yet — rely on custom claims
    }
    if (!isClaimAdmin && !isDbAdmin) return res.status(403).json({ error: 'Forbidden' });
    
    const action = req.path.replace(/^\/api\/admin\/?/, '');
    
    if (action === 'users' && req.method === 'GET') {
        const users = await query(`SELECT * FROM profiles ORDER BY created_at DESC`);
        return res.json({ data: users });
    }
    
    if (action === 'grant-tier' && req.method === 'POST') {
        const { uid, tier } = req.body;
        await query(
            `UPDATE profiles SET granted_tier = $1, granted_by = $2, granted_at = NOW() WHERE id = $3`,
            [tier, user.uid, uid]
        );
        return res.json({ success: true });
    }
    
    if (action === 'toggle-admin' && req.method === 'POST') {
        const { uid, is_admin } = req.body;
        await query(`UPDATE profiles SET is_admin = $1 WHERE id = $2`, [is_admin, uid]);
        return res.json({ success: true });
    }
    
    if (action === 'invite' && req.method === 'POST') {
        const { email, tier } = req.body;
        await query(
            `INSERT INTO pending_invites (email, granted_tier, granted_by) VALUES ($1, $2, $3)
             ON CONFLICT (email) DO UPDATE SET granted_tier = $2, granted_by = $3`,
            [email, tier, user.uid]
        );
        return res.json({ success: true });
    }
    
    if (action === 'pipeline-runs' && req.method === 'GET') {
        const runs = await query(`SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT 30`);
        return res.json({ data: runs });
    }
    
    res.status(404).json({ error: 'Unknown admin action' });
}

// ============================================================
// SCHEDULED PIPELINE — runs daily at 8:00 AM EST (13:00 UTC)
// ============================================================
const { execSync } = require('child_process');
const path = require('path');

exports.dailyPipeline = functions
    .runWith({ timeoutSeconds: 540, memory: '1GB' })
    .pubsub.schedule('0 6 * * *')  // 6:00 AM Eastern (timezone set below)
    .timeZone('America/New_York')
    .onRun(async (context) => {
        console.log('🔄 Scheduled Daily Pipeline starting...');
        const scripts = ['updater.js', 'settler.js', 'refiner.js', 'analyzer.js'];
        
        for (const script of scripts) {
            const scriptPath = path.join(__dirname, script);
            console.log(`▶️  Running ${script}...`);
            try {
                execSync(`node "${scriptPath}"`, {
                    stdio: 'inherit',
                    cwd: __dirname,
                    env: { ...process.env },
                    timeout: 150000, // 2.5 min per script
                });
                console.log(`✅ ${script} completed`);
            } catch (err) {
                console.error(`❌ ${script} failed:`, err.message);
                if (script === 'updater.js') {
                    console.error('💥 Updater failed — aborting pipeline');
                    return null;
                }
            }
        }
        
        console.log('🎯 Scheduled pipeline complete!');
        return null;
    });
