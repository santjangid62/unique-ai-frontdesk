/**
 * One-command check for real Hindi replies once OPENAI_API_KEY is configured.
 *
 *   npm run verify:hindi
 *
 * Uses the public demo widget, whose knowledge is English-only, and asks the
 * same question in Hindi and English mode. A pass means the model translated
 * the grounded answer instead of returning the English source.
 */
const baseUrl = (process.env.API_URL || 'http://localhost:5000').replace(/\/$/, '');

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${response.status} ${payload?.error?.message || response.statusText}`);
  }
  return payload?.data ?? payload;
}

async function ask(message, language, visitorId) {
  const data = await request('/api/public/widget/demo/chat', {
    method: 'POST',
    body: JSON.stringify({ message, visitorId, language }),
  });
  return String(data.reply || '');
}

const checks = [];
function check(label, passed, detail = '') {
  checks.push({ label, passed: Boolean(passed), detail });
}

async function main() {
  const health = await request('/api/health');
  if (!health.aiConfigured) {
    console.error('\n✗ OPENAI_API_KEY is not configured, so real Hindi translation cannot be tested.');
    console.error('  1. Add OPENAI_API_KEY=sk-... (and optionally OPENAI_MODEL=gpt-4o-mini) to .env');
    console.error('  2. Restart the API so it reloads .env');
    console.error('  3. Run: npm run verify:hindi\n');
    process.exit(1);
  }

  const stamp = Date.now();
  const question = 'What are your service prices?';
  const hindi = await ask(question, 'hi', `verify-hindi-${stamp}`);
  const english = await ask(question, 'en', `verify-hindi-${stamp}-en`);

  check('Hindi reply is not empty', hindi.trim().length > 0, hindi);
  check('Hindi reply uses Devanagari', /[\u0900-\u097F]/.test(hindi), hindi);
  check('Hindi reply keeps the price fact', /499/.test(hindi), hindi);
  check('Hindi reply is not the English source', hindi.trim() !== english.trim());
  check('English reply stays English', !/[\u0900-\u097F]/.test(english) && /499/.test(english), english);

  console.log('\nHindi mode:', hindi);
  console.log('English mode:', english, '\n');
  for (const item of checks) {
    console.log(`${item.passed ? '✓' : '✗'} ${item.label}${item.passed || !item.detail ? '' : ` — got: ${item.detail}`}`);
  }
  if (checks.some((item) => !item.passed)) {
    console.error('\nFAILED: Hindi mode did not produce a translated grounded answer.\n');
    process.exit(1);
  }
  console.log('\nPASS: English-only knowledge was answered in Hindi by the AI.\n');
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}`);
  console.error(`  Is the API running at ${baseUrl}?\n`);
  process.exit(1);
});
