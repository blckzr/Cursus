import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

/**
 * Comma-separated list of allowed origins (e.g. "https://cursus.vercel.app,https://cursus-staging.vercel.app").
 * Trailing slashes are stripped so "https://x.vercel.app/" matches "https://x.vercel.app".
 */
function parseOrigins(raw: string): string[] {
  return raw.split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
}

export const env = {
  port: parseInt(process.env.PORT ?? '4000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  clientOrigins: parseOrigins(process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'),
  /**
   * Optional regex applied to the incoming Origin header. Used to allow Vercel
   * preview deployments (e.g. `^https:\/\/cursus-[a-z0-9]+-myorg\.vercel\.app$`)
   * without listing every short-lived URL in CLIENT_ORIGIN.
   */
  clientOriginPattern: process.env.CLIENT_ORIGIN_PATTERN
    ? new RegExp(process.env.CLIENT_ORIGIN_PATTERN)
    : null,
};
