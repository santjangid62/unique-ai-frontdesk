/**
 * Adds extra dummy data on top of the demo seed so the dashboard, inbox and
 * reports look alive during testing. Safe to re-run: every record is matched
 * by a deterministic key before it is inserted.
 *
 *   npm run seed        # demo workspace + logins (run once)
 *   npm run demo:data   # this script: tester login + 40 leads, 10 chats, 6 demos
 */
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';
import { env, mongoUriProblem } from '../config/env.js';
import Tenant from '../models/Tenant.js';
import User from '../models/User.js';
import Lead from '../models/Lead.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Appointment from '../models/Appointment.js';
import Notification from '../models/Notification.js';
import UsageLog from '../models/UsageLog.js';

export const TESTER_CREDENTIALS = {
  email: 'tester@uniquecomputers.in',
  password: 'Tester@12345',
};

const COURSES = [
  'Python Programming',
  'Python Full Stack Development',
  'Advanced Excel & MIS',
  'Digital Marketing',
];
const SOURCES = ['website', 'whatsapp', 'voice', 'manual'];
const STATUSES = ['new', 'contacted', 'interested', 'demo_scheduled', 'converted', 'not_interested', 'lost'];
const FIRST_NAMES = [
  'Aarav', 'Ishita', 'Kabir', 'Meera', 'Rohan', 'Tanvi', 'Yash', 'Diya', 'Manav', 'Sanya',
  'Aditya', 'Pooja', 'Karan', 'Ritika', 'Nikhil', 'Simran', 'Harsh', 'Ayushi', 'Devansh', 'Khushi',
];
const LAST_NAMES = [
  'Sharma', 'Verma', 'Jain', 'Agarwal', 'Mehta', 'Soni', 'Choudhary', 'Saini', 'Mathur', 'Bansal',
];
const QUESTIONS = [
  'What is the fee for the {course} course?',
  'Do you have a weekend batch for {course}?',
  'Is placement assistance included with {course}?',
  'Can I pay the {course} fee in instalments?',
  'What is the duration of the {course} course?',
  'Can I attend a free demo class before joining {course}?',
];
const REPLIES = [
  'The {course} course fee is shared in our fee structure, and instalments are available. Would you like a free demo class?',
  'Yes, we run weekend batches for {course}. The next batch starts Monday — shall I book a demo for you?',
  'Placement assistance is included: mock interviews, resume reviews and referrals to 60+ partner companies.',
  'Yes, fees can be paid in two instalments. The first instalment confirms your seat.',
  'Let me connect you with our counsellor for the exact batch schedule.',
];

const daysAgo = (days) => new Date(Date.now() - days * 86400000);

/** Small deterministic PRNG so reruns produce the same dummy records. */
function createRandom(seed = 20261119) {
  let state = seed;
  return (max) => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state % max;
  };
}

async function ensureTester(tenant) {
  const existing = await User.findOne({ email: TESTER_CREDENTIALS.email });
  if (existing) return existing;

  const tester = new User({
    name: 'QA Tester',
    email: TESTER_CREDENTIALS.email,
    role: 'business_admin',
    tenantId: tenant._id,
    phone: '+91 98290 44556',
    designation: 'Quality Assurance',
    emailVerified: true,
  });
  await tester.setPassword(TESTER_CREDENTIALS.password);
  await tester.save();
  return tester;
}

async function addLeads(tenant, staffIds, random) {
  let created = 0;
  for (let index = 0; index < 40; index += 1) {
    const phone = `+9199000${String(10000 + index).slice(-5)}`;
    if (await Lead.exists({ tenantId: tenant._id, phone, isDeleted: false })) continue;

    const name = `${FIRST_NAMES[index % FIRST_NAMES.length]} ${LAST_NAMES[random(LAST_NAMES.length)]}`;
    const course = COURSES[random(COURSES.length)];
    const status = STATUSES[random(STATUSES.length)];
    const source = SOURCES[random(SOURCES.length)];
    const createdAt = daysAgo(random(30));
    const assigned = index % 3 === 0 && staffIds.length ? staffIds[random(staffIds.length)] : null;

    await Lead.create({
      tenantId: tenant._id,
      name,
      phone,
      email: index % 4 === 0 ? `${name.toLowerCase().replace(/\s+/g, '.')}@example.com` : '',
      course,
      source,
      status,
      assigneeId: assigned,
      followUpDate: ['new', 'contacted', 'interested'].includes(status) ? daysAgo(-random(5) - 1) : null,
      lastContactAt: status === 'new' ? null : daysAgo(random(10)),
      notes: [
        {
          text:
            source === 'website'
              ? `Asked about ${course} fees and batch timings on the website widget.`
              : `Enquiry about ${course} came through ${source}.`,
          byName: source === 'manual' ? 'Rahul Sharma' : 'AI Frontdesk',
          at: createdAt,
        },
      ],
      createdAt,
    });
    created += 1;
  }
  return created;
}

