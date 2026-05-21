import { Pool } from 'pg';
import { env } from './env';

export const db = new Pool({
  connectionString: env.databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

db.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});
