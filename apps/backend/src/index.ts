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

const allowedOrigins = env.nodeEnv === 'development'
  ? /^http:\/\/localhost:\d+$/   // allow any localhost port in dev
  : env.clientOrigin;

app.use(cors({
  origin: allowedOrigins,
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
