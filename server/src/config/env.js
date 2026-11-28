import 'dotenv/config';

const asBool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const DEV_ACCESS = 'dev-access-secret-change-me';
const DEV_REFRESH = 'dev-refresh-secret-change-me';

// Every Vercel preview deployment has its own host in VERCEL_URL. Deriving the
// public URLs from it keeps CORS and email links on the deployment that served
// the request, instead of a fixed alias that points at a different build.
const vercelHost = String(process.env.VERCEL_URL || '')
  .replace(/^https?:\/\//i, '')
  .replace(/\/+$/, '');
const previewUrl = String(process.env.VERCEL_ENV || '').toLowerCase() === 'preview' && vercelHost ? `https://${vercelHost}` : '';

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGODB_URI || '',
  accessSecret: process.env.JWT_ACCESS_SECRET || DEV_ACCESS,
  refreshSecret: process.env.JWT_REFRESH_SECRET || DEV_REFRESH,
  accessTtl: process.env.JWT_ACCESS_TTL || '30m',
  refreshDays: Number(process.env.JWT_REFRESH_DAYS || 30),
  clientOrigin: process.env.CLIENT_ORIGIN || previewUrl || 'http://localhost:5173',
  openaiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
  whatsappAppSecret: process.env.WHATSAPP_APP_SECRET || '',
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'unique-frontdesk-verify',
  allowSuperAdminBootstrap: asBool(process.env.ALLOW_SUPER_ADMIN_BOOTSTRAP, false),
  // Transactional email (verification codes, password resets).
  resendApiKey: process.env.RESEND_API_KEY || '',
  // Shared rate-limit store (Upstash Redis REST). Optional: without it the
  // webhook limits stay per serverless instance.
  upstashRedisUrl: process.env.UPSTASH_REDIS_REST_URL || '',
  upstashRedisToken: process.env.UPSTASH_REDIS_REST_TOKEN || '',
  mailFrom: process.env.MAIL_FROM || 'Unique AI Frontdesk <onboarding@resend.dev>',
  appUrl: process.env.APP_URL || process.env.CLIENT_ORIGIN || previewUrl || 'http://localhost:5173',
};

/**
 * Returns a human readable problem with a configured MongoDB URI, or null when
 * it looks usable. Catches the mistakes that produce opaque mongoose errors:
 * empty values, pasted file paths or web links, leftover <password>
 * placeholders and missing credentials.
 */
const LOCAL_MONGO_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

/** Database that holds the live production data. Preview deployments must never open it. */
export const PRODUCTION_DB_NAME = 'unique-frontdesk';

/** Database name inside a connection string ('' when the URI names none). */
export function mongoUriDbName(uri) {
  const rest = String(uri || '')
    .trim()
    .replace(/^mongodb(\+srv)?:\/\//i, '');
  const slash = rest.indexOf('/');
  if (slash === -1) return '';
  return rest.slice(slash + 1).split('?')[0].trim();
}

/**
 * Guard for Vercel preview deployments. A PR preview that shares the production
 * database can read and overwrite live customer data, so a preview refuses to
 * connect unless MONGODB_URI names a different database. Returns the reason it
 * is blocked, or null when the URI is safe (or this is not a preview).
 */
export function previewDbProblem(uri, vercelEnv = process.env.VERCEL_ENV) {
  if (String(vercelEnv || '').trim().toLowerCase() !== 'preview') return null;
  if (mongoUriDbName(uri).toLowerCase() !== PRODUCTION_DB_NAME) return null;
  return `Refusing to connect to the production database "${PRODUCTION_DB_NAME}" while VERCEL_ENV=preview. Point the Preview MONGODB_URI at a separate database (for example "${PRODUCTION_DB_NAME}-preview").`;
}

/** Lower-cased host of a connection string ('' when there is none). */
export function mongoUriHost(uri) {
  const authority = String(uri || '')
    .trim()
    .replace(/^mongodb(\+srv)?:\/\//i, '')
    .split('/')[0]
    .split('?')[0];
  const hostPort = authority.includes('@') ? authority.slice(authority.lastIndexOf('@') + 1) : authority;
  return (hostPort.startsWith('[') ? hostPort.slice(1, hostPort.indexOf(']')) : hostPort.split(':')[0]).trim().toLowerCase();
}

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
  if (/\s/.test(value)) {
    return 'MONGODB_URI contains a space — remove line breaks/spaces, keep it on a single unquoted line.';
  }

  const authority = rest.split('/')[0].split('?')[0];
  const hasCredentials = authority.includes('@');
  const credentials = hasCredentials ? authority.slice(0, authority.lastIndexOf('@')) : '';
  const host = mongoUriHost(value);

  if (!host) {
    return 'MONGODB_URI has no host. It should look like mongodb+srv://user:password@cluster0.xxxxx.mongodb.net.';
  }

  // Local mongod (npm run db:local) is unauthenticated by design.
  if (!hasCredentials) {
    if (LOCAL_MONGO_HOSTS.has(host)) return null;
    return 'MONGODB_URI has no credentials. It should look like mongodb+srv://user:password@cluster0.xxxxx.mongodb.net.';
  }

  if (!host.includes('.')) {
    return 'MONGODB_URI has no cluster host after the @ (expected something like cluster0.xxxxx.mongodb.net).';
  }

  const separator = credentials.indexOf(':');
  if (separator <= 0) {
    return 'MONGODB_URI has no username before the password (expected mongodb+srv://user:password@cluster…).';
  }
  if (separator === credentials.length - 1) {
    return 'MONGODB_URI has no password after the username (expected mongodb+srv://user:password@cluster…).';
  }

  return null;
}

/** True when the URI points at a database only this machine can reach. */
export function mongoUriIsLocal(uri) {
  return LOCAL_MONGO_HOSTS.has(mongoUriHost(uri));
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
