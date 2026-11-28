/**
 * Offline tests for the live integration checks.
 *
 *   npm run test:integrations
 *
 * The provider APIs are replaced with a fake fetch, so no network or
 * credentials are needed. Each case asserts both the verdict and the message a
 * business owner sees when a key is rejected.
 */
import { createChecker } from './helpers.js';
import { checkIntegrationConnection, missingFields } from '../src/services/integrationCheck.js';

const { check, summary, exitCode } = createChecker();

const fakeFetch = (status, body = {}, capture = {}) => async (url, options) => {
  capture.url = url;
  capture.options = options;
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
};

console.log('\n  live integration checks');

check(
  'WhatsApp needs both phoneNumberId and accessToken',
  missingFields('whatsapp', { phoneNumberId: '123' }).join(',') === 'accessToken',
  missingFields('whatsapp', { phoneNumberId: '123' }).join(','),
);

const missing = await checkIntegrationConnection({ provider: 'whatsapp', config: { phoneNumberId: '123' } });
check('missing fields fail without calling the provider', missing.ok === false && missing.live === false);
check('missing fields say what is missing', /Missing: accessToken/.test(missing.error || ''), missing.error);

const capture = {};
const waOk = await checkIntegrationConnection({
  provider: 'whatsapp',
  config: { phoneNumberId: '123', accessToken: 'token' },
  fetchImpl: fakeFetch(200, { verified_name: 'Unique Computers', display_phone_number: '+91 98295 88572' }, capture),
});
check('WhatsApp 200 is connected', waOk.ok === true && waOk.live === true);
check('WhatsApp check calls the Graph API for the phone number ID', /graph\.facebook\.com\/v19\.0\/123/.test(capture.url || ''), capture.url);
check('WhatsApp check sends the bearer token', capture.options?.headers?.Authorization === 'Bearer token');
check('WhatsApp success names the verified account', /Unique Computers/.test(waOk.detail || ''), waOk.detail);

const waDenied = await checkIntegrationConnection({
  provider: 'whatsapp',
  config: { phoneNumberId: '123', accessToken: 'bad' },
  fetchImpl: fakeFetch(401, { error: { message: 'Invalid OAuth access token' } }),
});
check('WhatsApp 401 is an error', waDenied.ok === false && waDenied.live === true);
check('WhatsApp 401 explains how to fix it', /rejected the WhatsApp access token.*Generate a new permanent token/.test(waDenied.error || ''), waDenied.error);

const twilioDenied = await checkIntegrationConnection({
  provider: 'twilio',
  config: { accountSid: 'AC123', authToken: 'bad', phoneNumber: '+919829588572' },
  fetchImpl: fakeFetch(401, { message: 'Authenticate' }),
});
check('Twilio 401 is an error', twilioDenied.ok === false);
check('Twilio 401 names the Account SID and Auth Token', /Twilio rejected the Account SID or Auth Token/.test(twilioDenied.error || ''), twilioDenied.error);

const openaiCapture = {};
const openaiOk = await checkIntegrationConnection({
  provider: 'openai',
  config: { apiKey: 'sk-test' },
  fetchImpl: fakeFetch(200, { data: [] }, openaiCapture),
});
check('OpenAI 200 is connected', openaiOk.ok === true && openaiOk.live === true);
check('OpenAI check calls the models endpoint', /api\.openai\.com\/v1\/models/.test(openaiCapture.url || ''), openaiCapture.url);
check('OpenAI check sends the business key', openaiCapture.options?.headers?.Authorization === 'Bearer sk-test');

const openaiQuota = await checkIntegrationConnection({
  provider: 'openai',
  config: { apiKey: 'sk-test' },
  fetchImpl: fakeFetch(429, { error: { message: 'You exceeded your current quota' } }),
});
check('OpenAI 429 is reported clearly', openaiQuota.ok === false && /rate-limiting/.test(openaiQuota.error || ''), openaiQuota.error);

const offline = await checkIntegrationConnection({
  provider: 'twilio',
  config: { accountSid: 'AC123', authToken: 'token', phoneNumber: '+919829588572' },
  fetchImpl: async () => {
    const error = new Error('getaddrinfo ENOTFOUND');
    error.name = 'TypeError';
    throw error;
  },
});
check('network failure is an error', offline.ok === false && offline.live === true);
check('network failure names the provider', /Could not reach Twilio/.test(offline.error || ''), offline.error);

const email = await checkIntegrationConnection({
  provider: 'email',
  config: { fromAddress: 'hello@example.com' },
  fetchImpl: async () => {
    throw new Error('email must not call a provider API');
  },
});
check('providers without a read endpoint only check fields', email.ok === true && email.live === false);

console.log(summary());
process.exit(exitCode());
