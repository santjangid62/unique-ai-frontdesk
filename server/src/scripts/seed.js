import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';
import { env, mongoUriProblem } from '../config/env.js';
import { ensureDefaultPlans } from '../services/plans.js';
import User from '../models/User.js';
import Tenant from '../models/Tenant.js';
import BusinessProfile from '../models/BusinessProfile.js';
import AiAgent from '../models/AiAgent.js';
import KnowledgeEntry from '../models/KnowledgeEntry.js';
import Subscription from '../models/Subscription.js';
import Lead from '../models/Lead.js';
import Customer from '../models/Customer.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Appointment from '../models/Appointment.js';
import Call from '../models/Call.js';
import Notification from '../models/Notification.js';
import AutomationRule from '../models/AutomationRule.js';
import AuditLog from '../models/AuditLog.js';
import Integration from '../models/Integration.js';
import UsageLog from '../models/UsageLog.js';

export const DEMO_CREDENTIALS = {
  superAdmin: { email: 'admin@uniqueit.in', password: 'Admin@12345' },
  businessAdmin: { email: 'owner@uniquecomputers.in', password: 'Owner@12345' },
  staff: { email: 'staff@uniquecomputers.in', password: 'Staff@12345' },
  secondTenantAdmin: { email: 'owner@abccoaching.in', password: 'Owner@12345' },
};

const daysAgo = (days) => new Date(Date.now() - days * 86400000);
const daysAhead = (days, hour = 11) => {
  const date = new Date(Date.now() + days * 86400000);
  date.setHours(hour, 0, 0, 0);
  return date;
};

/** Slug of the neutral public demo workspace used by the landing page. */
export const PUBLIC_DEMO_SLUG = 'demo';

async function ensurePublicDemoWorkspace() {
  let tenant = await Tenant.findOne({ slug: PUBLIC_DEMO_SLUG });
  if (!tenant) {
    tenant = await Tenant.create({
      name: 'Demo Business',
      slug: PUBLIC_DEMO_SLUG,
      industry: 'other',
      contactEmail: 'demo@example.com',
      contactPhone: '+91 90000 00000',
      status: 'active',
      planCode: 'growth',
      timezone: 'Asia/Kolkata',
    });
  }

  await BusinessProfile.findOneAndUpdate(
    { tenantId: tenant._id },
    {
      $setOnInsert: {
        tenantId: tenant._id,
        name: 'Demo Business',
        industry: 'other',
        description:
          'A sample service business that shows how the AI front desk answers questions, shares prices and books appointments.',
        phone: '+91 90000 00000',
        email: 'hello@example.com',
        website: 'https://example.com',
        address: '4th Floor, MG Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        country: 'India',
        workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        openingTime: '09:00',
        closingTime: '18:00',
        languages: ['English', 'Hindi'],
        widget: {
          primaryColor: '#4f46e5',
          position: 'right',
          welcomeMessage: 'Hi! Ask me about our services, prices, timings or book an appointment.',
          showBranding: true,
          isEnabled: true,
        },
        coaching: { demoAvailable: true },
      },
    },
    { upsert: true },
  );

  await AiAgent.findOneAndUpdate(
    { tenantId: tenant._id, name: 'Demo Front Desk AI' },
    {
      $setOnInsert: {
        tenantId: tenant._id,
        name: 'Demo Front Desk AI',
        description: 'Sample website receptionist that answers from the demo knowledge base.',
        greeting: 'Hi! Ask me about our services, prices, timings or book an appointment.',
        personality: 'Warm, clear and helpful',
        tone: 'friendly',
        language: 'English',
        voice: 'female-neutral',
        instructions:
          'Answer only from the demo knowledge base. Share prices and timings exactly as listed, and offer an appointment when the visitor shows interest.',
        channels: { website: true, whatsapp: false, voice: false },
        handoff: { enabled: true, triggers: ['customer_request', 'low_confidence', 'complaint', 'complex_query'], transferNumber: '' },
        isActive: true,
        isDefault: true,
      },
    },
    { upsert: true },
  );

  if ((await KnowledgeEntry.countDocuments({ tenantId: tenant._id })) === 0) {
    await KnowledgeEntry.insertMany([
      {
        tenantId: tenant._id,
        category: 'business',
        title: 'About Demo Business',
        content:
          'Demo Business is a sample service business used to demonstrate the AI front desk. Services: on-site service visits, consultations and annual maintenance. Address: 4th Floor, MG Road, Bengaluru. Phone: +91 90000 00000.',
        tags: ['about', 'address', 'contact'],
      },
      {
        tenantId: tenant._id,
        category: 'fee',
        title: 'Service prices',
        content:
          'Standard service visit: Rs 499 (inspection and first hour). Full service: Rs 1,499. Annual maintenance plan: Rs 4,999 per year, including two visits and priority slots. Prices include GST.',
        tags: ['price', 'fees', 'service'],
      },
      {
        tenantId: tenant._id,
        category: 'timing',
        title: 'Opening hours and appointment slots',
        content:
          'Open Monday to Saturday, 9:00 AM to 6:00 PM. Sunday closed. Appointment slots are 11:00 AM, 1:00 PM and 4:00 PM.',
        tags: ['timings', 'hours', 'slots'],
      },
      {
        tenantId: tenant._id,
        category: 'policy',
        title: 'Booking and cancellation policy',
        content:
          'Appointments can be booked up to 30 days ahead. Rescheduling is free up to 4 hours before the slot. Cancellations within 4 hours of the slot are charged Rs 199.',
        tags: ['booking', 'cancellation', 'policy'],
      },
      {
        tenantId: tenant._id,
        category: 'contact',
        title: 'Contact and service area',
        content:
          'Service area: Bengaluru city. Phone and WhatsApp: +91 90000 00000. Email: hello@example.com. Same-day emergency visits are available subject to availability.',
        tags: ['contact', 'service area', 'emergency'],
      },
    ]);
  }

  return tenant;
}

