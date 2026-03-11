require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    let out = '';

    // Check recommended parlays
    out += '=== RECOMMENDED PARLAYS (latest 6) ===\n';
    const { data: parlays, error: pErr } = await sb
        .from('recommended_parlays')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(6);
    if (pErr) { out += 'Parlay error: ' + JSON.stringify(pErr) + '\n'; }
    else {
        for (const p of parlays) {
            out += `\n[${p.created_at}] tier=${p.tier} name="${p.name}"\n`;
            const legs = typeof p.legs === 'string' ? JSON.parse(p.legs) : p.legs;
            for (const l of legs) {
                out += `   ${l.team || l.picked_team || '?'} | odds: ${l.odds} | type: ${l.pick_type || 'unknown'}\n`;
            }
        }
    }

    // Check latest game timestamps
    out += '\n=== LATEST GAME TIMESTAMPS ===\n';
    const { data: games, error: gErr } = await sb
        .from('games')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3);
    if (gErr) { out += 'Games error: ' + JSON.stringify(gErr) + '\n'; }
    else if (games.length > 0) {
        out += 'Columns: ' + Object.keys(games[0]).join(', ') + '\n';
        for (const g of games) {
            out += `[${g.created_at}] ${g.away_team} @ ${g.home_team} (${g.sport_key})\n`;
        }
    }

    // Check soccer games specifically
    out += '\n=== SOCCER GAMES ===\n';
    const { data: soccer, error: sErr } = await sb
        .from('games')
        .select('id,home_team,away_team,sport_key,commence_time,created_at')
        .like('sport_key', 'soccer_%')
        .order('commence_time', { ascending: true })
        .limit(10);
    if (sErr) { out += 'Soccer error: ' + JSON.stringify(sErr) + '\n'; }
    else {
        out += `Found ${soccer ? soccer.length : 0} soccer games\n`;
        for (const g of (soccer || [])) {
            out += `  [${g.commence_time}] ${g.away_team} @ ${g.home_team} (${g.sport_key})\n`;
        }
    }

    fs.writeFileSync('C:\\tmp\\db-result.txt', out, 'utf8');
    console.log('Done! Output written to C:\\tmp\\db-result.txt');
})();
