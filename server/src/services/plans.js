import Plan from '../models/Plan.js';

export const DEFAULT_PLANS = [
  {
    code: 'starter',
    name: 'Starter',
    description: 'For single-branch institutes getting started with AI reception.',
    priceMonthly: 1499,
    priceYearly: 14990,
    sortOrder: 1,
    limits: {
      agents: 1,
      staff: 3,
      knowledgeEntries: 100,
      aiMessagesPerMonth: 1500,
      voiceMinutesPerMonth: 0,
      whatsappMessagesPerMonth: 0,
    },
    features: ['Website AI chatbot', 'Knowledge base', 'Lead capture', 'Appointment booking', 'Email support'],
  },
  {
    code: 'growth',
    name: 'Growth',
    description: 'Adds WhatsApp automation and more staff seats.',
    priceMonthly: 3499,
    priceYearly: 34990,
    sortOrder: 2,
    limits: {
      agents: 2,
      staff: 8,
      knowledgeEntries: 500,
      aiMessagesPerMonth: 6000,
      voiceMinutesPerMonth: 150,
      whatsappMessagesPerMonth: 2000,
    },
    features: [
      'Everything in Starter',
      'WhatsApp AI assistant',
      'Human handoff & assignment',
      'Reports & analytics',
      'Priority support',
    ],
  },
  {
    code: 'professional',
    name: 'Professional',
    description: 'Voice receptionist plus advanced automation for growing institutes.',
    priceMonthly: 6999,
    priceYearly: 69990,
    sortOrder: 3,
    limits: {
      agents: 4,
      staff: 20,
      knowledgeEntries: 2000,
      aiMessagesPerMonth: 20000,
      voiceMinutesPerMonth: 600,
      whatsappMessagesPerMonth: 8000,
    },
    features: [
      'Everything in Growth',
      'AI voice receptionist',
      'Call transcripts & summaries',
      'Automation rules',
      'Dedicated onboarding',
    ],
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    description: 'Multi-branch operations with custom limits and SLA.',
    priceMonthly: 14999,
    priceYearly: 149990,
    sortOrder: 4,
    limits: {
      agents: 20,
      staff: 100,
      knowledgeEntries: 10000,
      aiMessagesPerMonth: 100000,
      voiceMinutesPerMonth: 5000,
      whatsappMessagesPerMonth: 50000,
    },
    features: [
      'Everything in Professional',
      'Custom integrations',
      'SLA & dedicated manager',
      'Custom AI instructions',
      'Usage-based billing',
    ],
  },
];

/** Idempotently seeds the plan catalog. */
export async function ensureDefaultPlans() {
  await Promise.all(
    DEFAULT_PLANS.map((plan) =>
      Plan.updateOne({ code: plan.code }, { $setOnInsert: plan }, { upsert: true }),
    ),
  );
}

export default DEFAULT_PLANS;
