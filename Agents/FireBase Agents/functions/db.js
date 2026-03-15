// ============================================================
// PARLAY BOT — Shared Database Connection (Firebase Cloud SQL)
// Replaces the Supabase client across all backend scripts
// ============================================================
require('dotenv').config({ path: __dirname + '/.env' });
const { Pool } = require('pg');

// Cloud SQL connection via pg module
// Uses DATABASE_URL env var or individual PG* vars
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('cloud.google.com') 
        ? { rejectUnauthorized: false } 
        : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

// Log connection events
pool.on('error', (err) => {
    console.error('💥 Unexpected database error:', err.message);
});

// Helper: Run a query and return rows
async function query(text, params = []) {
    const result = await pool.query(text, params);
    return result.rows;
}

// Helper: Run a query and return the first row
async function queryOne(text, params = []) {
    const result = await pool.query(text, params);
    return result.rows[0] || null;
}

// Helper: Run a query and return the count of affected rows
async function execute(text, params = []) {
    const result = await pool.query(text, params);
    return result.rowCount;
}

// Helper: Batch upsert using unnest arrays (pg-native style)
async function batchUpsert(tableName, rows, conflictTarget, updateColumns) {
    if (!rows || rows.length === 0) return 0;
    
    const columns = Object.keys(rows[0]);
    const values = rows.map((row, i) => 
        `(${columns.map((col, j) => `$${i * columns.length + j + 1}`).join(', ')})`
    ).join(', ');
    
    const params = rows.flatMap(row => columns.map(col => row[col]));
    
    const updateSet = updateColumns
        .map(col => `${col} = EXCLUDED.${col}`)
        .join(', ');
    
    const sql = `
        INSERT INTO ${tableName} (${columns.join(', ')})
        VALUES ${values}
        ON CONFLICT (${conflictTarget})
        DO UPDATE SET ${updateSet}
    `;
    
    const result = await pool.query(sql, params);
    return result.rowCount;
}

// Graceful shutdown
async function closePool() {
    await pool.end();
}

module.exports = {
    pool,
    query,
    queryOne,
    execute,
    batchUpsert,
    closePool
};
