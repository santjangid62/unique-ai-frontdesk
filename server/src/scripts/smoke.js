/**
 * API smoke check. Requires a running server (npm start or npm run dev) that
 * has been seeded. Usage: node server/src/scripts/smoke.js
 *
 * The signup checks create a throwaway business; it is removed again at the end
 * (see scripts/smoke-cleanup.js) when MONGODB_URI is available.
 */
import 'dotenv/config';
import { cleanupSmokeBusiness } from './smoke-cleanup.js';

const BASE = process.env.SMOKE_BASE_URL || process.env.SMOKE_BASE || 'http://localhost:5000';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`);
  }
}

async function request(path, { method = 'GET', token, body, headers = {} } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let payload = null;
  const text = await response.text();
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text.slice(0, 200) };
  }
  return { status: response.status, payload };
}

const DAY_CODES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad2 = (value) => String(value).padStart(2, '0');
const localDate = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/**
 * Picks the first bookable slot in the next 10 days from the tenant's own
 * availability, so the check never depends on today's weekday or business hours.
 */
async function firstOpenSlot(token) {
  for (let offset = 1; offset <= 10; offset += 1) {
    const day = new Date();
    day.setDate(day.getDate() + offset);
    const { status, payload } = await request(`/api/appointments/availability?date=${localDate(day)}`, { token });
    if (status !== 200) continue;

    const data = payload?.data || {};
    if (data.workingDays?.length && !data.workingDays.includes(DAY_CODES[day.getDay()])) continue;

    const slot = (data.slots || []).find((item) => item.available);
    if (slot) return slot;
  }
  return null;
}

async function login(email, password) {
  const { status, payload } = await request('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  if (status !== 200) throw new Error(`login failed for ${email}: ${status} ${JSON.stringify(payload)}`);
  return payload.data;
}

(async () => {
  console.log(`\nUnique AI Frontdesk smoke check against ${BASE}\n`);

  const health = await request('/api/health');
  check('GET /api/health', health.status === 200 && health.payload?.data?.db === 'connected', JSON.stringify(health.payload));

  const owner = await login('owner@uniquecomputers.in', 'Owner@12345');
  check('Business admin login returns access token', Boolean(owner.accessToken));
  check('Login payload includes tenant', Boolean(owner.tenant?.slug), JSON.stringify(owner.tenant));

  const me = await request('/api/auth/me', { token: owner.accessToken });
  check('GET /api/auth/me', me.status === 200 && me.payload?.data?.user?.role === 'business_admin');

  const badLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'owner@uniquecomputers.in', password: 'wrong-password' },
  });
  check('Invalid credentials rejected', badLogin.status === 401);

  const unauth = await request('/api/leads');
  check('Protected route rejects anonymous access', unauth.status === 401);

  // ---- Business signup: Indian mobile validation + email verification ----
  const signupEmail = `smoke.verify.${Date.now()}@example.com`;
  const signupPassword = 'Smoke@12345';

  const badPhone = await request('/api/auth/register', {
    method: 'POST',
    body: {
      businessName: 'Smoke Verify Institute',
      ownerName: 'Smoke Owner',
      email: signupEmail,
      password: signupPassword,
      phone: '12345',
    },
  });
  const phoneDetail = (badPhone.payload?.error?.details || []).find((item) => item.path === 'phone');
  check(
    'Registration rejects an invalid Indian mobile number',
    badPhone.status === 400 && Boolean(phoneDetail),
    JSON.stringify(badPhone.payload),
  );

  const registered = await request('/api/auth/register', {
    method: 'POST',
    body: {
      businessName: 'Smoke Verify Institute',
      ownerName: 'Smoke Owner',
      email: signupEmail,
      password: signupPassword,
      // +91 and spaces must be normalised away, not rejected.
      phone: '+91 98290 11223',
    },
  });
  check(
    'Registration requires email verification (no session)',
    registered.status === 201 &&
      registered.payload?.data?.requiresEmailVerification === true &&
      !registered.payload?.data?.accessToken,
    JSON.stringify(registered.payload),
  );

  const devCode = registered.payload?.data?.devCode;
  check('A 6-digit verification code is issued', /^\d{6}$/.test(String(devCode || '')), `code=${devCode}`);

  const unverifiedLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: signupEmail, password: signupPassword, portal: 'business' },
  });
  check(
    'Unverified business admin cannot sign in',
    unverifiedLogin.status === 403 && unverifiedLogin.payload?.error?.code === 'EMAIL_NOT_VERIFIED',
    JSON.stringify(unverifiedLogin.payload),
  );

  const resendTooSoon = await request('/api/auth/resend-verification', {
    method: 'POST',
    body: { email: signupEmail },
  });
  check('Verification resend is throttled', resendTooSoon.status === 429, `status=${resendTooSoon.status}`);

  const wrongCode = await request('/api/auth/verify-email', {
    method: 'POST',
    body: { email: signupEmail, code: '000000' },
  });
  check('Incorrect verification code is rejected', wrongCode.status === 400, `status=${wrongCode.status}`);

  const verified = await request('/api/auth/verify-email', {
    method: 'POST',
    body: { email: signupEmail, code: devCode },
  });
  check(
    'Correct code verifies the email and returns a session',
    verified.status === 200 &&
      verified.payload?.data?.user?.emailVerified === true &&
      Boolean(verified.payload?.data?.accessToken),
    JSON.stringify(verified.payload),
  );
  check(
    'Mobile number is stored as 10 digits',
    verified.payload?.data?.user?.phone === '9829011223',
    `phone=${verified.payload?.data?.user?.phone}`,
  );

  // ---- Role-specific sign-in portals ----
  const signupWrongPortal = await request('/api/auth/login', {
    method: 'POST',
    body: { email: signupEmail, password: signupPassword, portal: 'staff' },
  });
  check(
    'Business admin is rejected on the staff portal',
    signupWrongPortal.status === 403 && signupWrongPortal.payload?.error?.code === 'WRONG_PORTAL',
    JSON.stringify(signupWrongPortal.payload),
  );

  const signupRightPortal = await request('/api/auth/login', {
    method: 'POST',
    body: { email: signupEmail, password: signupPassword, portal: 'business' },
  });
  check('Business admin signs in on the business portal', signupRightPortal.status === 200);

  const smokeTenantId = verified.payload?.data?.tenant?.id || signupRightPortal.payload?.data?.tenant?.id;

  const staffOnSuperAdmin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'staff@uniquecomputers.in', password: 'Staff@12345', portal: 'super-admin' },
  });
  check(
    'Staff is rejected on the super admin portal',
    staffOnSuperAdmin.status === 403 && staffOnSuperAdmin.payload?.error?.code === 'WRONG_PORTAL',
    JSON.stringify(staffOnSuperAdmin.payload),
  );

  const superAdminOnBusiness = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@uniqueit.in', password: 'Admin@12345', portal: 'business' },
  });
  check(
    'Super admin is rejected on the business portal',
    superAdminOnBusiness.status === 403 && superAdminOnBusiness.payload?.error?.code === 'WRONG_PORTAL',
    JSON.stringify(superAdminOnBusiness.payload),
  );

  const superAdminOnOwnPortal = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@uniqueit.in', password: 'Admin@12345', portal: 'super-admin' },
  });
  check('Super admin signs in on the super admin portal', superAdminOnOwnPortal.status === 200);

  const overview = await request('/api/analytics/business/overview', { token: owner.accessToken });
  check('Business overview analytics', overview.status === 200 && typeof overview.payload?.data?.kpis?.leadTotal === 'number');

  const leads = await request('/api/leads', { token: owner.accessToken });
  check('Lead list is tenant scoped', leads.status === 200 && Array.isArray(leads.payload.data));

  const phone = `+9199${Date.now().toString().slice(-8)}`;
  const createdLead = await request('/api/leads', {
    method: 'POST',
    token: owner.accessToken,
    body: { name: 'Smoke Test Lead', phone, course: 'Python Programming', source: 'manual' },
  });
  check('Create lead', createdLead.status === 201 && Boolean(createdLead.payload?.data?.lead?.id), JSON.stringify(createdLead.payload));

  const duplicateLead = await request('/api/leads', {
    method: 'POST',
    token: owner.accessToken,
    body: { name: 'Smoke Test Lead', phone, course: 'Python Programming' },
  });
  check('Duplicate lead merges by phone', duplicateLead.status === 201 && duplicateLead.payload?.data?.duplicate === true);

  const statusUpdate = await request(`/api/leads/${createdLead.payload.data.lead.id}/status`, {
    method: 'PATCH',
    token: owner.accessToken,
    body: { status: 'contacted' },
  });
  check('Update lead status', statusUpdate.status === 200 && statusUpdate.payload?.data?.status === 'contacted');
  check(
    'Lead status change is recorded in the lead timeline',
    (statusUpdate.payload?.data?.notes || []).some((note) => note.text === 'Status changed to contacted'),
  );

  const assignable = await request('/api/users/meta/assignable', { token: owner.accessToken });
  const assignee = (assignable.payload?.data || [])[0];
  const assigneeId = assignee?._id || assignee?.id;
  check('Assignable staff lookup', assignable.status === 200 && Boolean(assigneeId), JSON.stringify(assignable.payload));

  const assignLead = await request(`/api/leads/${createdLead.payload.data.lead.id}/assign`, {
    method: 'POST',
    token: owner.accessToken,
    body: { assigneeId: assigneeId || null },
  });
  const assignedId = assignLead.payload?.data?.assigneeId?._id || assignLead.payload?.data?.assigneeId;
  check('Assign lead to a staff member', assignLead.status === 200 && Boolean(assigneeId) && String(assignedId) === String(assigneeId), JSON.stringify(assignLead.payload));

  const slot = await firstOpenSlot(owner.accessToken);
  check('Availability offers an open slot', Boolean(slot), 'no open slot in the next 10 days');

  const appointment = await request('/api/appointments', {
    method: 'POST',
    token: owner.accessToken,
    body: {
      customerName: 'Smoke Test Lead',
      customerPhone: phone,
      type: 'demo',
      course: 'Python Programming',
      startAt: slot?.startAt || new Date(Date.now() + 3 * 86400000).setHours(14, 0, 0, 0),
      durationMinutes: 45,
    },
  });
  check('Book appointment', appointment.status === 201 && Boolean(appointment.payload?.data?.id), JSON.stringify(appointment.payload));

  if (appointment.status === 201) {
    const clash = await request('/api/appointments', {
      method: 'POST',
      token: owner.accessToken,
      body: {
        customerName: 'Second Booking',
        customerPhone: phone,
        type: 'demo',
        startAt: appointment.payload.data.startAt,
        durationMinutes: 45,
      },
    });
    check('Double booking prevented', clash.status === 409, JSON.stringify(clash.payload));

    const confirm = await request(`/api/appointments/${appointment.payload.data.id}/status`, {
      method: 'PATCH',
      token: owner.accessToken,
      body: { status: 'confirmed' },
    });
    check('Confirm appointment', confirm.status === 200 && confirm.payload?.data?.status === 'confirmed', JSON.stringify(confirm.payload));

    const cancel = await request(`/api/appointments/${appointment.payload.data.id}/status`, {
      method: 'PATCH',
      token: owner.accessToken,
      body: { status: 'cancelled' },
    });
    check('Cancel appointment', cancel.status === 200 && cancel.payload?.data?.status === 'cancelled', JSON.stringify(cancel.payload));
  }

  const widgetConfig = await request('/api/public/widget/unique-computers/config');
  check('Public widget config', widgetConfig.status === 200 && Boolean(widgetConfig.payload?.data?.widget?.welcomeMessage));

  const chat = await request('/api/public/widget/unique-computers/chat', {
    method: 'POST',
    body: {
      message: 'What is the fee for the Python Programming course?',
      visitorId: `smoke-${Date.now()}`,
      name: 'Smoke Visitor',
      phone,
    },
  });
  const reply = chat.payload?.data?.reply || '';
  check('Widget chat answers from knowledge base', chat.status === 200 && /12,000|12000/.test(reply), reply.slice(0, 120));

  const unknown = await request('/api/public/widget/unique-computers/chat', {
    method: 'POST',
    body: {
      message: 'Do you have a hostel facility on Mars?',
      visitorId: `smoke-unknown-${Date.now()}`,
    },
  });
  check(
    'Unknown question escalates instead of inventing',
    unknown.status === 200 && unknown.payload?.data?.escalated === true,
    JSON.stringify(unknown.payload?.data),
  );

  const conversations = await request('/api/conversations', { token: owner.accessToken });
  check('Conversation inbox', conversations.status === 200 && Array.isArray(conversations.payload.data));

  const smokeConversation = (conversations.payload?.data || []).find(
    (conversation) => conversation.customerPhone === phone || conversation.customerName === 'Smoke Visitor',
  );
  check('Widget chat created a conversation', Boolean(smokeConversation?.id), 'no conversation for the smoke visitor');

  if (smokeConversation?.id) {
    const replyText = 'Smoke check: our counsellor will call you shortly.';
    const staffReply = await request(`/api/conversations/${smokeConversation.id}/reply`, {
      method: 'POST',
      token: owner.accessToken,
      body: { text: replyText },
    });
    check(
      'Staff reply is stored as a staff message',
      staffReply.status === 200 && staffReply.payload?.data?.role === 'staff' && staffReply.payload?.data?.content === replyText,
      JSON.stringify(staffReply.payload),
    );

    const transcript = await request(`/api/conversations/${smokeConversation.id}`, { token: owner.accessToken });
    const lastMessage = (transcript.payload?.data?.messages || []).slice(-1)[0];
    check('Staff reply appears at the end of the transcript', lastMessage?.role === 'staff' && lastMessage?.content === replyText);
  }

  const staffLogin = await login('staff@uniquecomputers.in', 'Staff@12345');
  check('Staff login', Boolean(staffLogin.accessToken));

  const staffLeads = await request('/api/leads', { token: staffLogin.accessToken });
  const allAssignedToStaff = (staffLeads.payload?.data || []).every(
    (lead) => String(lead.assigneeId?._id || lead.assigneeId) === staffLogin.user.id,
  );
  check('Staff only sees assigned leads', staffLeads.status === 200 && allAssignedToStaff);

  const staffUsersCreate = await request('/api/users', {
    method: 'POST',
    token: staffLogin.accessToken,
    body: { name: 'Nope', email: `nope${Date.now()}@example.com`, password: 'Password123', role: 'staff' },
  });
  check('Staff cannot create users (RBAC)', staffUsersCreate.status === 403);

  const staffTenantList = await request('/api/tenants', { token: staffLogin.accessToken });
  check('Staff cannot list tenants (RBAC)', staffTenantList.status === 403);

  const crossTenant = await request('/api/leads', {
    token: owner.accessToken,
    headers: { 'X-Tenant-Id': '000000000000000000000000' },
  });
  check('Cross-tenant header rejected', crossTenant.status === 403, JSON.stringify(crossTenant.payload));

  const admin = await login('admin@uniqueit.in', 'Admin@12345');
  check('Super admin login', Boolean(admin.accessToken));

  const platform = await request('/api/analytics/platform/overview', { token: admin.accessToken });
  check('Platform analytics', platform.status === 200 && platform.payload?.data?.tenants?.total >= 2);

  const tenants = await request('/api/tenants', { token: admin.accessToken });
  check('Super admin tenant list', tenants.status === 200 && (tenants.payload?.data || []).length >= 2);

  const ownerAudit = await request('/api/audit', { token: owner.accessToken });
  check('Business admin cannot read platform audit log', ownerAudit.status === 403);

  const csv = await fetch(`${BASE}/api/leads/export`, {
    headers: { Authorization: `Bearer ${owner.accessToken}` },
  });
  const csvText = await csv.text();
  check('Lead CSV export', csv.status === 200 && csvText.includes('Smoke Test Lead'));

  const profile = await request('/api/business/profile', { token: owner.accessToken });
  const originalDescription = profile.payload?.data?.description || '';
  const editedDescription = `${originalDescription} Smoke profile check.`;
  check('Business profile loads', profile.status === 200 && typeof originalDescription === 'string', JSON.stringify(profile.payload));

  const saveProfile = await request('/api/business/profile', {
    method: 'PUT',
    token: owner.accessToken,
    body: { description: editedDescription },
  });
  check('Save business profile', saveProfile.status === 200 && saveProfile.payload?.data?.description === editedDescription, JSON.stringify(saveProfile.payload));

  const restoreProfile = await request('/api/business/profile', {
    method: 'PUT',
    token: owner.accessToken,
    body: { description: originalDescription },
  });
  check(
    'Profile save round-trips back to the original text',
    restoreProfile.status === 200 && restoreProfile.payload?.data?.description === originalDescription,
  );

  // ---- Remove the throwaway business created above ----
  if (process.env.MONGODB_URI) {
    let cleanup = { removed: false };
    try {
      cleanup = await cleanupSmokeBusiness({ tenantId: smokeTenantId, email: signupEmail });
    } catch (error) {
      cleanup = { removed: false, reason: `cleanup failed: ${error.message}` };
    }
    check('Smoke test business is removed afterwards', cleanup.removed === true, JSON.stringify(cleanup));
  } else {
    console.log('  SKIP  Smoke test business cleanup (MONGODB_URI is not set)');
  }

  console.log(`\n  ${passed} passed, ${failed} failed${failed ? ` (${failures.join(', ')})` : ''}\n`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error('\nSmoke check crashed:', error.message);
  process.exit(1);
});
