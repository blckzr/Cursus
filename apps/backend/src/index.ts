import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { db } from './config/db';
import { swaggerSpec } from './config/swagger';
import router from './routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

/**
 * CORS origin check:
 *   • dev: any localhost port
 *   • prod: explicit allowlist (CLIENT_ORIGIN, comma-separated) + optional regex
 *     (CLIENT_ORIGIN_PATTERN) for Vercel preview URLs.
 *   • Requests with no Origin header (curl, server-to-server) pass through.
 */
const localhostRe = /^http:\/\/localhost:\d+$/;
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const normalized = origin.replace(/\/$/, '');
    if (env.nodeEnv === 'development' && localhostRe.test(normalized)) return cb(null, true);
    if (env.clientOrigins.includes(normalized)) return cb(null, true);
    if (env.clientOriginPattern && env.clientOriginPattern.test(normalized)) return cb(null, true);
    return cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(morgan(':method :url :status :res[content-length] bytes — :response-time ms'));

app.use(express.json());

// API docs — available at /docs
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'SIS API Docs',
  swaggerOptions: {
    persistAuthorization: true,   // keeps JWT token across page reloads
    defaultModelsExpandDepth: -1, // hide the schemas section by default
  },
}));

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
    console.log(`[docs]   http://localhost:${env.port}/docs`);
  });
}

start();
