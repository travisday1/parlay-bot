// ============================================================
// PARLAY BOT — Reset Pick History
// One-time cleanup script that clears all pick/prediction data
// while preserving game schedules, odds, and user profiles.
//
// Usage: node reset-picks.js
// ============================================================
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TABLES_TO_CLEAR = [
    'pick_results',        // Must go first (references daily_picks)
    'recommended_parlays',
    'daily_picks',
    'model_predictions',
];

const TABLES_PRESERVED = [
    'games',
    'odds',
    'odds_history',
    'user_profiles',
];

async function confirmAndReset() {
    console.log('⚠️  PARLAY BOT — Pick History Reset');
    console.log('='.repeat(50));
    console.log('');
    console.log('This will DELETE ALL data from:');
    TABLES_TO_CLEAR.forEach(t => console.log(`   ❌ ${t}`));
    console.log('');
    console.log('These tables will NOT be touched:');
    TABLES_PRESERVED.forEach(t => console.log(`   ✅ ${t}`));
    console.log('');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const answer = await new Promise(resolve => {
        rl.question('Type YES to confirm deletion: ', resolve);
    });
    rl.close();

    if (answer.trim() !== 'YES') {
        console.log('\n❌ Aborted. No data was deleted.');
        return;
    }

    console.log('\n🗑️  Clearing tables...');

    for (const table of TABLES_TO_CLEAR) {
        try {
            // Supabase JS client doesn't have TRUNCATE — delete all rows
            const { error, count } = await supabase
                .from(table)
                .delete({ count: 'exact' })
                .neq('id', '00000000-0000-0000-0000-000000000000'); // matches all real rows

            if (error) {
                console.log(`   ⚠️ Error clearing ${table}: ${error.message}`);
            } else {
                console.log(`   ✅ ${table} — ${count ?? 'all'} rows deleted`);
            }
        } catch (e) {
            console.log(`   ❌ Failed to clear ${table}: ${e.message}`);
        }
    }

    console.log('\n✅ Pick history reset complete!');
    console.log('   Market data (games, odds, odds_history) preserved.');
    console.log('   Run the pipeline again to generate fresh picks.');
}

confirmAndReset();
