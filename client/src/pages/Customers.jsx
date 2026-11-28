import { useState } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import api, { errorMessage } from '../lib/api.js';
import useFetch from '../lib/useFetch.js';
import { Alert, Badge, Card, EmptyState, Field, Modal, PageHeader, Pagination, Spinner, Table, Tx } from '../components/ui.jsx';
import { dateTime, fromNow, titleCase } from '../lib/format.js';
import { useI18n } from '../i18n/index.jsx';
import { useBusinessCategory } from '../lib/useBusinessCategory.js';

const empty = { name: '', phone: '', email: '', tags: '', interestedCourses: '' };

export default function Customers() {
  const { t } = useI18n();
  const category = useBusinessCategory();
  const [filters, setFilters] = useState({ search: '', page: 1 });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const query = new URLSearchParams({ page: String(filters.page), limit: '15', ...(filters.search ? { search: filters.search } : {}) }).toString();
  const { data, meta, loading, reload } = useFetch(`/customers?${query}`, [query]);
  const detailFetch = useFetch(detail ? `/customers/${detail}` : null, [detail], { enabled: Boolean(detail) });

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/customers', {
        name: form.name,
        phone: form.phone,
        email: form.email,
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        interestedCourses: form.interestedCourses.split(',').map((course) => course.trim()).filter(Boolean),
      });
      setOpen(false);
      setForm(empty);
      reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (customer) => {
    if (!window.confirm(`Delete customer ${customer.name}?`)) return;
    try {
      await api.delete(`/customers/${customer.id}`);
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Directory"
        title="Customers"
        subtitle="Everyone your AI has spoken to, with their full conversation and appointment history."
        actions={
          <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
            <Plus size={16} /> Add customer
          </button>
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <div className="relative max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              placeholder={t('Search customers')}
              value={filters.search}
              onChange={(event) => setFilters({ search: event.target.value, page: 1 })}
            />
          </div>
        </div>
        <Table
          loading={loading}
          rows={data}
          columns={[
            {
              key: 'name',
              label: 'Customer',
              render: (row) => (
                <button type="button" className="text-left" onClick={() => setDetail(row.id)}>
                  <p className="font-semibold text-slate-800 hover:text-brand-600">{row.name}</p>
                  <p className="text-xs text-slate-500">{row.phone || row.email || 'No contact'}</p>
                </button>
              ),
            },
            {
              key: 'courses',
              label: t(category.interestLabel),
              render: (row) => <span className="text-xs text-slate-600">{(row.interestedCourses || []).join(', ') || '—'}</span>,
            },
            {
              key: 'tags',
              label: 'Tags',
              render: (row) => (
                <div className="flex flex-wrap gap-1">
                  {(row.tags || []).map((tag) => (
                    <span key={tag} className="chip bg-slate-100 text-slate-600">
                      {tag}
                    </span>
                  ))}
                </div>
              ),
            },
            { key: 'conversations', label: 'Chats', render: (row) => <span className="text-xs text-slate-600">{row.totalConversations || 0}</span> },
            { key: 'appointments', label: 'Appointments', render: (row) => <span className="text-xs text-slate-600">{row.totalAppointments || 0}</span> },
            {
              key: 'lastInteractionAt',
              label: 'Last contact',
              render: (row) => <span className="text-xs text-slate-500">{fromNow(row.lastInteractionAt || row.createdAt)}</span>,
            },
            {
              key: 'actions',
              label: '',
              render: (row) => (
                <div className="flex justify-end gap-1">
                  <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setDetail(row.id)}>
                    <Tx>History</Tx>
                  </button>
                  <button type="button" className="btn-ghost px-2 py-1 text-xs text-rose-600" onClick={() => remove(row)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ),
            },
          ]}
          empty={<EmptyState title="No customers yet" description="Customers are created automatically when a lead shares contact details." />}
        />
        <Pagination meta={meta} onPage={(page) => setFilters({ ...filters, page })} />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Add customer" footer={
        <>
          <button type="button" className="btn-secondary" onClick={() => setOpen(false)}><Tx>Cancel</Tx></button>
          <button type="submit" form="customer-form" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save customer'}</button>
        </>
      }>
        <form id="customer-form" onSubmit={submit} className="space-y-4">
          {error && open ? <Alert>{error}</Alert> : null}
          <Field label="Full name">
            <input className="input" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone" hint="10-digit mobile number, used for calls and WhatsApp.">
              <input className="input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </Field>
          </div>
          <Field label={t(category.interestLabel)} hint="Comma separated.">
            <input className="input" value={form.interestedCourses} onChange={(event) => setForm({ ...form, interestedCourses: event.target.value })} />
          </Field>
          <Field label="Tags" hint="Comma separated labels for grouping, for example: hot, repeat.">
            <input className="input" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} />
          </Field>
        </form>
      </Modal>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detailFetch.data?.customer?.name || 'Customer'} size="lg">
        {detailFetch.loading ? (
          <Spinner />
        ) : detailFetch.data ? (
          <div className="space-y-5">
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ['Phone', detailFetch.data.customer.phone || '—'],
                ['Email', detailFetch.data.customer.email || '—'],
                [t(category.offerings), (detailFetch.data.customer.interestedCourses || []).join(', ') || '—'],
                ['Tags', (detailFetch.data.customer.tags || []).join(', ') || '—'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                  <p className="text-sm text-slate-700">{value}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Tx>Appointments</Tx></p>
              {detailFetch.data.appointments?.length ? (
                <ul className="space-y-1">
                  {detailFetch.data.appointments.map((appointment) => (
                    <li key={appointment._id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                      <span>{dateTime(appointment.startAt)} · {titleCase(appointment.type)}</span>
                      <Badge status={appointment.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500"><Tx>No appointments yet.</Tx></p>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Tx>Conversations</Tx></p>
              {detailFetch.data.conversations?.length ? (
                <ul className="space-y-1">
                  {detailFetch.data.conversations.map((conversation) => (
                    <li key={conversation._id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-700">{conversation.lastMessagePreview || 'No preview'}</span>
                        <Badge status={conversation.channel} />
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-400">{fromNow(conversation.lastMessageAt)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500"><Tx>No conversations recorded.</Tx></p>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
