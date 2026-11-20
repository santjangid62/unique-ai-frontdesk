import { useState } from 'react';
import { Check, CreditCard, Download } from 'lucide-react';
import api, { errorMessage } from '../lib/api.js';
import useFetch from '../lib/useFetch.js';
import { Alert, Badge, Card, PageHeader, Progress, Spinner } from '../components/ui.jsx';
import { currency, dateTime, titleCase } from '../lib/format.js';
import { useI18n } from '../i18n/index.jsx';

const METRICS = [
  ['aiMessages', 'AI messages', 'aiMessagesPerMonth'],
  ['voiceMinutes', 'Voice minutes', 'voiceMinutesPerMonth'],
  ['whatsappMessages', 'WhatsApp messages', 'whatsappMessagesPerMonth'],
  ['knowledgeEntries', 'Knowledge entries', 'knowledgeEntries'],
];

export default function Subscription() {
  const { t } = useI18n();
  const { data, loading, error: loadError, reload } = useFetch('/subscriptions/me');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const changePlan = async (planCode, billingCycle = 'monthly') => {
    setBusy(planCode);
    setError('');
    try {
      await api.post('/subscriptions/change-plan', { planCode, billingCycle });
      reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy('');
    }
  };

  const downloadInvoice = (invoice) => {
    const lines = [
      `Invoice: ${invoice.number}`,
      `Amount: ${currency(invoice.amount, invoice.currency)}`,
      `Status: ${invoice.status}`,
      `Period: ${dateTime(invoice.periodStart)} - ${dateTime(invoice.periodEnd)}`,
      `Issued: ${dateTime(invoice.issuedAt)}`,
      '',
      'Unique IT Solutions · Unique AI Frontdesk',
    ].join('\n');
    const blob = new Blob([lines], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${invoice.number}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading || !data) return <Spinner label="Loading your subscription…" />;
  if (loadError) return <Alert>{loadError}</Alert>;

  const currentPlan = data.plan;
  const invoices = data.subscription?.invoices || [];

  return (
    <div>
      <PageHeader
        eyebrow="Billing"
        title="Subscription & Usage"
        subtitle="Track plan limits across AI, voice and WhatsApp, and manage renewals."
        actions={
          <span className="chip bg-emerald-50 text-emerald-700">
            <CreditCard size={13} /> {titleCase(data.status || 'active')} · renews {dateTime(data.currentPeriodEnd, { timeStyle: undefined })}
          </span>
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('Current plan')}</p>
          <div className="mt-2 flex items-end justify-between">
            <h2 className="text-2xl font-bold text-slate-900">{currentPlan?.name || titleCase(data.subscription?.planCode || 'Starter')}</h2>
            <p className="text-sm text-slate-500">{currency(currentPlan?.priceMonthly || 0)}/mo</p>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            {(currentPlan?.features || []).map((feature) => (
              <li key={feature} className="flex gap-2">
                <Check size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                {feature}
              </li>
            ))}
          </ul>
          <div className="mt-5 space-y-3">
            {METRICS.map(([usageKey, label, limitKey]) => (
              <div key={usageKey}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600">{label}</span>
                  <span className="text-slate-500">
                    {data.usage?.[usageKey] || 0} / {data.limits?.[limitKey] || 0}
                  </span>
                </div>
                <Progress value={data.usage?.[usageKey] || 0} max={data.limits?.[limitKey] || 1} />
              </div>
            ))}
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
          {(data.plans || []).map((plan) => {
            const isCurrent = plan.code === currentPlan?.code;
            return (
              <Card key={plan.code} className={`flex flex-col p-5 ${isCurrent ? 'ring-2 ring-brand-500' : ''}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{plan.name}</h3>
                    <p className="mt-0.5 text-xs text-slate-500">{plan.description}</p>
                  </div>
                  {isCurrent ? <span className="chip bg-brand-50 text-brand-700">{t('Current')}</span> : null}
                </div>
                <p className="mt-3 text-2xl font-extrabold text-slate-900">
                  {currency(plan.priceMonthly)}
                  <span className="text-xs font-medium text-slate-500">/mo</span>
                </p>
                <ul className="mt-3 flex-1 space-y-1.5 text-xs text-slate-600">
                  <li>{plan.limits?.aiMessagesPerMonth} AI messages · {plan.limits?.staff} staff seats</li>
                  <li>{plan.limits?.agents} AI agents · {plan.limits?.knowledgeEntries} knowledge entries</li>
                  <li>{plan.limits?.voiceMinutesPerMonth} voice minutes · {plan.limits?.whatsappMessagesPerMonth} WhatsApp messages</li>
                </ul>
                <button
                  type="button"
                  className={`mt-4 ${isCurrent ? 'btn-secondary' : 'btn-primary'}`}
                  disabled={isCurrent || busy === plan.code}
                  onClick={() => changePlan(plan.code)}
                >
                  {isCurrent ? t('Active plan') : busy === plan.code ? t('Updating…') : `${t('Switch to')} ${plan.name}`}
                </button>
              </Card>
            );
          })}
        </div>
      </div>

      <Card className="mt-6 overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">{t('Invoices')}</h2>
          <p className="text-xs text-slate-500">{t('Payment capture requires a connected gateway; invoices are recorded here either way.')}</p>
        </div>
        {!invoices.length ? (
          <p className="px-5 py-6 text-sm text-slate-500">{t('No invoices yet.')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/70">
                <tr>
                  {['Invoice', 'Amount', 'Status', 'Period', 'Issued', ''].map((header) => (
                    <th key={header} className="table-head">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((invoice) => (
                  <tr key={invoice._id || invoice.number}>
                    <td className="table-cell font-semibold text-slate-800">{invoice.number}</td>
                    <td className="table-cell">{currency(invoice.amount, invoice.currency)}</td>
                    <td className="table-cell"><Badge status={invoice.status} /></td>
                    <td className="table-cell text-xs text-slate-500">
                      {dateTime(invoice.periodStart, { timeStyle: undefined })} – {dateTime(invoice.periodEnd, { timeStyle: undefined })}
                    </td>
                    <td className="table-cell text-xs text-slate-500">{dateTime(invoice.issuedAt, { timeStyle: undefined })}</td>
                    <td className="table-cell text-right">
                      <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => downloadInvoice(invoice)}>
                        <Download size={13} /> {t('Download')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
