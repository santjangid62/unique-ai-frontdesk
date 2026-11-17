import { useState } from 'react';
import { Check, Package, Pencil, Plus } from 'lucide-react';
import api, { errorMessage } from '../../lib/api.js';
import useFetch from '../../lib/useFetch.js';
import { Alert, Card, Field, Modal, PageHeader, Spinner } from '../../components/ui.jsx';
import { currency } from '../../lib/format.js';

const empty = {
  code: '',
  name: '',
  description: '',
  priceMonthly: 0,
  priceYearly: 0,
  features: '',
  aiMessagesPerMonth: 1000,
  agents: 1,
  staff: 3,
  knowledgeEntries: 100,
  voiceMinutesPerMonth: 0,
  whatsappMessagesPerMonth: 0,
};

export default function Plans() {
  const { data: plans, loading, error: loadError, reload } = useFetch('/plans');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setForm(empty);
    setError('');
    setOpen(true);
  };

  const openEdit = (plan) => {
    setEditing(plan);
    setForm({
      code: plan.code,
      name: plan.name,
      description: plan.description || '',
      priceMonthly: plan.priceMonthly || 0,
      priceYearly: plan.priceYearly || 0,
      features: (plan.features || []).join(', '),
      aiMessagesPerMonth: plan.limits?.aiMessagesPerMonth || 0,
      agents: plan.limits?.agents || 0,
      staff: plan.limits?.staff || 0,
      knowledgeEntries: plan.limits?.knowledgeEntries || 0,
      voiceMinutesPerMonth: plan.limits?.voiceMinutesPerMonth || 0,
      whatsappMessagesPerMonth: plan.limits?.whatsappMessagesPerMonth || 0,
    });
    setError('');
    setOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const payload = {
      code: form.code,
      name: form.name,
      description: form.description,
      priceMonthly: Number(form.priceMonthly),
      priceYearly: Number(form.priceYearly),
      features: form.features.split(',').map((feature) => feature.trim()).filter(Boolean),
      limits: {
        aiMessagesPerMonth: Number(form.aiMessagesPerMonth),
        agents: Number(form.agents),
        staff: Number(form.staff),
        knowledgeEntries: Number(form.knowledgeEntries),
        voiceMinutesPerMonth: Number(form.voiceMinutesPerMonth),
        whatsappMessagesPerMonth: Number(form.whatsappMessagesPerMonth),
      },
    };
    try {
      if (editing) await api.put(`/plans/${editing.id}`, payload);
      else await api.post('/plans', payload);
      setOpen(false);
      reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner label="Loading plans…" />;
  if (loadError) return <Alert>{loadError}</Alert>;

  return (
    <div>
      <PageHeader
        eyebrow="Monetization"
        title="Subscription Plans"
        subtitle="Plan pricing and limits drive tenant feature gates and usage meters."
        actions={
          <button type="button" className="btn-primary" onClick={openCreate}>
            <Plus size={16} /> New plan
          </button>
        }
      />

      {error && !open ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(plans || []).map((plan) => (
          <Card key={plan.id} className="flex flex-col p-5">
            <div className="flex items-start justify-between">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <Package size={17} />
              </span>
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => openEdit(plan)}>
                <Pencil size={13} /> Edit
              </button>
            </div>
            <h2 className="mt-3 text-base font-bold text-slate-900">{plan.name}</h2>
            <p className="text-xs text-slate-500">{plan.description}</p>
            <p className="mt-3 text-2xl font-extrabold text-slate-900">
              {currency(plan.priceMonthly)}
              <span className="text-xs font-medium text-slate-500">/mo</span>
            </p>
            <ul className="mt-3 flex-1 space-y-1 text-xs text-slate-600">
              <li>{plan.limits?.aiMessagesPerMonth} AI messages</li>
              <li>{plan.limits?.agents} agents · {plan.limits?.staff} seats</li>
              <li>{plan.limits?.knowledgeEntries} knowledge entries</li>
              <li>{plan.limits?.voiceMinutesPerMonth} voice · {plan.limits?.whatsappMessagesPerMonth} WhatsApp</li>
            </ul>
            <div className="mt-3 space-y-1">
              {(plan.features || []).slice(0, 4).map((feature) => (
                <p key={feature} className="flex gap-1.5 text-[11px] text-slate-500">
                  <Check size={12} className="mt-0.5 shrink-0 text-emerald-500" /> {feature}
                </p>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'New plan'}
        size="lg"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="plan-form" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save plan'}
            </button>
          </>
        }
      >
        {error && open ? (
          <div className="mb-3">
            <Alert>{error}</Alert>
          </div>
        ) : null}
        <form id="plan-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Plan name">
            <input className="input" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="Code" hint="Lowercase identifier">
            <input className="input" required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <input className="input" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </Field>
          <Field label="Monthly price (INR)">
            <input className="input" type="number" value={form.priceMonthly} onChange={(event) => setForm({ ...form, priceMonthly: event.target.value })} />
          </Field>
          <Field label="Yearly price (INR)">
            <input className="input" type="number" value={form.priceYearly} onChange={(event) => setForm({ ...form, priceYearly: event.target.value })} />
          </Field>
          <Field label="AI messages / month">
            <input className="input" type="number" value={form.aiMessagesPerMonth} onChange={(event) => setForm({ ...form, aiMessagesPerMonth: event.target.value })} />
          </Field>
          <Field label="AI agents">
            <input className="input" type="number" value={form.agents} onChange={(event) => setForm({ ...form, agents: event.target.value })} />
          </Field>
          <Field label="Staff seats">
            <input className="input" type="number" value={form.staff} onChange={(event) => setForm({ ...form, staff: event.target.value })} />
          </Field>
          <Field label="Knowledge entries">
            <input className="input" type="number" value={form.knowledgeEntries} onChange={(event) => setForm({ ...form, knowledgeEntries: event.target.value })} />
          </Field>
          <Field label="Voice minutes / month">
            <input className="input" type="number" value={form.voiceMinutesPerMonth} onChange={(event) => setForm({ ...form, voiceMinutesPerMonth: event.target.value })} />
          </Field>
          <Field label="WhatsApp messages / month">
            <input className="input" type="number" value={form.whatsappMessagesPerMonth} onChange={(event) => setForm({ ...form, whatsappMessagesPerMonth: event.target.value })} />
          </Field>
          <Field label="Features" className="sm:col-span-2" hint="Comma separated">
            <textarea className="input" rows={2} value={form.features} onChange={(event) => setForm({ ...form, features: event.target.value })} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
