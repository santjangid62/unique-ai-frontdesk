/**
 * One-command check for Hindi replies on the public demo widget.
 *
 *   npm run verify:hindi
 *
 * Without OPENAI_API_KEY it verifies the deterministic fallback: a grounded
 * answer carries the English-knowledge notice in Hindi mode, and an unknown
 * question gets a Hindi escalation without that notice. With a key it also
 * verifies that the model translates English-only knowledge into Hindi.
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
  return { reply: String(data.reply || ''), escalated: data.escalated === true };
}

const checks = [];
function check(label, passed, detail = '') {
  checks.push({ label, passed: Boolean(passed), detail });
}

function printChecks() {
  for (const item of checks) {
    console.log(`${item.passed ? '✓' : '✗'} ${item.label}${item.passed || !item.detail ? '' : ` — got: ${item.detail}`}`);
  }
}

const PRICE_QUESTION = 'What are your service prices?';
const UNKNOWN_QUESTION = 'Do you repair helicopter engines?';
const DEVANAGARI = /[\u0900-\u097F]/;
const ENGLISH_NOTICE = /अंग्रेज़ी में मौजूद जानकारी/;
const ENGLISH_ESCALATION = /I don't have verified information/;

/** No API key: deterministic fallback replies must still behave per mode. */
async function checkFallback(stamp) {
  const hindi = await ask(PRICE_QUESTION, 'hi', `verify-hindi-${stamp}`);
  const english = await ask(PRICE_QUESTION, 'en', `verify-hindi-${stamp}-en`);
  const hindiUnknown = await ask(UNKNOWN_QUESTION, 'hi', `verify-hindi-unknown-${stamp}`);
  const englishUnknown = await ask(UNKNOWN_QUESTION, 'en', `verify-hindi-unknown-${stamp}-en`);

  check('Hindi grounded answer shows the English-knowledge notice', ENGLISH_NOTICE.test(hindi.reply), hindi.reply);
  check('Hindi grounded answer uses Devanagari', DEVANAGARI.test(hindi.reply), hindi.reply);
  check('Hindi grounded answer keeps the price fact', /499/.test(hindi.reply), hindi.reply);
  check('Hindi grounded answer does not escalate', !hindi.escalated, `escalated=${hindi.escalated}`);
  check(
    'English grounded answer stays English without the Hindi notice',
    !DEVANAGARI.test(english.reply) && !ENGLISH_NOTICE.test(english.reply) && /499/.test(english.reply),
    english.reply,
  );
  check('English grounded answer does not escalate', !english.escalated, `escalated=${english.escalated}`);
  check('Hindi unknown question replies in Hindi', DEVANAGARI.test(hindiUnknown.reply), hindiUnknown.reply);
  check(
    'Hindi unknown question has no English-answer notice',
    !ENGLISH_NOTICE.test(hindiUnknown.reply),
    hindiUnknown.reply,
  );
  check(
    'Hindi unknown question is not the English escalation',
    !ENGLISH_ESCALATION.test(hindiUnknown.reply),
    hindiUnknown.reply,
  );
  check('Hindi unknown question escalates', hindiUnknown.escalated, `escalated=${hindiUnknown.escalated}`);
  check('English unknown question stays English', !DEVANAGARI.test(englishUnknown.reply), englishUnknown.reply);
  check('English unknown question escalates', englishUnknown.escalated, `escalated=${englishUnknown.escalated}`);

  console.log('\nHindi grounded:', hindi.reply);
  console.log('English grounded:', english.reply);
  console.log('Hindi unknown:', hindiUnknown.reply);
  console.log('English unknown:', englishUnknown.reply);
}

/** With a key: English-only knowledge must come back as real Hindi. */
async function checkAiTranslation(stamp) {
  const hindi = await ask(PRICE_QUESTION, 'hi', `verify-hindi-${stamp}`);
  const english = await ask(PRICE_QUESTION, 'en', `verify-hindi-${stamp}-en`);
  const hindiUnknown = await ask(UNKNOWN_QUESTION, 'hi', `verify-hindi-unknown-${stamp}`);
  const englishUnknown = await ask(UNKNOWN_QUESTION, 'en', `verify-hindi-unknown-${stamp}-en`);

  check('Hindi reply is not empty', hindi.reply.trim().length > 0, hindi.reply);
  check('Hindi reply uses Devanagari', DEVANAGARI.test(hindi.reply), hindi.reply);
  check('Hindi reply keeps the price fact', /499/.test(hindi.reply), hindi.reply);
  check('Hindi reply is not the English source', hindi.reply.trim() !== english.reply.trim());
  check('Hindi reply is real translation, not the fallback notice', !ENGLISH_NOTICE.test(hindi.reply), hindi.reply);
  check(
    'English reply stays English',
    !DEVANAGARI.test(english.reply) && /499/.test(english.reply),
    english.reply,
  );
  check('Hindi unknown question replies in Hindi', DEVANAGARI.test(hindiUnknown.reply), hindiUnknown.reply);
  check(
    'Hindi unknown question has no English-answer notice',
    !ENGLISH_NOTICE.test(hindiUnknown.reply),
    hindiUnknown.reply,
  );
  check(
    'Hindi unknown question is not the English escalation',
    !ENGLISH_ESCALATION.test(hindiUnknown.reply),
    hindiUnknown.reply,
  );
  check('English unknown question stays English', !DEVANAGARI.test(englishUnknown.reply), englishUnknown.reply);

  console.log('\nHindi mode:', hindi.reply);
  console.log('English mode:', english.reply);
  console.log('Hindi unknown:', hindiUnknown.reply);
  console.log('English unknown:', englishUnknown.reply);
}

async function main() {
  const health = await request('/api/health');
  const stamp = Date.now();

  if (!health.aiConfigured) {
    console.log('\nOPENAI_API_KEY is not configured — verifying the deterministic Hindi/English fallback.\n');
    await checkFallback(stamp);
    printChecks();
    if (checks.some((item) => !item.passed)) {
      console.error('\nFAILED: the no-key fallback replies are wrong.\n');
      process.exit(1);
    }
    console.log(
      '\nPASS: fallback replies are correct (Hindi notice only on grounded answers, Hindi escalation otherwise).\n' +
        'Real AI translation was NOT tested. Add OPENAI_API_KEY=sk-... (and optionally OPENAI_MODEL=gpt-4o-mini)\n' +
        'to .env, restart the API and rerun `npm run verify:hindi` to test it.\n',
    );
    return;
  }

  console.log('\nOPENAI_API_KEY is configured — verifying real Hindi translation.\n');
  await checkAiTranslation(stamp);
  printChecks();
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
