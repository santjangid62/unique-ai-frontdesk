import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import AiAgent from '../models/AiAgent.js';
import BusinessProfile from '../models/BusinessProfile.js';
import Tenant from '../models/Tenant.js';
import { retrieveKnowledge } from './retrieval.js';
import { generateReply } from './ai.js';
import { ensureCustomer, normalizePhone, upsertLead } from './crm.js';
import { bookAppointment } from './booking.js';
import { recordUsage } from './usage.js';
import { notifyTenantTeam } from './notifications.js';
import { parseNaturalSlot, parseSlot } from '../utils/date.js';

async function resolveAgent(tenantId, conversation) {
  if (conversation?.agentId) {
    const agent = await AiAgent.findOne({ _id: conversation.agentId, tenantId }).lean();
    if (agent) return agent;
  }
  const fallback =
    (await AiAgent.findOne({ tenantId, isDefault: true, isActive: true }).lean()) ||
    (await AiAgent.findOne({ tenantId, isActive: true }).sort({ createdAt: 1 }).lean());
  return fallback;
}

export async function getOrCreateConversation({
  tenantId,
  channel = 'website',
  visitorId = '',
  customerName = '',
  customerPhone = '',
  agentId = null,
}) {
  if (visitorId) {
    const existing = await Conversation.findOne({
      tenantId,
      visitorId,
      channel,
      status: { $ne: 'closed' },
    }).sort({ lastMessageAt: -1 });
    if (existing) return existing;
  } else if (customerPhone) {
    const existing = await Conversation.findOne({
      tenantId,
      customerPhone,
      channel,
      status: { $ne: 'closed' },
    }).sort({ lastMessageAt: -1 });
    if (existing) return existing;
  }

  return Conversation.create({
    tenantId,
    channel,
    visitorId,
    customerName: customerName || (channel === 'website' ? 'Website visitor' : 'Customer'),
    customerPhone: customerPhone || '',
    agentId,
    status: 'open',
    lastMessageAt: new Date(),
  });
}

async function escalate(conversation, tenantId, reason, channel) {
  conversation.status = 'handoff';
  conversation.aiEnabled = false;
  conversation.escalationReason = reason || 'AI requested escalation';
  conversation.escalatedAt = conversation.escalatedAt || new Date();
  await conversation.save();
  await notifyTenantTeam(tenantId, {
    type: 'handoff',
    title: 'Conversation needs a human',
    body: `${conversation.customerName}: ${conversation.escalationReason} (${channel})`,
    link: '/app/conversations',
  });
}

/**
 * Handles one inbound customer message end-to-end:
 * store -> ground -> reply -> capture lead -> optional booking -> handoff.
 */
