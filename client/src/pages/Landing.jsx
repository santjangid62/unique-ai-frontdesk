import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  PhoneCall,
  MessageCircle,
  Globe2,
  Users,
  CalendarCheck,
  ShieldCheck,
  BookOpen,
  ArrowRight,
  Check,
  Zap,
  Headphones,
} from 'lucide-react';
import api from '../lib/api.js';
import { currency } from '../lib/format.js';
import { LanguageSwitcher, useI18n } from '../i18n/index.jsx';

const FEATURES = [
  {
    icon: Globe2,
    title: 'Website AI chatbot',
    text: 'An embeddable widget that answers from your verified course, fee and timing information — then captures the lead.',
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp automation',
    text: 'Official WhatsApp Business Cloud API webhooks route every conversation to the right business and reply with AI.',
  },
  {
    icon: PhoneCall,
    title: 'AI voice receptionist',
    text: 'Twilio-compatible call handling with speech input, spoken answers, call transcripts and human transfer.',
  },
  {
    icon: Users,
    title: 'Lead CRM',
    text: 'Every enquiry becomes a deduplicated lead with source, course interest, assignee and follow-up date.',
  },
  {
    icon: CalendarCheck,
    title: 'Demo class booking',
    text: 'The AI checks real availability, prevents double booking and confirms only after the appointment is saved.',
  },
  {
    icon: ShieldCheck,
    title: 'Multi-tenant by design',
    text: 'Server-enforced tenant isolation, role-based access, audit logs and encrypted credentials per business.',
  },
];

const STEPS = [
  { title: 'Add your business facts', text: 'Courses, fees, batch timings, FAQs and policies — or upload a PDF and let it chunk automatically.' },
  { title: 'Train your front desk', text: 'Set the tone, language, greeting and handoff rules for each AI receptionist agent.' },
  { title: 'Go live everywhere', text: 'Paste the widget code, connect WhatsApp or forward your number. Every enquiry is answered instantly.' },
];

