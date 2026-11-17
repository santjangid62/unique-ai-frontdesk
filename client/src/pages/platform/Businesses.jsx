import { useState } from 'react';
import { Building2, Plus, Search } from 'lucide-react';
import api, { errorMessage } from '../../lib/api.js';
import useFetch from '../../lib/useFetch.js';
import { Alert, Badge, Card, EmptyState, Field, Modal, PageHeader, Pagination, Spinner, Table } from '../../components/ui.jsx';
import { dateTime, fromNow, titleCase } from '../../lib/format.js';

const empty = {
  name: '',
  industry: 'coaching',
  contactEmail: '',
  contactPhone: '',
  planCode: 'starter',
  ownerName: '',
  ownerEmail: '',
  ownerPassword: '',
};

export default function Businesses() {
  const [filters, setFilters] = useState({ search: '', status: '', page: 1 });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null);

  const query = new URLSearchParams({
    page: String(filters.page),
    limit: '12',
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  }).toString();

  const { data, meta, loading, reload } = useFetch(`/tenants?${query}`, [query]);
  const { data: plans } = useFetch('/plans');
  const detailFetch = useFetch(detail ? `/tenants/${detail}` : null, [detail], { enabled: Boolean(detail) });

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/tenants', {
        name: form.name,
        industry: form.industry,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
        planCode: form.planCode,
        ...(form.ownerEmail
          ? { owner: { name: form.ownerName, email: form.ownerEmail, password: form.ownerPassword } }
          : {}),
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

  const setStatus = async (tenant, status) => {
    try {
      await api.patch(`/tenants/${tenant.id}/status`, { status });
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Platform"
        title="Businesses"
        subtitle="Every tenant on the platform, with plan, usage and account status."
        actions={
          <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
            <Plus size={16} /> Add business
          </button>
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-4">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input w-60 pl-9"
              placeholder="Search business or slug"
              value={filters.search}
              onChange={(event) => setFilters({ ...filters, search: event.target.value, page: 1 })}
            />
          </div>
          <select className="input w-40" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value, page: 1 })}>
            <option value="">All statuses</option>
            {['active', 'suspended', 'inactive'].map((status) => (
              <option key={status} value={status}>
                {titleCase(status)}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <Spinner />
        ) : !data?.length ? (
          <EmptyState icon={Building2} title="No businesses yet" description="Create the first tenant to get started." />
        ) : (
          <Table
            rows={data}
            columns={[
              {
                key: 'name',
                label: 'Business',
                render: (row) => (
                  <button type="button" className="text-left" onClick={() => setDetail(row.id)}>
                    <p className="font-semibold text-slate-800 hover:text-brand-600">{row.name}</p>
                    <p className="text-xs text-slate-500">/{row.slug} · {titleCase(row.industry)}</p>
                  </button>
                ),
              },
              {
                key: 'owner',
                label: 'Owner',
                render: (row) => (
                  <div>
                    <p className="text-xs font-semibold text-slate-700">{row.owner?.name || '—'}</p>
                    <p className="text-xs text-slate-500">{row.owner?.email || ''}</p>
                  </div>
                ),
              },
              {
                key: 'plan',
                label: 'Plan',
                render: (row) => <Badge status="active">{titleCase(row.subscription?.planCode || row.planCode)}</Badge>,
              },
              {
                key: 'stats',
                label: 'Usage',
                render: (row) => (
                  <span className="text-xs text-slate-600">
                    {row.stats.users} users · {row.stats.leads} leads · {row.stats.conversations} chats
                  </span>
                ),
              },
              { key: 'status', label: 'Status', render: (row) => <Badge status={row.status} /> },
              { key: 'createdAt', label: 'Joined', render: (row) => <span className="text-xs text-slate-500">{fromNow(row.createdAt)}</span> },
              {
                key: 'actions',
                label: '',
                render: (row) => (
                  <div className="flex justify-end gap-1">
                    {row.status === 'active' ? (
                      <button type="button" className="btn-ghost px-2 py-1 text-xs text-amber-700" onClick={() => setStatus(row, 'suspended')}>
                        Suspend
                      </button>
                    ) : (
                      <button type="button" className="btn-ghost px-2 py-1 text-xs text-emerald-700" onClick={() => setStatus(row, 'active')}>
                        Activate
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
        <Pagination meta={meta} onPage={(page) => setFilters({ ...filters, page })} />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add business"
        description="Creates the tenant, its profile and an optional business admin login."
        size="lg"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="tenant-form" className="btn-primary" disabled={busy}>
              {busy ? 'Creating…' : 'Create business'}
            </button>
          </>
        }
      >
        <form id="tenant-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {error && open ? (
            <div className="sm:col-span-2">
              <Alert>{error}</Alert>
            </div>
          ) : null}
          <Field label="Business name">
            <input className="input" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="Industry">
            <select className="input" value={form.industry} onChange={(event) => setForm({ ...form, industry: event.target.value })}>
              {['coaching', 'healthcare', 'hotels', 'real_estate', 'salon', 'other'].map((industry) => (
                <option key={industry} value={industry}>
                  {titleCase(industry)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Contact email">
            <input className="input" type="email" value={form.contactEmail} onChange={(event) => setForm({ ...form, contactEmail: event.target.value })} />
          </Field>
          <Field label="Contact phone">
            <input className="input" value={form.contactPhone} onChange={(event) => setForm({ ...form, contactPhone: event.target.value })} />
          </Field>
          <Field label="Plan">
            <select className="input" value={form.planCode} onChange={(event) => setForm({ ...form, planCode: event.target.value })}>
              {(plans || []).map((plan) => (
                <option key={plan.code} value={plan.code}>
                  {plan.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2 mt-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Business admin (optional)</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <input className="input" placeholder="Admin name" value={form.ownerName} onChange={(event) => setForm({ ...form, ownerName: event.target.value })} />
              <input className="input" placeholder="Admin email" type="email" value={form.ownerEmail} onChange={(event) => setForm({ ...form, ownerEmail: event.target.value })} />
              <input className="input" placeholder="Temporary password" value={form.ownerPassword} onChange={(event) => setForm({ ...form, ownerPassword: event.target.value })} />
            </div>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detailFetch.data?.tenant?.name || 'Business'} size="lg">
        {detailFetch.loading ? (
          <Spinner />
        ) : detailFetch.data ? (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ['Slug', detailFetch.data.tenant.slug],
                ['Industry', titleCase(detailFetch.data.tenant.industry)],
                ['Status', titleCase(detailFetch.data.tenant.status)],
                ['Email', detailFetch.data.tenant.contactEmail || '—'],
                ['Phone', detailFetch.data.tenant.contactPhone || '—'],
                ['Joined', dateTime(detailFetch.data.tenant.createdAt, { timeStyle: undefined })],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                  <p className="text-sm text-slate-700">{value}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Users</p>
              <ul className="space-y-1">
                {(detailFetch.data.users || []).map((member) => (
                  <li key={member._id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span>
                      {member.name} <span className="text-xs text-slate-500">{member.email}</span>
                    </span>
                    <Badge status={member.isActive ? 'active' : 'inactive'}>{titleCase(member.role)}</Badge>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Leads</p>
                <p className="text-lg font-bold text-slate-800">{detailFetch.data.stats.leads}</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Conversations</p>
                <p className="text-lg font-bold text-slate-800">{detailFetch.data.stats.conversations}</p>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