async function addConversations(tenant, staffIds, random) {
  let created = 0;
  for (let index = 0; index < 10; index += 1) {
    const visitorId = `demo-visitor-${index + 1}`;
    if (await Conversation.exists({ tenantId: tenant._id, visitorId })) continue;

    const course = COURSES[random(COURSES.length)];
    const name = `${FIRST_NAMES[(index + 7) % FIRST_NAMES.length]} ${LAST_NAMES[(index + 3) % LAST_NAMES.length]}`;
    const channel = SOURCES[random(3)]; // voice, whatsapp or website
    const handoff = index % 4 === 1;
    const startedAt = daysAgo(random(14));

    const conversation = await Conversation.create({
      tenantId: tenant._id,
      channel,
      customerName: name,
      customerPhone: `+9199000${String(20000 + index).slice(-5)}`,
      visitorId,
      status: handoff ? 'handoff' : index % 5 === 0 ? 'closed' : 'open',
      aiEnabled: !handoff,
      assignedTo: handoff && staffIds.length ? staffIds[index % staffIds.length] : null,
      escalationReason: handoff ? 'Student asked for a fee discount decision' : null,
      escalatedAt: handoff ? startedAt : null,
      subject: `Enquiry about ${course}`,
      lastMessageAt: startedAt,
      unreadForStaff: handoff ? 1 : 0,
    });

    const question = QUESTIONS[random(QUESTIONS.length)].replace('{course}', course);
    const reply = REPLIES[random(REPLIES.length)].replace(/\{course\}/g, course);
    const messages = [
      { role: 'customer', content: question, authorName: name },
      { role: 'ai', content: reply, authorName: 'Unique Frontdesk AI' },
    ];
    if (index % 2 === 0) {
      messages.push({ role: 'customer', content: 'Please share the available batch timings.', authorName: name });
      messages.push({
        role: 'ai',
        content: 'We have morning and evening batches. Which time suits you better?',
        authorName: 'Unique Frontdesk AI',
      });
    }
    if (handoff) {
      messages.push({
        role: 'staff',
        content: 'Let me check with the director and confirm the discount.',
        authorName: 'Priya Verma',
      });
    }

    await Message.insertMany(
      messages.map((message, position) => ({
        ...message,
        tenantId: tenant._id,
        conversationId: conversation._id,
        createdAt: new Date(startedAt.getTime() + position * 3 * 60000),
      })),
      { timestamps: false },
    );

    conversation.messageCount = messages.length;
    conversation.lastMessagePreview = messages[messages.length - 1].content.slice(0, 120);
    conversation.lastMessageAt = new Date(startedAt.getTime() + (messages.length - 1) * 3 * 60000);
    await conversation.save();
    created += 1;
  }
  return created;
}

/** Next open weekday at 11:00 or 16:00, so no demo lands on a closed Sunday. */
function nextOpenSlot(offsetDays, hour) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  while (date.getDay() === 0) date.setDate(date.getDate() + 1);
  date.setHours(hour, 0, 0, 0);
  return date;
}

async function addAppointments(tenant, staffIds, random) {
  let created = 0;
  for (let index = 0; index < 6; index += 1) {
    const startAt = nextOpenSlot(index * 2 + 1, index % 2 === 0 ? 11 : 16);
    const customerPhone = `+9199000${String(30000 + index).slice(-5)}`;
    if (await Appointment.exists({ tenantId: tenant._id, customerPhone, startAt })) continue;

    const endAt = new Date(startAt.getTime() + 45 * 60000);
    await Appointment.create({
      tenantId: tenant._id,
      customerName: `${FIRST_NAMES[(index + 11) % FIRST_NAMES.length]} ${LAST_NAMES[random(LAST_NAMES.length)]}`,
      customerPhone,
      type: index % 3 === 0 ? 'counselling' : 'demo',
      course: COURSES[random(COURSES.length)],
      startAt,
      endAt,
      staffId: staffIds.length ? staffIds[index % staffIds.length] : null,
      status: index % 4 === 0 ? 'confirmed' : 'scheduled',
      channel: index % 2 === 0 ? 'website' : 'manual',
      notes: 'Created by demo:data for testing.',
    });
    created += 1;
  }
  return created;
}

