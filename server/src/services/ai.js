import { env } from '../config/env.js';
import { formatKnowledge } from './retrieval.js';

const SYSTEM_PROMPT = `You are the AI front desk receptionist for a business. You speak on behalf of the business to customers.

RULES (must always follow):
1. Answer only from the VERIFIED BUSINESS CONTEXT below. Never invent fees, course names, batch timings, availability, discounts, policies or contact details.
2. If the context does not contain the answer, set "escalate": true and politely say you will connect the customer with the team. Never guess.
3. Keep replies short (2-4 sentences), warm, and useful. One clear next step per reply.
4. You may collect the customer's name, phone, email and interested course. Only ask for a phone number when it is genuinely missing.
5. You may offer a demo class / appointment. NEVER say an appointment is confirmed until the system tells you it was saved; ask for a preferred date and time instead.
6. If the customer is angry, asks for a human, or the query is complex, set "escalate": true with a short reason.
7. On voice calls, identify yourself as an automated assistant in the first turn.
8. Reply in the visitor's selected interface language. When Hindi is selected, reply fully in Hindi (Devanagari) even if the verified context is written in English: translate the facts faithfully and keep names, numbers, prices, dates and contact details unchanged. Otherwise mirror the customer's language.

Return ONLY valid JSON with this shape:
{
  "reply": "customer-facing message",
  "intent": "course_enquiry|fee_enquiry|demo_booking|contact|general|complaint|human_request",
  "escalate": false,
  "escalation_reason": "",
  "confidence": 0.0,
  "lead": { "name": "", "phone": "", "email": "", "course": "" },
  "appointment": { "requested_date": "YYYY-MM-DD or empty", "requested_time": "HH:mm or empty", "course": "" }
}`;

