import 'dotenv/config';

const asBool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const DEV_ACCESS = 'dev-access-secret-change-me';
const DEV_REFRESH = 'dev-refresh-secret-change-me';

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGODB_URI || '',
  accessSecret: process.env.JWT_ACCESS_SECRET || DEV_ACCESS,
  refreshSecret: process.env.JWT_REFRESH_SECRET || DEV_REFRESH,
  accessTtl: process.env.JWT_ACCESS_TTL || '30m',
  refreshDays: Number(process.env.JWT_REFRESH_DAYS || 30),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  openaiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
  whatsappAppSecret: process.env.WHATSAPP_APP_SECRET || '',
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'unique-frontdesk-verify',
  allowSuperAdminBootstrap: asBool(process.env.ALLOW_SUPER_ADMIN_BOOTSTRAP, false),
};

/**
 * Returns a human readable problem with a configured MongoDB URI, or null when
 * it looks usable. Catches the mistakes that produce opaque mongoose errors:
 * empty values, pasted file paths or web links, leftover <password>
 * placeholders and missing credentials.
 */
export function mongoUriProblem(uri) {
  const value = String(uri || '').trim();
  if (!value) return 'MONGODB_URI is empty. Add your Atlas connection string to .env.';
  if (/^([a-z]:\\|\\\\)/i.test(value) || value.startsWith('/') || value.startsWith('./')) {
    return `MONGODB_URI looks like a file path (${value.slice(0, 40)}), not a connection string. Copy it from Atlas → Connect → Drivers → Node.js.`;
  }
  if (/^https?:\/\//i.test(value)) {
    return 'MONGODB_URI is a web link. Use the mongodb+srv:// string from Atlas → Connect → Drivers → Node.js.';
  }
  if (!/^mongodb(\+srv)?:\/\//i.test(value)) {
    return 'MONGODB_URI must start with mongodb:// or mongodb+srv://.';
  }
  const rest = value.replace(/^mongodb(\+srv)?:\/\//i, '');
  if (/[<>]/.test(rest)) {
    return 'MONGODB_URI still contains a <username> or <password> placeholder — replace it with the real database user and password.';
  }
  if (!rest.includes('@')) {
    return 'MONGODB_URI has no credentials. It should look like mongodb+srv://user:password@cluster0.xxxxx.mongodb.net.';
  }
  const host = rest.split('@').pop().split('/')[0].split('?')[0];
  if (!host || !host.includes('.')) {
    return 'MONGODB_URI has no cluster host after the @ (expected something like cluster0.xxxxx.mongodb.net).';
  }
  if (/\s/.test(value)) {
    return 'MONGODB_URI contains a space — remove line breaks/spaces, keep it on a single unquoted line.';
  }
  return null;
}

export function assertProdConfig() {
  if (!env.isProd) return;
  const problems = [];
  if (!env.mongoUri) problems.push('MONGODB_URI');
  if (!process.env.JWT_ACCESS_SECRET || env.accessSecret === DEV_ACCESS) problems.push('JWT_ACCESS_SECRET');
  if (!process.env.JWT_REFRESH_SECRET || env.refreshSecret === DEV_REFRESH) problems.push('JWT_REFRESH_SECRET');
  if (problems.length) {
    throw new Error(`Refusing to start in production without secure configuration: ${problems.join(', ')}`);
  }
}

export const allowedOrigins = () =>
  String(env.clientOrigin)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
