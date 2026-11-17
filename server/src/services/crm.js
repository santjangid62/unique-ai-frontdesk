import Lead from '../models/Lead.js';
import Customer from '../models/Customer.js';
import { notifyTenantAdmins } from './notifications.js';
import { audit } from '../utils/audit.js';

const normalizePhone = (phone) => String(phone || '').replace(/[^\d+]/g, '').slice(0, 20);
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

/**
 * Creates or merges a lead using tenant-scoped phone dedupe. Returns the lead
 * plus whether it was an existing record.
 */
export async function upsertLead({ tenantId, data, source = 'manual', actor = null, req = null, notify = true }) {
  const phone = normalizePhone(data.phone);
  const email = normalizeEmail(data.email);
  const name = String(data.name || '').trim() || (phone ? `Lead ${phone.slice(-4)}` : 'Unnamed lead');

  let lead = phone ? await Lead.findOne({ tenantId, phone, isDeleted: false }) : null;

  if (lead) {
    const merged = {};
    if (!lead.name || lead.name.startsWith('Lead ')) merged.name = name;
    if (!lead.email && email) merged.email = email;
    if (!lead.course && data.course) merged.course = data.course;
    if (data.followUpDate) merged.followUpDate = data.followUpDate;
    if (Object.keys(merged).length) {
      Object.assign(lead, merged);
      lead.notes.push({
        text: `Repeat enquiry via ${source}`,
        byName: 'System',
      });
      await lead.save();
    }
    return { lead, duplicate: true };
  }

  lead = await Lead.create({
    tenantId,
    name,
    phone,
    email,
    course: data.course || '',
    source,
    status: data.status || 'new',
    followUpDate: data.followUpDate || null,
    notes: data.note
      ? [{ text: data.note, byName: actor?.name || 'System', by: actor?.id || null }]
      : [],
    assigneeId: data.assigneeId || null,
  });

  if (notify) {
    await notifyTenantAdmins(tenantId, {
      type: 'lead',
      title: 'New lead captured',
      body: `${lead.name}${lead.course ? ` is interested in ${lead.course}` : ''} (via ${source}).`,
      link: '/app/leads',
    });
  }
  if (req) {
    audit(req, {
      action: 'lead.created',
      entity: 'Lead',
      entityId: lead._id,
      tenantId,
      meta: { source },
    });
  }
  return { lead, duplicate: false };
}

/** Links a chat/call participant to the tenant customer directory. */
export async function ensureCustomer({ tenantId, name, phone = '', email = '', course = '' }) {
  const normalizedPhone = normalizePhone(phone);
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedPhone && !normalizedEmail) return null;

  const query = normalizedPhone
    ? { tenantId, phone: normalizedPhone, isDeleted: false }
    : { tenantId, email: normalizedEmail, isDeleted: false };

  let customer = await Customer.findOne(query);
  if (customer) {
    const courses = new Set([...(customer.interestedCourses || []), ...(course ? [course] : [])]);
    customer.interestedCourses = [...courses];
    if (!customer.name && name) customer.name = name;
    if (!customer.email && normalizedEmail) customer.email = normalizedEmail;
    customer.lastInteractionAt = new Date();
    await customer.save();
    return customer;
  }

  try {
    customer = await Customer.create({
      tenantId,
      name: String(name || '').trim() || `Customer ${normalizedPhone.slice(-4)}`,
      phone: normalizedPhone,
      email: normalizedEmail,
      interestedCourses: course ? [course] : [],
      lastInteractionAt: new Date(),
    });
  } catch (error) {
    if (error.code === 11000) {
      return Customer.findOne(query);
    }
    throw error;
  }
  return customer;
}

export { normalizePhone, normalizeEmail };
