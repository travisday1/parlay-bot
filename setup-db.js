// Setup script: Creates all database tables by connecting directly to Supabase Postgres
require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');

// Supabase provides a direct Postgres connection
// Format: postgresql://postgres.[project-ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
const PROJECT_REF = 'civkjfswgtvjxxqquxqb';

// Read the schema SQL file
const schemaSQL = fs.readFileSync('./schema.sql', 'utf-8');

async function setupDatabase() {
    // Use the Supabase session pooler connection string
    const client = new Client({
        host: `aws-0-us-east-1.pooler.supabase.com`,
        port: 6543,
        database: 'postgres',
        user: `postgres.${PROJECT_REF}`,
        password: process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_SERVICE_ROLE_KEY,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🔧 Connecting to Supabase Postgres...');
        await client.connect();
        console.log('✅ Connected! Executing schema...\n');

        await client.query(schemaSQL);
        console.log('✅ All tables, policies, and indexes created successfully!');

        // Verify tables exist
        const result = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `);
        console.log('\n📋 Tables in your database:');
        result.rows.forEach(r => console.log(`   • ${r.table_name}`));

    } catch (error) {
        console.error('❌ Error:', error.message);

        if (error.message.includes('password authentication failed') || error.message.includes('SASL')) {
            console.log('\n⚠️  Direct Postgres connection needs the DATABASE PASSWORD (not the API key).');
            console.log('   To find it: Go to Supabase Dashboard → Project Settings → Database → Database password');
            console.log('   Then add SUPABASE_DB_PASSWORD=your_password to the .env file');
        }
    } finally {
        await client.end();
    }
}

setupDatabase();
