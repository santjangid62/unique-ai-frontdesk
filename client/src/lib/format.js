import { translate } from '../i18n/index.jsx';

/** Display label for statuses, channels and categories; follows the UI language. */
export const titleCase = (value = '') =>
  translate(
    String(value)
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase()),
  );

export const currency = (value, code = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

export const compactNumber = (value) =>
  new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0);

export const dateTime = (value, options = {}) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options,
  });
};

export const dayLabel = (value) =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';

export const timeLabel = (value) =>
  value ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

export const fromNow = (value) => {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 1) return translate('just now');
  if (Math.abs(minutes) < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return `${days}d ago`;
  return dayLabel(value);
};

const STATUS_STYLES = {
  new: 'bg-sky-50 text-sky-700',
  contacted: 'bg-amber-50 text-amber-700',
  interested: 'bg-violet-50 text-violet-700',
  demo_scheduled: 'bg-indigo-50 text-indigo-700',
  converted: 'bg-emerald-50 text-emerald-700',
  not_interested: 'bg-slate-100 text-slate-600',
  lost: 'bg-rose-50 text-rose-700',
  scheduled: 'bg-sky-50 text-sky-700',
  confirmed: 'bg-emerald-50 text-emerald-700',
  completed: 'bg-slate-100 text-slate-700',
  cancelled: 'bg-rose-50 text-rose-700',
  rescheduled: 'bg-amber-50 text-amber-700',
  no_show: 'bg-orange-50 text-orange-700',
  open: 'bg-emerald-50 text-emerald-700',
  pending: 'bg-amber-50 text-amber-700',
  handoff: 'bg-rose-50 text-rose-700',
  closed: 'bg-slate-100 text-slate-600',
  active: 'bg-emerald-50 text-emerald-700',
  suspended: 'bg-amber-50 text-amber-700',
  inactive: 'bg-slate-100 text-slate-600',
  trialing: 'bg-sky-50 text-sky-700',
  paid: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-rose-50 text-rose-700',
  connected: 'bg-emerald-50 text-emerald-700',
  disconnected: 'bg-slate-100 text-slate-600',
  error: 'bg-rose-50 text-rose-700',
  ready: 'bg-emerald-50 text-emerald-700',
  processing: 'bg-amber-50 text-amber-700',
  missed: 'bg-rose-50 text-rose-700',
  in_progress: 'bg-sky-50 text-sky-700',
  transferred: 'bg-violet-50 text-violet-700',
  voice: 'bg-indigo-50 text-indigo-700',
  whatsapp: 'bg-emerald-50 text-emerald-700',
  website: 'bg-sky-50 text-sky-700',
};

export const statusClass = (status) => STATUS_STYLES[status] || 'bg-slate-100 text-slate-600';