async function createUser({ name, email, password, role, tenantId = null, phone = '', designation = '' }) {
  const existing = await User.findOne({ email });
  if (existing) {
    // Demo accounts must stay usable after the email-verification gate.
    if (!existing.emailVerified) {
      existing.emailVerified = true;
      await existing.save();
    }
    return existing;
  }
  const user = new User({ name, email, role, tenantId, phone, designation, emailVerified: true });
  await user.setPassword(password);
  await user.save();
  return user;
}

export async function runSeed({ quiet = false } = {}) {
  const log = (...args) => {
    if (!quiet) console.log(...args);
  };

  await ensureDefaultPlans();

  const superAdmin = await createUser({
    name: 'Platform Owner',
    email: DEMO_CREDENTIALS.superAdmin.email,
    password: DEMO_CREDENTIALS.superAdmin.password,
    role: 'super_admin',
    designation: 'Super Admin',
  });

  let tenant = await Tenant.findOne({ slug: 'unique-computers' });
  if (!tenant) {
    tenant = await Tenant.create({
      name: 'Unique Computers',
      slug: 'unique-computers',
      industry: 'coaching',
      contactEmail: 'owner@uniquecomputers.in',
      contactPhone: '+91 98290 11223',
      status: 'active',
      planCode: 'growth',
      timezone: 'Asia/Kolkata',
    });
  }

  const owner = await createUser({
    name: 'Rahul Sharma',
    email: DEMO_CREDENTIALS.businessAdmin.email,
    password: DEMO_CREDENTIALS.businessAdmin.password,
    role: 'business_admin',
    tenantId: tenant._id,
    phone: '+91 98290 11223',
    designation: 'Institute Director',
  });
  const staff = await createUser({
    name: 'Priya Verma',
    email: DEMO_CREDENTIALS.staff.email,
    password: DEMO_CREDENTIALS.staff.password,
    role: 'staff',
    tenantId: tenant._id,
    phone: '+91 98290 44556',
    designation: 'Counsellor',
  });
  const staff2 = await createUser({
    name: 'Amit Singh',
    email: 'counsellor@uniquecomputers.in',
    password: 'Staff@12345',
    role: 'staff',
    tenantId: tenant._id,
    phone: '+91 98290 77889',
    designation: 'Admission Counsellor',
  });

  if (!tenant.ownerId) {
    tenant.ownerId = owner._id;
    await tenant.save();
  }

  let profile = await BusinessProfile.findOne({ tenantId: tenant._id });
  if (!profile) {
    profile = await BusinessProfile.create({
      tenantId: tenant._id,
      name: 'Unique Computers',
      industry: 'coaching',
      description:
        'Unique Computers is a computer training and coaching institute in Jaipur offering job-oriented IT courses with placement assistance since 2012.',
      phone: '+91 98290 11223',
      email: 'hello@uniquecomputers.in',
      website: 'https://uniquecomputers.in',
      address: '2nd Floor, Crystal Plaza, Tonk Road',
      city: 'Jaipur',
      state: 'Rajasthan',
      country: 'India',
      workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      openingTime: '09:00',
      closingTime: '19:00',
      languages: ['English', 'Hindi'],
      coaching: {
        demoAvailable: true,
        admissionProcess:
          'Visit the institute or book a free demo class. After the demo, complete the admission form, submit ID proof and pay the first instalment to confirm your seat.',
        placementInfo:
          'We provide 100% placement assistance with mock interviews, resume building and tie-ups with 60+ IT companies in Jaipur and NCR.',
        faculty: ['Rahul Sharma (Founder, 12 years)', 'Priya Verma (Python & Data Science)', 'Amit Singh (Full Stack)'],
        courses: [
          {
            name: 'Python Programming',
            category: 'Programming',
            fee: 12000,
            duration: '2 months',
            batchTimings: ['07:00-08:30', '17:00-18:30'],
            mode: 'hybrid',
            syllabus: 'Python basics, OOP, file handling, modules, projects, introduction to data science libraries.',
          },
          {
            name: 'Python Full Stack Development',
            category: 'Full Stack',
            fee: 38000,
            duration: '5 months',
            batchTimings: ['09:00-11:00', '18:00-20:00'],
            mode: 'offline',
            syllabus: 'Python, Django, REST APIs, React, MongoDB, deployment and a capstone project.',
          },
          {
            name: 'Advanced Excel & MIS',
            category: 'Office',
            fee: 6500,
            duration: '1 month',
            batchTimings: ['10:00-11:30', '16:00-17:30'],
            mode: 'offline',
            syllabus: 'Formulas, pivot tables, dashboards, Power Query and reporting.',
          },
          {
            name: 'Digital Marketing',
            category: 'Marketing',
            fee: 18000,
            duration: '3 months',
            batchTimings: ['11:00-12:30'],
            mode: 'hybrid',
            syllabus: 'SEO, Google Ads, Meta Ads, content, analytics and live campaign projects.',
          },
        ],
      },
      widget: {
        primaryColor: '#4f46e5',
        position: 'right',
        welcomeMessage: 'Namaste! Ask me about courses, fees, batch timings or book a free demo class.',
        showBranding: true,
        isEnabled: true,
      },
    });
  }

  await AiAgent.findOneAndUpdate(
    { tenantId: tenant._id, name: 'Unique Frontdesk AI' },
    {
      $setOnInsert: {
        tenantId: tenant._id,
        name: 'Unique Frontdesk AI',
        description: 'Website and WhatsApp receptionist for course enquiries and demo bookings.',
        greeting: 'Namaste! Welcome to Unique Computers. How can I help you today?',
        personality: 'Warm, patient and encouraging with students and parents',
        tone: 'friendly',
        language: 'English',
        voice: 'female-neutral',
        instructions:
          'Help students choose the right course. Share fees and batch timings only from the knowledge base. Always offer a free demo class when the student shows interest.',
        channels: { website: true, whatsapp: true, voice: true },
        handoff: {
          enabled: true,
          triggers: ['customer_request', 'low_confidence', 'complaint', 'complex_query'],
          transferNumber: '+91 98290 11223',
        },
        isActive: true,
        isDefault: true,
      },
    },
    { upsert: true },
  );

  if ((await KnowledgeEntry.countDocuments({ tenantId: tenant._id })) === 0) {
    await KnowledgeEntry.insertMany([
      {
        tenantId: tenant._id,
        category: 'business',
        title: 'About Unique Computers',
        content:
          'Unique Computers is a computer training institute in Jaipur, running since 2012. We train over 2000 students every year in programming, full stack development, office tools and digital marketing. Address: 2nd Floor, Crystal Plaza, Tonk Road, Jaipur. Phone: +91 98290 11223.',
        tags: ['about', 'address', 'contact'],
      },
      {
        tenantId: tenant._id,
        category: 'course',
        title: 'Python Programming course details',
        content:
          'Python Programming is a 2 month course for beginners. Fee: Rs 12,000. Batches: 7:00-8:30 AM and 5:00-6:30 PM. Available online and offline. Covers Python basics, OOP, file handling and mini projects. A certificate is provided on completion.',
        tags: ['python', 'course', 'beginners'],
      },
      {
        tenantId: tenant._id,
        category: 'course',
        title: 'Python Full Stack Development course details',
        content:
          'Python Full Stack Development is a 5 month job-oriented course. Fee: Rs 38,000 (instalments available). Batches: 9:00-11:00 AM and 6:00-8:00 PM, offline only. Covers Python, Django, REST APIs, React, MongoDB and deployment with a capstone project.',
        tags: ['full stack', 'python', 'django', 'react'],
      },
      {
        tenantId: tenant._id,
        category: 'fee',
        title: 'Fee structure and instalments',
        content:
          'Python Programming: Rs 12,000. Python Full Stack Development: Rs 38,000. Advanced Excel & MIS: Rs 6,500. Digital Marketing: Rs 18,000. Fees can be paid in two instalments for courses above Rs 20,000. A 10% discount applies for full upfront payment on full stack courses.',
        tags: ['fees', 'instalment', 'discount'],
      },
      {
        tenantId: tenant._id,
        category: 'timing',
        title: 'Batch timings and institute hours',
        content:
          'The institute is open Monday to Saturday, 9:00 AM to 7:00 PM. Sunday is closed. Morning batches run 7:00-8:30 AM, 9:00-11:00 AM and 10:00-11:30 AM. Evening batches run 5:00-6:30 PM and 6:00-8:00 PM. New batches start on the 1st and 15th of every month.',
        tags: ['timings', 'batches', 'hours'],
      },
      {
        tenantId: tenant._id,
        category: 'faq',
        title: 'Free demo class',
        content:
          'We offer a free demo class before admission. You can attend a live session with the trainer for your chosen course. Demo classes are available Monday to Saturday at 11:00 AM and 4:00 PM, subject to seat availability. Book a slot by sharing your preferred date and time.',
        tags: ['demo', 'trial', 'free class'],
      },
      {
        tenantId: tenant._id,
        category: 'faq',
        title: 'Admission process',
        content:
          'Admission steps: 1) Book a free demo class. 2) Attend the demo and counselling session. 3) Fill the admission form with ID proof and a passport photo. 4) Pay the first instalment to confirm your seat. Admission is confirmed only after payment.',
        tags: ['admission', 'enrol', 'process'],
      },
      {
        tenantId: tenant._id,
        category: 'policy',
        title: 'Placement assistance and certification',
        content:
          'Placement assistance includes resume building, mock interviews and access to our hiring partner network of 60+ IT companies. Placement support is available for full stack and digital marketing students who complete the course with 80% attendance. All courses include a completion certificate.',
        tags: ['placement', 'job', 'certificate'],
      },
      {
        tenantId: tenant._id,
        category: 'policy',
        title: 'Refund and batch change policy',
        content:
          'Fees are refundable within 7 days of admission, minus a Rs 1,500 administrative charge. Batch changes are allowed once, free of cost, subject to seat availability. Missed classes can be attended in another batch with prior approval.',
        tags: ['refund', 'cancellation', 'policy'],
      },
      {
        tenantId: tenant._id,
        category: 'contact',
        title: 'Contact and location',
        content:
          'Call or WhatsApp us at +91 98290 11223 or email hello@uniquecomputers.in. We are at 2nd Floor, Crystal Plaza, Tonk Road, Jaipur, Rajasthan 302018. Free parking is available in the basement.',
        tags: ['contact', 'phone', 'location'],
      },
    ]);
  }

  await Subscription.findOneAndUpdate(
    { tenantId: tenant._id },
    {
      $setOnInsert: {
        tenantId: tenant._id,
        planCode: 'growth',
        status: 'active',
        currentPeriodStart: daysAgo(12),
        currentPeriodEnd: daysAhead(18),
        usage: { aiMessages: 486, voiceMinutes: 42, whatsappMessages: 213, knowledgeEntries: 10, staff: 2 },
        invoices: [
          {
            number: 'INV-2026-0042',
            amount: 3499,
            currency: 'INR',
            status: 'paid',
            periodStart: daysAgo(12),
            periodEnd: daysAhead(18),
            issuedAt: daysAgo(12),
            paidAt: daysAgo(12),
            provider: 'manual',
          },
          {
            number: 'INV-2026-0011',
            amount: 3499,
            currency: 'INR',
            status: 'paid',
            periodStart: daysAgo(42),
            periodEnd: daysAgo(12),
            issuedAt: daysAgo(42),
            paidAt: daysAgo(42),
            provider: 'manual',
          },
        ],
      },
    },
    { upsert: true },
  );

  if ((await Lead.countDocuments({ tenantId: tenant._id })) === 0) {
    await Lead.insertMany(
      [
        {
          name: 'Ananya Gupta',
          phone: '+919812345671',
          email: 'ananya.gupta@example.com',
          course: 'Python Full Stack Development',
          source: 'website',
          status: 'demo_scheduled',
          assigneeId: staff._id,
          followUpDate: daysAhead(2),
          notes: [{ text: 'Wants weekend batch, asked about EMI', byName: 'AI Frontdesk' }],
          createdAt: daysAgo(1),
        },
        {
          name: 'Vikram Meena',
          phone: '+919812345672',
          email: 'vikram.meena@example.com',
          course: 'Python Programming',
          source: 'whatsapp',
          status: 'interested',
          assigneeId: staff._id,
          notes: [{ text: 'Beginner, comparing with another institute', byName: 'AI Frontdesk' }],
          createdAt: daysAgo(2),
        },
        {
          name: 'Sneha Agarwal',
          phone: '+919812345673',
          course: 'Digital Marketing',
          source: 'voice',
          status: 'new',
          notes: [{ text: 'Called for course fees and placement details', byName: 'AI Receptionist' }],
          createdAt: daysAgo(3),
        },
        {
          name: 'Mohit Jain',
          phone: '+919812345674',
          email: 'mohit.jain@example.com',
          course: 'Advanced Excel & MIS',
          source: 'website',
          status: 'converted',
          assigneeId: staff2._id,
          createdAt: daysAgo(5),
        },
        {
          name: 'Kavita Rathore',
          phone: '+919812345675',
          course: 'Python Full Stack Development',
          source: 'manual',
          status: 'contacted',
          assigneeId: staff2._id,
          followUpDate: daysAhead(1),
          createdAt: daysAgo(6),
        },
        {
          name: 'Rohit Sharma',
          phone: '+919812345676',
          course: 'Python Programming',
          source: 'website',
          status: 'not_interested',
          notes: [{ text: 'Joined another institute due to timing clash', byName: 'Priya Verma' }],
          createdAt: daysAgo(8),
        },
        {
          name: 'Neha Bansal',
          phone: '+919812345677',
          email: 'neha.bansal@example.com',
          course: 'Digital Marketing',
          source: 'whatsapp',
          status: 'lost',
          createdAt: daysAgo(10),
        },
        {
          name: 'Arjun Yadav',
          phone: '+919812345678',
          course: 'Advanced Excel & MIS',
          source: 'website',
          status: 'new',
          createdAt: daysAgo(0),
        },
      ].map((lead) => ({ ...lead, tenantId: tenant._id, isDeleted: false })),
      { timestamps: false },
    );
  }

  if ((await Customer.countDocuments({ tenantId: tenant._id })) === 0) {
    await Customer.insertMany([
      {
        tenantId: tenant._id,
        name: 'Mohit Jain',
        phone: '+919812345674',
        email: 'mohit.jain@example.com',
        tags: ['enrolled', 'excel'],
        interestedCourses: ['Advanced Excel & MIS'],
        totalConversations: 2,
        totalAppointments: 1,
        lastInteractionAt: daysAgo(4),
      },
      {
        tenantId: tenant._id,
        name: 'Ananya Gupta',
        phone: '+919812345671',
        email: 'ananya.gupta@example.com',
        tags: ['hot lead'],
        interestedCourses: ['Python Full Stack Development'],
        totalConversations: 3,
        lastInteractionAt: daysAgo(1),
      },
      {
        tenantId: tenant._id,
        name: 'Kavita Rathore',
        phone: '+919812345675',
        tags: ['walk-in'],
        interestedCourses: ['Python Full Stack Development'],
        lastInteractionAt: daysAgo(6),
      },
    ]);
  }

  if ((await Conversation.countDocuments({ tenantId: tenant._id })) === 0) {
    const conversations = await Conversation.create([
      {
        tenantId: tenant._id,
        channel: 'website',
        customerName: 'Ananya Gupta',
        customerPhone: '+919812345671',
        visitorId: 'seed-visitor-ananya',
        status: 'open',
        aiEnabled: true,
        lastMessageAt: daysAgo(1),
        lastMessagePreview: 'Your demo class is confirmed for Saturday 11:00 AM.',
        messageCount: 6,
      },
      {
        tenantId: tenant._id,
        channel: 'whatsapp',
        customerName: 'Vikram Meena',
        customerPhone: '+919812345672',
        status: 'handoff',
        aiEnabled: false,
        assignedTo: staff._id,
        escalationReason: 'Student asked for a fee discount decision',
        escalatedAt: daysAgo(2),
        lastMessageAt: daysAgo(2),
        lastMessagePreview: 'Let me check with the director and confirm.',
        messageCount: 8,
        unreadForStaff: 1,
      },
      {
        tenantId: tenant._id,
        channel: 'website',
        customerName: 'Arjun Yadav',
        customerPhone: '+919812345678',
        visitorId: 'seed-visitor-arjun',
        status: 'closed',
        aiEnabled: false,
        lastMessageAt: daysAgo(3),
        lastMessagePreview: 'Thanks for the details, I will visit tomorrow.',
        messageCount: 4,
      },
    ]);

    const seededMessages = await Message.insertMany(
      [
        {
          tenantId: tenant._id,
          conversationId: conversations[0]._id,
          role: 'customer',
          content: 'Hi, I want to learn Python. I am a complete beginner.',
          createdAt: daysAgo(1),
        },
        {
          tenantId: tenant._id,
          conversationId: conversations[0]._id,
          role: 'ai',
          content:
            'We offer Python Programming and Python Full Stack Development. Since you are a beginner, Python Programming is a great start at Rs 12,000 for 2 months. Would you like to attend a free demo class?',
          createdAt: daysAgo(1),
        },
        {
          tenantId: tenant._id,
          conversationId: conversations[0]._id,
          role: 'customer',
          content: 'Yes, Saturday morning would be good.',
          createdAt: daysAgo(1),
        },
        {
          tenantId: tenant._id,
          conversationId: conversations[0]._id,
          role: 'ai',
          content:
            'Your demo class is confirmed for Saturday 11:00 AM at Crystal Plaza, Tonk Road. Please arrive 10 minutes early with an ID proof.',
          createdAt: daysAgo(1),
        },
        {
          tenantId: tenant._id,
          conversationId: conversations[1]._id,
          role: 'customer',
          content: 'Full stack course ki fees 32000 kar sakte ho?',
          createdAt: daysAgo(2),
        },
        {
          tenantId: tenant._id,
          conversationId: conversations[1]._id,
          role: 'ai',
          content:
            'The published fee is Rs 38,000 and instalments are available. For a discount decision I will connect you with our counsellor Priya.',
          createdAt: daysAgo(2),
        },
        {
          tenantId: tenant._id,
          conversationId: conversations[1]._id,
          role: 'staff',
          content: 'Hi Vikram, Priya here. Let me check with the director and confirm.',
          authorName: 'Priya Verma',
          createdAt: daysAgo(2),
        },
      ],
      { timestamps: false },
    );

    // Real replies also write a UsageLog row (services/chat.js) and the dashboard's
    // "AI replies in 14 days" KPI counts those rows, so demo transcripts need them
    // too. Keyed by message id, so `npm run demo:data` never counts them twice.
    const channelByConversation = new Map(conversations.map((item) => [String(item._id), item.channel]));
    for (const message of seededMessages) {
      if (message.role !== 'ai') continue;
      await UsageLog.updateOne(
        { tenantId: tenant._id, kind: 'ai', 'meta.messageId': String(message._id) },
        {
          $setOnInsert: {
            tenantId: tenant._id,
            kind: 'ai',
            quantity: 1,
            unit: 'reply',
            channel: channelByConversation.get(String(message.conversationId)) || 'website',
            meta: { messageId: String(message._id), source: 'seed' },
            createdAt: message.createdAt,
          },
        },
        { upsert: true, timestamps: false },
      );
    }
  }

  if ((await Appointment.countDocuments({ tenantId: tenant._id })) === 0) {
    await Appointment.insertMany([
      {
        tenantId: tenant._id,
        customerName: 'Ananya Gupta',
        customerPhone: '+919812345671',
        customerEmail: 'ananya.gupta@example.com',
        type: 'demo',
        course: 'Python Full Stack Development',
        startAt: daysAhead(2, 11),
        endAt: daysAhead(2, 12),
        staffId: staff._id,
        status: 'confirmed',
        channel: 'website',
        createdBy: owner._id,
      },
      {
        tenantId: tenant._id,
        customerName: 'Kavita Rathore',
        customerPhone: '+919812345675',
        type: 'counselling',
        course: 'Python Full Stack Development',
        startAt: daysAhead(1, 16),
        endAt: daysAhead(1, 17),
        staffId: staff2._id,
        status: 'scheduled',
        channel: 'manual',
        createdBy: owner._id,
      },
      {
        tenantId: tenant._id,
        customerName: 'Mohit Jain',
        customerPhone: '+919812345674',
        type: 'admission',
        course: 'Advanced Excel & MIS',
        startAt: daysAgo(3),
        endAt: new Date(daysAgo(3).getTime() + 3600000),
        staffId: staff._id,
        status: 'completed',
        channel: 'manual',
        createdBy: owner._id,
      },
    ]);
  }

  if ((await Call.countDocuments({ tenantId: tenant._id })) === 0) {
    await Call.insertMany([
      {
        tenantId: tenant._id,
        provider: 'twilio',
        providerCallId: 'seed-call-1',
        direction: 'inbound',
        from: '+919812345673',
        to: '+919820000001',
        status: 'completed',
        startedAt: daysAgo(3),
        endedAt: new Date(daysAgo(3).getTime() + 185000),
        durationSeconds: 185,
        summary: 'Enquiry about Digital Marketing fees, demo class offered, lead captured.',
        transcript: [
          { role: 'customer', text: 'Digital marketing course ki fees kya hai?', at: daysAgo(3) },
          { role: 'ai', text: 'The Digital Marketing course is Rs 18,000 for 3 months. Would you like a free demo?', at: daysAgo(3) },
        ],
        consentGiven: true,
      },
      {
        tenantId: tenant._id,
        provider: 'twilio',
        providerCallId: 'seed-call-2',
        direction: 'inbound',
        from: '+919900112233',
        to: '+919820000001',
        status: 'missed',
        startedAt: daysAgo(1),
        durationSeconds: 0,
        summary: 'Missed call outside working hours. Follow-up task created.',
        consentGiven: true,
      },
    ]);
  }

  await Notification.deleteMany({ tenantId: tenant._id, userId: owner._id });
  await Notification.insertMany([
    {
      tenantId: tenant._id,
      userId: owner._id,
      type: 'lead',
      title: 'New lead captured by AI',
      body: 'Arjun Yadav enquired about Advanced Excel & MIS from the website chatbot.',
      link: '/app/leads',
    },
    {
      tenantId: tenant._id,
      userId: owner._id,
      type: 'handoff',
      title: 'Conversation needs your attention',
      body: 'Vikram Meena asked for a fee discount on WhatsApp.',
      link: '/app/conversations',
    },
    {
      tenantId: tenant._id,
      userId: owner._id,
      type: 'appointment',
      title: 'Demo class confirmed',
      body: 'Ananya Gupta · Python Full Stack Development · Saturday 11:00 AM.',
      link: '/app/appointments',
    },
  ]);

  if ((await AutomationRule.countDocuments({ tenantId: tenant._id })) === 0) {
    await AutomationRule.insertMany([
      {
        tenantId: tenant._id,
        name: 'Notify admin on new lead',
        trigger: 'lead_created',
        action: 'notify_admin',
        isActive: true,
      },
      {
        tenantId: tenant._id,
        name: 'Remind student 24 hours before demo',
        trigger: 'appointment_reminder',
        action: 'send_whatsapp',
        config: { hoursBefore: 24 },
        isActive: false,
      },
    ]);
  }

  for (const provider of ['whatsapp', 'twilio', 'email']) {
    await Integration.updateOne(
      { tenantId: tenant._id, provider },
      { $setOnInsert: { tenantId: tenant._id, provider, status: 'disconnected', label: '', config: {} } },
      { upsert: true },
    );
  }

  if ((await AuditLog.countDocuments({ tenantId: tenant._id })) === 0) {
    await AuditLog.insertMany([
      {
        tenantId: tenant._id,
        actorId: owner._id,
        actorRole: 'business_admin',
        action: 'auth.login',
        entity: 'User',
        entityId: String(owner._id),
        severity: 'info',
        ip: '127.0.0.1',
      },
      {
        tenantId: tenant._id,
        actorId: owner._id,
        actorRole: 'business_admin',
        action: 'knowledge.created',
        entity: 'KnowledgeEntry',
        severity: 'info',
        meta: { title: 'Fee structure and instalments' },
      },
      {
        tenantId: tenant._id,
        actorId: staff._id,
        actorRole: 'staff',
        action: 'lead.status_changed',
        entity: 'Lead',
        severity: 'info',
        meta: { status: 'demo_scheduled' },
      },
    ]);
  }

  // Second tenant proves logical isolation between businesses.
  let secondTenant = await Tenant.findOne({ slug: 'abc-coaching' });
  if (!secondTenant) {
    secondTenant = await Tenant.create({
      name: 'ABC Coaching',
      slug: 'abc-coaching',
      industry: 'coaching',
      contactEmail: 'owner@abccoaching.in',
      contactPhone: '+91 90000 12345',
      status: 'active',
      planCode: 'starter',
    });
    await BusinessProfile.create({
      tenantId: secondTenant._id,
      name: 'ABC Coaching',
      industry: 'coaching',
      description: 'Competitive exam coaching for banking and SSC aspirants in Ajmer.',
      phone: '+91 90000 12345',
      city: 'Ajmer',
      state: 'Rajasthan',
      coaching: {
        demoAvailable: true,
        courses: [
          {
            name: 'Bank PO Foundation',
            category: 'Banking',
            fee: 25000,
            duration: '4 months',
            batchTimings: ['08:00-10:00'],
            mode: 'offline',
            syllabus: 'Quantitative aptitude, reasoning, English and banking awareness.',
          },
        ],
      },
    });
    await AiAgent.create({
      tenantId: secondTenant._id,
      name: 'ABC Frontdesk AI',
      greeting: 'Welcome to ABC Coaching! How can I help you?',
      isDefault: true,
      isActive: true,
    });
    await KnowledgeEntry.create({
      tenantId: secondTenant._id,
      category: 'business',
      title: 'About ABC Coaching',
      content:
        'ABC Coaching prepares students for bank PO, SSC and railway exams in Ajmer. Bank PO Foundation batch fee is Rs 25,000 for 4 months, 8:00-10:00 AM.',
      tags: ['about', 'fees'],
    });
    await Subscription.create({
      tenantId: secondTenant._id,
      planCode: 'starter',
      status: 'active',
      currentPeriodStart: daysAgo(5),
      currentPeriodEnd: daysAhead(25),
      invoices: [
        {
          number: 'INV-2026-0051',
          amount: 1499,
          currency: 'INR',
          status: 'paid',
          periodStart: daysAgo(5),
          periodEnd: daysAhead(25),
          issuedAt: daysAgo(5),
          paidAt: daysAgo(5),
        },
      ],
    });
  }
  await createUser({
    name: 'Suresh Kumar',
    email: DEMO_CREDENTIALS.secondTenantAdmin.email,
    password: DEMO_CREDENTIALS.secondTenantAdmin.password,
    role: 'business_admin',
    tenantId: secondTenant._id,
    designation: 'Director',
  });

  await ensurePublicDemoWorkspace();

  log('');
  log('  Demo workspace ready');
  log(`  Public demo  : /chat/${PUBLIC_DEMO_SLUG}`);
  log('  ---------------------------------------------------------');
  log(`  Super Admin  : ${DEMO_CREDENTIALS.superAdmin.email} / ${DEMO_CREDENTIALS.superAdmin.password}`);
  log(`  Business Admin: ${DEMO_CREDENTIALS.businessAdmin.email} / ${DEMO_CREDENTIALS.businessAdmin.password}`);
  log(`  Staff        : ${DEMO_CREDENTIALS.staff.email} / ${DEMO_CREDENTIALS.staff.password}`);
  log(`  Second tenant: ${DEMO_CREDENTIALS.secondTenantAdmin.email} / ${DEMO_CREDENTIALS.secondTenantAdmin.password}`);
  log('  ---------------------------------------------------------');
  log('');

  return { tenant, owner, staff, superAdmin, secondTenant };
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  (async () => {
    let memory = null;
    if (!env.mongoUri && process.env.USE_IN_MEMORY_DB === '1') {
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      memory = await MongoMemoryServer.create({ instance: { dbName: 'unique-frontdesk' } });
      process.env.MONGODB_URI = memory.getUri('unique-frontdesk');
    }
    const uriProblem = mongoUriProblem(process.env.MONGODB_URI);
    if (uriProblem) {
      console.error(`[seed] ${uriProblem}`);
      console.error('[seed] Fix MONGODB_URI in .env (or use USE_IN_MEMORY_DB=1 for a throwaway run with a downloaded MongoDB binary).');
      process.exit(1);
    }
    await connectDB(process.env.MONGODB_URI);
    await runSeed();
    if (!memory) {
      console.log('Connected to:', mongoose.connection.host, '/', mongoose.connection.name);
    } else {
      console.log('Seeded an in-memory database. Set MONGODB_URI to seed a persistent database.');
    }
    await disconnectDB();
    if (memory) await memory.stop();
    process.exit(0);
  })().catch((error) => {
    console.error('[seed] failed', error);
    process.exit(1);
  });
}