export default function Landing() {
  const { t } = useI18n();
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    api
      .get('/plans')
      .then(({ data }) => setPlans(data.data || []))
      .catch(() => setPlans([]));
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">
              <Sparkles size={18} />
            </span>
            <span className="text-base font-bold tracking-tight text-slate-900">{t('Unique AI Frontdesk')}</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
            <a href="#features" className="hover:text-slate-900">{t('Features')}</a>
            <a href="#how" className="hover:text-slate-900">{t('How it works')}</a>
            <a href="#pricing" className="hover:text-slate-900">{t('Pricing')}</a>
            <Link to="/chat/unique-computers" className="hover:text-slate-900">{t('Live demo')}</Link>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitcher className="hidden sm:inline-flex" />
            <Link to="/login" className="btn-ghost">{t('Sign in')}</Link>
            <Link to="/register" className="btn-primary">{t('Start free')}</Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 -z-10 h-[520px] bg-gradient-to-b from-brand-50 via-white to-white" />
        <div className="mx-auto grid max-w-6xl gap-12 px-5 pb-16 pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pb-24 lg:pt-20">
          <div>
            <span className="chip bg-brand-50 text-brand-700">
              <Zap size={13} /> {t('AI receptionist for coaching institutes')}
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl lg:text-[3.4rem]">
              {t('Your Business Never Misses a Customer.')}
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">
              {t(
                'Answer every call, WhatsApp message and website chat 24/7 with an AI front desk that knows your courses, fees and batch timings — and books the demo class for you.',
              )}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/register" className="btn-primary px-5 py-3">
                {t('Start your free trial')} <ArrowRight size={16} />
              </Link>
              <Link to="/chat/unique-computers" className="btn-secondary px-5 py-3">
                <Headphones size={16} /> {t('Try the live chatbot')}
              </Link>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              {t('14-day trial · No credit card · Website chat, WhatsApp and voice in one platform')}
            </p>
          </div>

          <div className="relative">
            <div className="card p-5 shadow-pop">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <p className="ml-2 text-xs font-semibold text-slate-400">uniquecomputers.in · AI receptionist</p>
              </div>
              <div className="space-y-3 pt-4 text-sm">
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-2.5 text-slate-700">
                  Hi, I want to learn Python. I am a beginner.
                </div>
                <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-2.5 text-white">
                  We offer Python Programming (₹12,000, 2 months) and Python Full Stack Development. As a beginner,
                  Python Programming is a great start. Would you like a free demo class?
                </div>
                <div className="max-w-[70%] rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-2.5 text-slate-700">
                  Yes, Saturday morning please.
                </div>
                <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-2.5 text-white">
                  Your demo is confirmed for Saturday, 11:00 AM. I have saved your details — our counsellor will call
                  you today.
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                <Check size={14} /> Lead captured · Appointment booked · No staff needed
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-5 py-16">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">{t('Everything in one front desk')}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{t('Built for the way institutes actually work')}</h2>
          <p className="mt-3 text-slate-600">
            {t('Replace missed calls and scattered WhatsApp chats with a single AI receptionist that captures, qualifies and routes every enquiry.')}
          </p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="card p-6 transition hover:-translate-y-0.5 hover:shadow-pop">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <feature.icon size={20} />
              </span>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{t(feature.title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{t(feature.text)}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="border-y border-slate-100 bg-slate-50/70 py-16">
        <div className="mx-auto max-w-6xl px-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">{t('How it works')}</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{t('Live in three steps')}</h2>
            </div>
            <Link to="/register" className="btn-secondary">
              {t('Create your workspace')} <ArrowRight size={16} />
            </Link>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <div key={step.title} className="card p-6">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-sm font-bold text-white">
                  {index + 1}
                </span>
                <h3 className="mt-4 font-semibold text-slate-900">{t(step.title)}</h3>
                <p className="mt-2 text-sm text-slate-600">{t(step.text)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-5 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">{t('Pricing')}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{t('Simple plans that grow with you')}</h2>
          <p className="mt-3 text-slate-600">{t('Every plan includes the website chatbot, knowledge base, lead CRM and appointments.')}</p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {(plans.length
            ? plans
            : [
                { code: 'starter', name: 'Starter', priceMonthly: 1499, features: ['Website AI chatbot', 'Knowledge base', 'Lead capture'] },
                { code: 'growth', name: 'Growth', priceMonthly: 3499, features: ['WhatsApp AI assistant', 'Human handoff'] },
                { code: 'professional', name: 'Professional', priceMonthly: 6999, features: ['AI voice receptionist'] },
                { code: 'enterprise', name: 'Enterprise', priceMonthly: 14999, features: ['Custom limits', 'SLA'] },
              ]
          ).map((plan) => (
            <div key={plan.code} className={`card flex flex-col p-6 ${plan.code === 'growth' ? 'ring-2 ring-brand-500' : ''}`}>
              {plan.code === 'growth' ? (
                <span className="chip mb-3 self-start bg-brand-600 text-white">{t('Most popular')}</span>
              ) : null}
              <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
              <p className="mt-1 text-sm text-slate-500">{plan.description || t('AI front desk for your business.')}</p>
              <p className="mt-4 text-3xl font-extrabold text-slate-900">
                {currency(plan.priceMonthly)}
                <span className="text-sm font-medium text-slate-500">/mo</span>
              </p>
              <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-600">
                {(plan.features || []).slice(0, 5).map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <Check size={16} className="mt-0.5 shrink-0 text-emerald-500" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link to="/register" className={`mt-6 ${plan.code === 'growth' ? 'btn-primary' : 'btn-secondary'} w-full`}>
                {t('Start with')} {plan.name}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="px-5 pb-20">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-ink px-8 py-12 text-center text-white sm:px-12">
          <h2 className="text-3xl font-bold tracking-tight">{t('Stop losing enquiries after 7 PM')}</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-300">
            {t('Your AI receptionist answers instantly, in English or Hindi, and hands over to your team with full context when a human is needed.')}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link to="/register" className="btn-primary px-5 py-3">
              {t('Start free trial')} <ArrowRight size={16} />
            </Link>
            <Link to="/chat/unique-computers" className="btn px-5 py-3 bg-white/10 text-white hover:bg-white/15">
              <BookOpen size={16} /> {t('Chat with the demo institute')}
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-100 bg-white py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 text-sm text-slate-500 sm:flex-row">
          <p>© {new Date().getFullYear()} Unique IT Solutions · {t('Unique AI Frontdesk')}</p>
          <div className="flex items-center gap-5">
            <Link to="/login" className="hover:text-slate-800">{t('Sign in')}</Link>
            <Link to="/register" className="hover:text-slate-800">{t('Get started')}</Link>
            <Link to="/chat/unique-computers" className="hover:text-slate-800">{t('Demo')}</Link>
            <LanguageSwitcher />
          </div>
        </div>
      </footer>
    </div>
  );
}
