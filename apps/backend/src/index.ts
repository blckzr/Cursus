import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { db } from './config/db';
import router from './routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(cors({
  origin: env.clientOrigin,
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json());

app.use('/api', router);

app.use(errorHandler);

async function start() {
  try {
    await db.query('SELECT 1');
    console.log('[db] Connected to Supabase');
  } catch (err) {
    console.error('[db] Failed to connect:', err);
    process.exit(1);
  }

  app.listen(env.port, () => {
    console.log(`[server] Running on http://localhost:${env.port} (${env.nodeEnv})`);
  });
}

start();
