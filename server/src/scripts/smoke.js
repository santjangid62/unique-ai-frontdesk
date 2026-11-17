/**
 * API smoke check. Requires a running server (npm start or npm run dev) that
 * has been seeded. Usage: node server/src/scripts/smoke.js
 */
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:5000';

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

  const appointment = await request('/api/appointments', {
    method: 'POST',
    token: owner.accessToken,
    body: {
      customerName: 'Smoke Test Lead',
      customerPhone: phone,
      type: 'demo',
      course: 'Python Programming',
      startAt: new Date(Date.now() + 3 * 86400000).setHours(14, 0, 0, 0),
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

  console.log(`\n  ${passed} passed, ${failed} failed${failed ? ` (${failures.join(', ')})` : ''}\n`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error('\nSmoke check crashed:', error.message);
  process.exit(1);
});
