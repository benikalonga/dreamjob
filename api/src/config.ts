import 'dotenv/config';

const env = process.env;
const nodeEnv = env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

function jwtSecret() {
  const value = env.JWT_SECRET;
  if (value && value.length >= 32) return value;
  if (isProduction) throw new Error('JWT_SECRET must be set to at least 32 characters in production');
  return value ?? 'YOUR_SECRETS';
}

export const config = {
  nodeEnv,
  isProduction,
  isTest: nodeEnv === 'test',
  port: Number(env.PORT ?? 4200),
  dbPath: env.DATABASE_PATH ?? './data/dreamjob.db',
  jwtSecret: jwtSecret(),
  corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:3200').split(',').map((s) => s.trim()).filter(Boolean),
  sessionDays: 30,
  jobLifetimeDays: 45,
  unverifiedJobLimit: 3,
  maxLoginAttempts: 5,
  lockMinutes: 15,
};
