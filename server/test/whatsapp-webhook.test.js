/**
 * Offline tests for per-tenant WhatsApp webhook verification.
 *
 *   npm run test:whatsapp
 *
 * No network or database is needed: the helpers take the integration row as an
 * argument, so we can prove which secret verifies a payload.
 */
import crypto from 'node:crypto';
import { createChecker } from './helpers.js';
import {
  phoneNumberIdFromPayload,
  signatureMatches,
  tokenMatches,
  webhookAppSecret,
} from '../src/services/whatsappWebhook.js';

const { check, summary, exitCode } = createChecker();

const sign = (body, secret) => `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;

console.log('\n  per-tenant WhatsApp webhook');

const payload = {
  entry: [
    {
      changes: [
        { value: { metadata: { phone_number_id: '10987654321' } } },
      ],
    },
  ],
};
check('reads the phone number ID from the webhook payload', phoneNumberIdFromPayload(payload) === '10987654321');
check('returns an empty ID for unrelated payloads', phoneNumberIdFromPayload({ entry: [] }) === '');

check(
  'tenant app secret is preferred over the platform secret',
  webhookAppSecret({ config: { appSecret: 'tenant-secret' } }) === 'tenant-secret',
);
check('integration without a secret falls back to the platform secret', webhookAppSecret({ config: {} }) === '');
check('missing integration falls back to the platform secret', webhookAppSecret(null) === '');

check('matching tokens pass', tokenMatches('abc123', 'abc123') === true);
check('different tokens fail', tokenMatches('abc123', 'abc124') === false);
check('different length tokens fail', tokenMatches('abc123', 'abc1234') === false);
check('empty tokens never match', tokenMatches('', '') === false);

const body = Buffer.from(JSON.stringify({ hello: 'world' }));
check('signature from the tenant secret verifies', signatureMatches(body, sign(body, 'tenant-secret'), 'tenant-secret') === true);
check(
  'signature from another tenant secret is rejected',
  signatureMatches(body, sign(body, 'other-secret'), 'tenant-secret') === false,
);
check('missing signature is rejected', signatureMatches(body, '', 'tenant-secret') === false);
check('missing secret is rejected', signatureMatches(body, sign(body, 'tenant-secret'), '') === false);

console.log(summary());
process.exit(exitCode());
