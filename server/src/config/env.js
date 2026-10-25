import 'dotenv/config';

const num = (v, d) => (v === undefined || v === null || v === '' ? d : Number(v));
const bool = (v, d) => (v === undefined || v === '' ? d : String(v).toLowerCase() === 'true');

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  port: num(process.env.PORT, 5000),
  mongoUri: process.env.MONGODB_URI || '',
  jwtSecret: process.env.JWT_SECRET || 'insecure-dev-secret-please-change',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  // First-run admin bootstrap (used only when the database has no admin yet)
  adminEmail: (process.env.ADMIN_EMAIL || 'admin@hcm.local').toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || 'Admin@12345',
  adminName: process.env.ADMIN_NAME || 'System Admin',
  // Company defaults for first-run setup
  companyName: process.env.COMPANY_NAME || '',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  // Minutes east of UTC used for every attendance / payroll calculation
  utcOffsetMinutes: num(process.env.APP_UTC_OFFSET_MINUTES, 300),
  // AI provider (OpenAI-compatible chat completions + tools)
  ai: {
    baseUrl: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    timeoutMs: num(process.env.AI_TIMEOUT_MS, 15000),
    maxToolRounds: num(process.env.AI_MAX_TOOL_ROUNDS, 4),
  },
  aiEnabled: bool(process.env.AI_ENABLED, true),
  corsOrigins: (process.env.CORS_ORIGINS || process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

if (env.isProd && env.jwtSecret === 'insecure-dev-secret-please-change') {
  console.warn('[env] WARNING: using the default JWT_SECRET in production. Set JWT_SECRET.');
}
