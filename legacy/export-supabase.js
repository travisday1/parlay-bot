// ============================================================
// Supabase Data Export Script
// Exports all tables to JSON files for Firebase migration
// ============================================================
require('dotenv').config({ path: 'c:/Users/travi/Documents/Workspaces/.env' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EXPORT_DIR = path.join(__dirname, 'supabase-export');

const TABLES = [
    'games',
    'odds',
    'odds_history',
    'daily_picks',
    'pick_results',
    'recommended_parlays',
    'profiles',
    'leaderboard_entries',
    'pending_invites',
];

async function exportTable(tableName) {
    console.log(`📦 Exporting ${tableName}...`);
    
    let allData = [];
    let offset = 0;
    const batchSize = 1000;
    
    while (true) {
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .range(offset, offset + batchSize - 1);
        
        if (error) {
            console.log(`   ⚠️ Error exporting ${tableName}: ${error.message}`);
            break;
        }
        
        if (!data || data.length === 0) break;
        
        allData = allData.concat(data);
        offset += batchSize;
        
        if (data.length < batchSize) break; // Last page
    }
    
    const filePath = path.join(EXPORT_DIR, `${tableName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(allData, null, 2));
    console.log(`   ✅ ${allData.length} rows → ${filePath}`);
    
    return allData.length;
}

async function exportAuthUsers() {
    console.log(`\n👤 Exporting auth users...`);
    // The Supabase JS client with service role key can list auth users
    const { data, error } = await supabase.auth.admin.listUsers();
    
    if (error) {
        console.log(`   ⚠️ Error exporting auth users: ${error.message}`);
        return;
    }
    
    const users = data?.users || [];
    const filePath = path.join(EXPORT_DIR, 'auth_users.json');
    fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
    console.log(`   ✅ ${users.length} auth users → ${filePath}`);
}

async function main() {
    console.log('🔄 SUPABASE DATA EXPORT');
    console.log('='.repeat(50));
    
    // Create export directory
    if (!fs.existsSync(EXPORT_DIR)) {
        fs.mkdirSync(EXPORT_DIR, { recursive: true });
    }
    
    let totalRows = 0;
    
    for (const table of TABLES) {
        try {
            const count = await exportTable(table);
            totalRows += count;
        } catch (e) {
            console.log(`   ❌ Failed to export ${table}: ${e.message}`);
        }
    }
    
    // Export auth users
    await exportAuthUsers();
    
    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ Export complete! ${totalRows} total rows across ${TABLES.length} tables`);
    console.log(`📁 Files saved to: ${EXPORT_DIR}`);
}

main().catch(err => {
    console.error('💥 Export failed:', err);
    process.exit(1);
});
