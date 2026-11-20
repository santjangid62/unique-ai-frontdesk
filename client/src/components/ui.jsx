import { useEffect } from 'react';
import { X, Loader2, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { statusClass, titleCase } from '../lib/format.js';
import { useI18n } from '../i18n/index.jsx';

/** Wraps inline JSX text so it follows the selected language. */
export function Tx({ children }) {
  const { t } = useI18n();
  return typeof children === 'string' ? t(children) : children;
}

export function Card({ children, className = '', ...rest }) {
  return (
    <div className={`card ${className}`} {...rest}>
      {children}
    </div>
  );
}

/** Labels, titles and headings are translated centrally so every page is bilingual. */
export function PageHeader({ title, subtitle, actions, eyebrow }) {
  const { t } = useI18n();
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? (
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-brand-600">{t(eyebrow)}</p>
        ) : null}
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t(title)}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-slate-500">{t(subtitle)}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint, icon: Icon, tone = 'brand' }) {
  const { t } = useI18n();
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
    sky: 'bg-sky-50 text-sky-600',
  };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t(label)}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
          {hint ? <p className="mt-1 text-xs text-slate-500">{t(hint)}</p> : null}
        </div>
        {Icon ? (
          <span className={`grid h-10 w-10 place-items-center rounded-xl ${tones[tone] || tones.brand}`}>
            <Icon size={18} />
          </span>
        ) : null}
      </div>
    </Card>
  );
}

export function Badge({ status, children }) {
  const { t } = useI18n();
  return <span className={`chip ${statusClass(status)}`}>{children || t(titleCase(status))}</span>;
}

export function Field({ label, error, hint, children, className = '' }) {
  const { t } = useI18n();
  return (
    <div className={className}>
      {label ? <label className="label">{t(label)}</label> : null}
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-rose-600">{t(error)}</p> : null}
      {hint && !error ? <p className="mt-1 text-xs text-slate-400">{t(hint)}</p> : null}
    </div>
  );
}

export function Alert({ tone = 'error', children }) {
  if (!children) return null;
  const tones = {
    error: 'border-rose-200 bg-rose-50 text-rose-700',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    info: 'border-sky-200 bg-sky-50 text-sky-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
  };
  return <div className={`rounded-xl border px-4 py-3 text-sm ${tones[tone] || tones.error}`}>{children}</div>;
}

export function Spinner({ label = 'Loading…', className = '' }) {
  const { t } = useI18n();
  return (
    <div className={`flex items-center justify-center gap-2 py-10 text-sm text-slate-500 ${className}`}>
      <Loader2 className="animate-spin" size={18} />
      {t(label)}
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', description, action, icon: Icon = Inbox }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon size={22} />
      </span>
      <h3 className="mt-1 text-sm font-semibold text-slate-800">{t(title)}</h3>
      {description ? <p className="max-w-sm text-sm text-slate-500">{t(description)}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        className={`animate-fade-up w-full ${widths[size] || widths.md} max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white shadow-pop sm:rounded-2xl`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{t(title)}</h2>
            {description ? <p className="mt-0.5 text-xs text-slate-500">{t(description)}</p> : null}
          </div>
          <button type="button" className="btn-ghost -mr-2 px-2 py-1" onClick={onClose} aria-label={t('Close')}>
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Pagination({ meta, onPage }) {
  const { t } = useI18n();
  if (!meta || meta.totalPages <= 1) return null;
  const count = t('{count} records', { count: meta.total });
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
      <span>
        {t('Page {page} of {pages}', { page: meta.page, pages: meta.totalPages })} · {count}
      </span>
      <div className="flex gap-1">
        <button
          type="button"
          className="btn-secondary px-2.5 py-1.5"
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          className="btn-secondary px-2.5 py-1.5"
          disabled={!meta.hasNext}
          onClick={() => onPage(meta.page + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export function Table({ columns, rows, empty, rowKey = (row) => row.id, loading }) {
  const { t } = useI18n();
  if (loading) return <Spinner />;
  if (!rows?.length) return empty || <EmptyState />;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-100">
        <thead className="bg-slate-50/70">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="table-head">
                {t(column.label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-slate-50/60">
              {columns.map((column) => (
                <td key={column.key} className="table-cell">
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
            value === tab.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {t(tab.label)}
          {tab.count !== undefined ? <span className="ml-1.5 text-xs text-slate-400">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value = 0, max = 100, tone = 'brand' }) {
  const percent = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const tones = { brand: 'bg-brand-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500' };
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${tones[tone] || tones.brand}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

/**
 * Indian mobile input: the +91 prefix is fixed, the user types only the 10
 * digits, and non-digits are stripped as they type.
 */
export function PhoneInput({ value = '', onChange, placeholder = '98290 11223', ...rest }) {
  const { t } = useI18n();
  const digits = String(value || '').replace(/\D/g, '').slice(-10);
  return (
    <div className="flex items-stretch">
      <span className="inline-flex items-center rounded-l-xl border border-r-0 border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-500">
        +91
      </span>
      <input
        {...rest}
        className={`input rounded-l-none ${rest.className || ''}`}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={10}
        placeholder={placeholder || t('Mobile number')}
        value={digits}
        onChange={(event) => onChange?.(event.target.value.replace(/\D/g, '').slice(0, 10))}
      />
    </div>
  );
}
