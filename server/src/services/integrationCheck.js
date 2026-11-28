import { env } from '../config/env.js';

const TIMEOUT_MS = 10000;

export const REQUIRED_FIELDS = {
  twilio: ['accountSid', 'authToken', 'phoneNumber'],
  whatsapp: ['phoneNumberId', 'accessToken'],
  openai: ['apiKey'],
  email: ['fromAddress'],
  sms: ['senderId'],
  n8n: ['webhookUrl'],
};

const PROVIDER_NAMES = {
  whatsapp: 'Meta (WhatsApp Cloud API)',
  twilio: 'Twilio',
  openai: 'OpenAI',
};

/** Required fields still empty after applying the documented fallbacks. */
export function missingFields(provider, config = {}, externalId = '') {
  const required = REQUIRED_FIELDS[provider] || [];
  return required.filter((key) => {
    // A tenant OpenAI key is optional when the platform key is configured.
    if (provider === 'openai' && key === 'apiKey' && env.openaiKey) return false;
    const value = config?.[key] || (key === 'phoneNumberId' ? externalId : '');
    return !value;
  });
}

function providerMessage(provider, status, body, text) {
  const name = PROVIDER_NAMES[provider] || provider;
  const apiMessage =
    body?.error?.message || body?.message || (typeof body?.error === 'string' ? body.error : '') || '';

  if (status === 401 || status === 403) {
    if (provider === 'whatsapp') {
      return `Meta rejected the WhatsApp access token (HTTP ${status}). Generate a new permanent token in Meta → WhatsApp → API Setup and save it again.`;
    }
    if (provider === 'twilio') {
      return `Twilio rejected the Account SID or Auth Token (HTTP ${status}). Check both values in the Twilio Console and save them again.`;
    }
    return `OpenAI rejected the API key (HTTP ${status}). Create a new key under OpenAI → API keys and save it again.`;
  }

  if (status === 404) {
    if (provider === 'whatsapp') {
      return 'Meta could not find that Phone number ID (HTTP 404). Copy it again from Meta → WhatsApp → API Setup.';
    }
    if (provider === 'twilio') {
      return 'Twilio could not find that account (HTTP 404). Check the Account SID — it starts with AC.';
    }
  }

  if (status === 429) {
    return `${name} accepted the request but is rate-limiting it (HTTP 429). Check the account's quota or try again shortly.`;
  }

  const suffix = apiMessage ? ` ${apiMessage}` : text ? ` ${text.slice(0, 200)}` : '';
  return `${name} returned HTTP ${status}.${suffix}`.trim();
}

async function request(url, options, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return { response, body, text };
  } finally {
    clearTimeout(timer);
  }
}

function networkError(provider, error) {
  const name = PROVIDER_NAMES[provider] || provider;
  if (error?.name === 'AbortError') {
    return `Timed out after ${TIMEOUT_MS / 1000}s while reaching ${name}. Check the server's outbound network and try again.`;
  }
  return `Could not reach ${name}: ${error?.message || 'network error'}.`;
}

async function checkWhatsApp(config, externalId, fetchImpl) {
  const phoneNumberId = config.phoneNumberId || externalId;
  const token = config.accessToken;
  const { response, body, text } = await request(
    `https://graph.facebook.com/v19.0/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`,
    { headers: { Authorization: `Bearer ${token}` } },
    fetchImpl,
  );
  if (response.ok) {
    const name = body?.verified_name || body?.display_phone_number || phoneNumberId;
    return { ok: true, detail: `Verified with Meta as ${name}.` };
  }
  return { ok: false, error: providerMessage('whatsapp', response.status, body, text) };
}

async function checkTwilio(config, fetchImpl) {
  const { accountSid, authToken } = config;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const { response, body, text } = await request(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}.json`,
    { headers: { Authorization: `Basic ${auth}` } },
    fetchImpl,
  );
  if (response.ok) {
    const name = body?.friendly_name || body?.sid || accountSid;
    return { ok: true, detail: `Verified with Twilio as ${name}.` };
  }
  return { ok: false, error: providerMessage('twilio', response.status, body, text) };
}

async function checkOpenAI(config, fetchImpl) {
  const key = config.apiKey || env.openaiKey;
  const { response, body, text } = await request(
    'https://api.openai.com/v1/models',
    { headers: { Authorization: `Bearer ${key}` } },
    fetchImpl,
  );
  if (response.ok) {
    return { ok: true, detail: config.apiKey ? 'Verified with OpenAI using the business key.' : 'Verified with OpenAI using the platform key.' };
  }
  return { ok: false, error: providerMessage('openai', response.status, body, text) };
}

/**
 * Verifies an integration against the provider's own API, so "connected" means
 * the credentials work rather than that the fields are filled. Providers
 * without a cheap read endpoint (email, SMS, n8n) only get the field check.
 */
export async function checkIntegrationConnection({ provider, config = {}, externalId = '', fetchImpl = fetch }) {
  const missing = missingFields(provider, config, externalId);
  if (missing.length) {
    return { ok: false, live: false, missing, error: `Missing: ${missing.join(', ')}` };
  }

  try {
    if (provider === 'whatsapp') return { ...(await checkWhatsApp(config, externalId, fetchImpl)), live: true, missing };
    if (provider === 'twilio') return { ...(await checkTwilio(config, fetchImpl)), live: true, missing };
    if (provider === 'openai') return { ...(await checkOpenAI(config, fetchImpl)), live: true, missing };
    return { ok: true, live: false, missing, detail: 'Required fields are saved.' };
  } catch (error) {
    return { ok: false, live: true, missing, error: networkError(provider, error) };
  }
}

export default checkIntegrationConnection;
