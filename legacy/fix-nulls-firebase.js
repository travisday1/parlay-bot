require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'model_predictions' ORDER BY ordinal_position")
  .then(r => { r.rows.forEach(c => console.log(c.column_name, '-', c.data_type)); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); });