/**
 * Real chat replies also write a UsageLog row, which the dashboard's
 * "AI replies in 14 days" KPI counts. Dummy transcripts skip that path, so
 * backfill one log per AI message to keep the numbers consistent.
 */
async function addAiUsage(tenant) {
  const messages = await Message.find({ tenantId: tenant._id, role: 'ai' }).select('_id createdAt').lean();
  let created = 0;
  for (const message of messages) {
    const result = await UsageLog.updateOne(
      { tenantId: tenant._id, kind: 'ai', 'meta.messageId': String(message._id) },
      {
        $setOnInsert: {
          tenantId: tenant._id,
          kind: 'ai',
          quantity: 1,
          unit: 'reply',
          channel: 'website',
          meta: { messageId: String(message._id), source: 'demo:data' },
          createdAt: message.createdAt,
        },
      },
      { upsert: true, timestamps: false },
    );
    if (result.upsertedCount) created += 1;
  }
  return created;
}

async function addNotifications(tenant, users) {
  let created = 0;
  const items = [
    { type: 'lead', title: '5 new leads from the website widget', body: 'Python and Excel enquiries came in today.', link: '/leads' },
    { type: 'appointment', title: 'Demo class confirmed', body: 'A demo class is booked for tomorrow at 11:00 AM.', link: '/appointments' },
    { type: 'handoff', title: 'Conversation needs a human reply', body: 'A student asked for a fee discount decision.', link: '/conversations' },
    { type: 'billing', title: 'Invoice INV-2026-0042 paid', body: 'Growth plan renewal was recorded.', link: '/subscription' },
  ];

  for (const user of users) {
    for (const item of items) {
      if (await Notification.exists({ userId: user._id, tenantId: tenant._id, title: item.title })) continue;
      await Notification.create({ ...item, tenantId: tenant._id, userId: user._id });
      created += 1;
    }
  }
  return created;
}

async function main() {
  const uriProblem = mongoUriProblem(env.mongoUri);
  if (uriProblem) {
    console.error(`[demo:data] ${uriProblem}`);
    console.error('[demo:data] Start a database first: npm run db:local (or set MONGODB_URI in .env).');
    process.exit(1);
  }

  await connectDB();

  let tenant = await Tenant.findOne({ slug: 'unique-computers' });
  if (!tenant) {
    const { runSeed } = await import('./seed.js');
    await runSeed({ quiet: true });
    tenant = await Tenant.findOne({ slug: 'unique-computers' });
  }

  const owner = await User.findOne({ email: 'owner@uniquecomputers.in' });
  const tester = await ensureTester(tenant);
  const staffIds = await User.find({ tenantId: tenant._id, role: 'staff', isActive: true }).distinct('_id');
  const random = createRandom();

  const leads = await addLeads(tenant, staffIds, random);
  const conversations = await addConversations(tenant, staffIds, random);
  const appointments = await addAppointments(tenant, staffIds, random);
  const notifications = await addNotifications(tenant, [owner, tester].filter(Boolean));
  const aiUsage = await addAiUsage(tenant);

  const totals = {
    leads: await Lead.countDocuments({ tenantId: tenant._id, isDeleted: false }),
    conversations: await Conversation.countDocuments({ tenantId: tenant._id }),
    appointments: await Appointment.countDocuments({ tenantId: tenant._id }),
  };

  console.log(
    `\n  [demo:data] added ${leads} leads, ${conversations} conversations, ${appointments} appointments, ${notifications} notifications, ${aiUsage} AI usage logs`,
  );
  console.log(`  [demo:data] tenant totals: ${totals.leads} leads · ${totals.conversations} conversations · ${totals.appointments} appointments`);
  console.log('\n  Test logins');
  console.log('  ---------------------------------------------------------');
  console.log(`  Tester (business admin) : ${TESTER_CREDENTIALS.email} / ${TESTER_CREDENTIALS.password}`);
  console.log('  Owner  (business admin) : owner@uniquecomputers.in / Owner@12345');
  console.log('  Staff                   : staff@uniquecomputers.in / Staff@12345');
  console.log('  Super Admin             : admin@uniqueit.in / Admin@12345');
  console.log('  ---------------------------------------------------------\n');
}

main()
  .then(async () => {
    await disconnectDB();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[demo:data] failed', error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