function profileFacts(profile, agent) {
  if (!profile) return 'No business profile configured.';
  const courses = (profile.coaching?.courses || [])
    .filter((course) => course.isActive !== false)
    .map(
      (course) =>
        `- ${course.name} | category: ${course.category || 'n/a'} | fee: ${course.fee || 'not published'} | duration: ${
          course.duration || 'n/a'
        } | mode: ${course.mode} | batches: ${(course.batchTimings || []).join(', ') || 'n/a'}`,
    )
    .join('\n');

  return [
    `Business: ${profile.name} (${profile.industry})`,
    profile.description ? `About: ${profile.description}` : '',
    `Phone: ${profile.phone || 'n/a'} | Email: ${profile.email || 'n/a'}`,
    `Address: ${[profile.address, profile.city, profile.state, profile.country].filter(Boolean).join(', ') || 'n/a'}`,
    `Working days: ${(profile.workingDays || []).join(', ') || 'n/a'} | Hours: ${profile.openingTime}-${profile.closingTime}`,
    `Languages: ${(profile.languages || []).join(', ')}`,
    profile.coaching?.demoAvailable ? 'Trial / demo: available (subject to slot availability)' : 'Trial / demo: not confirmed',
    profile.coaching?.admissionProcess ? `Next steps after enquiry: ${profile.coaching.admissionProcess}` : '',
    profile.coaching?.placementInfo ? `Additional support: ${profile.coaching.placementInfo}` : '',
    courses ? `Courses:\n${courses}` : '',
    agent?.instructions ? `Agent instructions from the business owner: ${agent.instructions}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function safeParseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function translationUnavailableReply({ channel, reason }) {
  const intro = channel === 'voice' ? 'यह फ्रंट डेस्क का स्वचालित सहायक है। ' : '';
  const notConfigured = /not configured|key/i.test(reason || '');
  const message = notConfigured
    ? 'हिन्दी में जवाब देने के लिए AI अनुवाद अभी कॉन्फ़िगर नहीं है। कृपया अपना सवाल अंग्रेज़ी में पूछें।'
    : 'हिन्दी में जवाब देने के लिए AI अनुवाद अभी उपलब्ध नहीं है। कृपया थोड़ी देर बाद फिर कोशिश करें या सवाल अंग्रेज़ी में पूछें।';
  return {
    reply: `${intro}${message}`,
    intent: 'general',
    escalate: false,
    escalationReason: '',
    confidence: 0.2,
    sources: [],
    mode: 'fallback',
    lead: {},
    appointment: {},
    note: reason,
  };
}

function fallbackReply({ knowledge, agent, channel, message, reason, language = 'en' }) {
  // Never answer a Hindi visitor in English because a translation was not
  // possible; say clearly that AI translation is not configured instead.
  if (language === 'hi') return translationUnavailableReply({ channel, reason });

  const best = knowledge?.[0];
  const intro = channel === 'voice' ? 'This is an automated assistant from the front desk. ' : '';

  if (best && best.score >= 3) {
    return {
      reply: `${intro}${best.content.trim()}`,
      intent: 'general',
      escalate: false,
      escalationReason: '',
      confidence: 0.55,
      sources: [{ title: best.title, id: best.id }],
      mode: 'fallback',
      lead: {},
      appointment: {},
      note: reason,
    };
  }

  return {
    reply: `${intro}I don't have verified information about that yet, so I'd rather not guess. Let me connect you with our team who can help you properly — could you share your name and phone number?`,
    intent: 'general',
    escalate: true,
    escalationReason: reason || 'No grounded knowledge available',
    confidence: 0.2,
    sources: best ? [{ title: best.title, id: best.id }] : [],
    mode: 'fallback',
    lead: {},
    appointment: {},
    note: reason,
  };
}

/**
 * Calls the model with grounded context. When no API key is configured (or the
 * provider fails) a deterministic grounded fallback answers instead, so the
 * product never fabricates business facts.
 */
export async function generateReply({ agent, profile, knowledge, history = [], message, channel = 'website', language = 'en' }) {
  if (!env.openaiKey) {
    return fallbackReply({ knowledge, agent, channel, message, language, reason: 'AI key not configured' });
  }

  const context = [
    'VERIFIED BUSINESS CONTEXT:',
    profileFacts(profile, agent),
    '',
    'VERIFIED KNOWLEDGE BASE:',
    formatKnowledge(knowledge),
  ].join('\n');

  const messages = [
    {
      role: 'system',
      content: `${SYSTEM_PROMPT}\n\n${
        language === 'hi'
          ? 'INTERFACE LANGUAGE: Hindi (Devanagari). The visitor chose Hindi in the chat header. Write the entire reply in Hindi, even when the context above is English. Translate facts faithfully; never add facts.\n\n'
          : ''
      }AGENT: ${agent?.name || 'Front desk AI'} | Tone: ${agent?.tone || 'friendly'} | Language: ${agent?.language || 'English'}`,
    },
    { role: 'system', content: context },
    ...history.slice(-8).map((entry) => ({
      role: entry.role === 'customer' ? 'user' : 'assistant',
      content: entry.content,
    })),
    { role: 'user', content: message },
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.openaiModel,
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: 'json_object' },
        messages,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('[ai] provider error', response.status, detail.slice(0, 300));
      return fallbackReply({ knowledge, agent, channel, message, language, reason: 'AI provider unavailable' });
    }

    const payload = await response.json();
    const parsed = safeParseJson(payload?.choices?.[0]?.message?.content);
    if (!parsed?.reply) {
      return fallbackReply({ knowledge, agent, channel, message, language, reason: 'AI response was not usable' });
    }

    const reply = String(parsed.reply).slice(0, 2000);
    return {
      reply,
      intent: parsed.intent || 'general',
      escalate: Boolean(parsed.escalate),
      escalationReason: parsed.escalation_reason || '',
      confidence: Number(parsed.confidence ?? 0.7),
      sources: knowledge.slice(0, 3).map((item) => ({ title: item.title, id: item.id })),
      mode: 'openai',
      lead: parsed.lead || {},
      appointment: parsed.appointment || {},
      tokens: payload?.usage?.total_tokens || 0,
    };
  } catch (error) {
    console.error('[ai] request failed', error.message);
    return fallbackReply({ knowledge, agent, channel, message, language, reason: 'AI request failed' });
  } finally {
    clearTimeout(timeout);
  }
}

export default generateReply;