export async function processIncomingMessage({ tenantId, conversation, text, channel = 'website', authorName = '' }) {
  const content = String(text || '').trim().slice(0, 4000);
  if (!content) return { conversation, aiMessage: null, skipped: true };

  const customerMessage = await Message.create({
    tenantId,
    conversationId: conversation._id,
    role: 'customer',
    content,
    authorName: authorName || conversation.customerName,
  });

  conversation.lastMessageAt = new Date();
  conversation.lastMessagePreview = content.slice(0, 160);
  conversation.messageCount = (conversation.messageCount || 0) + 1;
  conversation.unreadForStaff = (conversation.unreadForStaff || 0) + 1;
  await conversation.save();

  if (!conversation.aiEnabled) {
    return { conversation, aiMessage: null, customerMessage, handoff: true };
  }

  const tenant = await Tenant.findById(tenantId).lean();
  const agent = await resolveAgent(tenantId, conversation);
  const profile = await BusinessProfile.findOne({ tenantId }).lean();

  const history = await Message.find({ tenantId, conversationId: conversation._id })
    .sort({ createdAt: 1 })
    .limit(10)
    .lean();

  const knowledge = await retrieveKnowledge(tenantId, content);
  const result = await generateReply({
    agent,
    profile,
    knowledge,
    history: history.filter((message) => String(message._id) !== String(customerMessage._id)),
    message: content,
    channel,
  });

  const updates = {};
  let leadId = null;
  let customerId = conversation.customerId || null;

  const leadInfo = result.lead || {};
  const extractedPhone = normalizePhone(leadInfo.phone || conversation.customerPhone);
  const customerName = leadInfo.name || conversation.customerName;

  if (customerName && customerName !== 'Website visitor') {
    updates.customerName = customerName;
  }
  if (extractedPhone) updates.customerPhone = extractedPhone;

  const shouldCapture = Boolean(
    leadInfo.name || leadInfo.phone || leadInfo.email || leadInfo.course || extractedPhone,
  );
  if (shouldCapture) {
    try {
      const customer = await ensureCustomer({
        tenantId,
        name: customerName,
        phone: extractedPhone,
        email: leadInfo.email || '',
        course: leadInfo.course || '',
      });
      if (customer) {
        customerId = customer._id;
        updates.customerId = customer._id;
      }
      const { lead } = await upsertLead({
        tenantId,
        data: {
          name: customerName,
          phone: extractedPhone,
          email: leadInfo.email || '',
          course: leadInfo.course || '',
          note: `Captured by AI on ${channel}`,
        },
        source: channel === 'website' ? 'website' : channel,
      });
      if (lead) {
        leadId = lead._id;
        await Conversation.updateOne({ _id: conversation._id }, { $set: { customerId } });
      }
    } catch (error) {
      console.error('[chat] lead capture failed', error.message);
    }
  }

  let bookingNote = '';
  const appointmentInfo = result.appointment || {};
  const requestedDate = appointmentInfo.requested_date || '';
  const requestedTime = appointmentInfo.requested_time || '';
  let slot = requestedDate ? parseSlot(requestedDate, requestedTime || '10:00') : null;
  if (!slot) slot = parseNaturalSlot(content);

  if (slot && slot.getTime() > Date.now()) {
    try {
      const appointment = await bookAppointment({
        tenantId,
        channel,
        payload: {
          customerName: customerName || 'Website visitor',
          customerPhone: extractedPhone,
          leadId,
          customerId,
          course: appointmentInfo.course || leadInfo.course || '',
          type: 'demo',
          startAt: slot,
          durationMinutes: 45,
        },
      });
      bookingNote = ` Your demo class is confirmed for ${appointment.startAt.toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })}.`;
    } catch (error) {
      if (error.code === 'SLOT_UNAVAILABLE') {
        const suggestion = error.details?.suggestion?.startAt;
        bookingNote = suggestion
          ? ` That slot is already booked. The nearest free slot is ${new Date(suggestion).toLocaleString('en-IN', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })} — shall I book that instead?`
          : ' That slot is unavailable. Could you share another preferred date and time?';
      } else {
        console.error('[chat] booking failed', error.message);
      }
    }
  }

  const finalReply = `${result.reply}${bookingNote}`.trim();

  const aiMessage = await Message.create({
    tenantId,
    conversationId: conversation._id,
    role: 'ai',
    content: finalReply,
    authorName: agent?.name || 'AI Frontdesk',
    sources: result.sources || [],
    meta: {
      intent: result.intent,
      confidence: result.confidence,
      mode: result.mode,
      tokens: result.tokens || 0,
    },
  });

  updates.lastMessageAt = new Date();
  updates.lastMessagePreview = finalReply.slice(0, 160);
  updates.messageCount = (conversation.messageCount || 0) + 1;

  if (result.escalate || conversation.status === 'handoff') {
    await Conversation.updateOne(
      { _id: conversation._id },
      {
        $set: {
          ...updates,
          status: 'handoff',
          aiEnabled: false,
          escalationReason: result.escalationReason || 'AI could not resolve the query',
          escalatedAt: new Date(),
        },
      },
    );
    await notifyTenantTeam(tenantId, {
      type: 'handoff',
      title: 'Conversation escalated to staff',
      body: `${customerName}: ${result.escalationReason || 'AI escalation'}`,
      link: '/app/conversations',
    });
  } else {
    await Conversation.updateOne({ _id: conversation._id }, { $set: updates });
  }

  await recordUsage(tenantId, 'ai', 1, {
    conversationId: String(conversation._id),
    channel,
    tenant: tenant?.slug,
  });

  const fresh = await Conversation.findById(conversation._id);
  return { conversation: fresh || conversation, aiMessage, customerMessage, leadId, result };
}

/** Staff reply from the dashboard: pauses AI and records the human message. */
export async function staffReply({ tenantId, conversation, text, user }) {
  const message = await Message.create({
    tenantId,
    conversationId: conversation._id,
    role: 'staff',
    content: String(text).slice(0, 4000),
    authorName: user?.name || 'Staff',
  });
  conversation.lastMessageAt = new Date();
  conversation.lastMessagePreview = message.content.slice(0, 160);
  conversation.messageCount = (conversation.messageCount || 0) + 1;
  conversation.unreadForStaff = 0;
  conversation.aiEnabled = false;
  if (conversation.status === 'open' || conversation.status === 'pending') {
    conversation.status = 'handoff';
  }
  if (!conversation.assignedTo) conversation.assignedTo = user?.id || null;
  await conversation.save();
  return message;
}
