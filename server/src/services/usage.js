import Subscription from '../models/Subscription.js';
import UsageLog from '../models/UsageLog.js';

const USAGE_FIELD = {
  ai: 'usage.aiMessages',
  voice: 'usage.voiceMinutes',
  whatsapp: 'usage.whatsappMessages',
  storage: 'usage.knowledgeEntries',
};

/** Records provider consumption and increments the tenant subscription counters. */
export async function recordUsage(tenantId, kind, quantity = 1, meta = undefined) {
  try {
    await UsageLog.create({ tenantId, kind, quantity, meta });
    const field = USAGE_FIELD[kind];
    if (field) {
      await Subscription.updateOne({ tenantId }, { $inc: { [field]: quantity } });
    }
  } catch (error) {
    console.error('[usage] failed to record', error.message);
  }
}

/** Returns the tenant plan limits merged with current usage. */
export async function getUsageSummary(tenantId, plan) {
  const subscription = await Subscription.findOne({ tenantId }).lean();
  const usage = subscription?.usage || {};
  const limits = plan?.limits || {};
  return {
    planCode: subscription?.planCode || 'starter',
    status: subscription?.status || 'trialing',
    currentPeriodEnd: subscription?.currentPeriodEnd || null,
    usage: {
      aiMessages: usage.aiMessages || 0,
      voiceMinutes: usage.voiceMinutes || 0,
      whatsappMessages: usage.whatsappMessages || 0,
      knowledgeEntries: usage.knowledgeEntries || 0,
      staff: usage.staff || 0,
    },
    limits: {
      aiMessagesPerMonth: limits.aiMessagesPerMonth ?? 1000,
      voiceMinutesPerMonth: limits.voiceMinutesPerMonth ?? 0,
      whatsappMessagesPerMonth: limits.whatsappMessagesPerMonth ?? 0,
      knowledgeEntries: limits.knowledgeEntries ?? 100,
      staff: limits.staff ?? 3,
      agents: limits.agents ?? 1,
    },
  };
}
