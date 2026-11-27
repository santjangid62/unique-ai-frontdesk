import { useState } from 'react';
import { Download, Plus, Search, StickyNote, Trash2, UserCheck } from 'lucide-react';
import api, { errorMessage } from '../lib/api.js';
import useFetch from '../lib/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Alert, Badge, Card, EmptyState, Field, Modal, PageHeader, Pagination, Spinner, Table, Tabs, Tx } from '../components/ui.jsx';
import { dateTime, fromNow, titleCase } from '../lib/format.js';
import { useI18n } from '../i18n/index.jsx';

const STATUSES = ['new', 'contacted', 'interested', 'demo_scheduled', 'converted', 'not_interested', 'lost'];
const SOURCES = ['website', 'whatsapp', 'voice', 'manual', 'integration'];

const emptyForm = { name: '', phone: '', email: '', course: '', source: 'manual', status: 'new', assigneeId: '', followUpDate: '', notes: '' };

export default function Leads() {
  const { t } = useI18n();
  const { user, isBusinessAdmin } = useAuth();
  const [filters, setFilters] = useState({ status: '', source: '', search: '', page: 1 });
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const query = new URLSearchParams({
    page: String(filters.page),
    limit: '15',
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.source ? { source: filters.source } : {}),
    ...(filters.search ? { search: filters.search } : {}),
  }).toString();

  const { data: leads, meta, loading, reload } = useFetch(`/leads?${query}`, [query]);
  const { data: team } = useFetch(isBusinessAdmin ? '/users/meta/assignable' : null, [], { enabled: isBusinessAdmin });
  const detailFetch = useFetch(detail ? `/leads/${detail}` : null, [detail], { enabled: Boolean(detail) });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (lead) => {
    setEditing(lead);
    setForm({
      name: lead.name || '',
      phone: lead.phone || '',
      email: lead.email || '',
      course: lead.course || '',
      source: lead.source || 'manual',
      status: lead.status || 'new',
      assigneeId: lead.assigneeId?._id ? String(lead.assigneeId._id) : lead.assigneeId || '',
      followUpDate: lead.followUpDate ? new Date(lead.followUpDate).toISOString().slice(0, 10) : '',
      notes: '',
    });
    setFormOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...form,
        assigneeId: form.assigneeId || null,
        followUpDate: form.followUpDate ? new Date(form.followUpDate) : null,
        ...(form.notes ? { notes: form.notes } : {}),
      };
      if (editing) await api.put(`/leads/${editing.id}`, payload);
      else await api.post('/leads', payload);
      setFormOpen(false);
      reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (lead, status) => {
    try {
      await api.patch(`/leads/${lead.id}/status`, { status });
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const assign = async (lead, assigneeId) => {
    try {
      await api.post(`/leads/${lead.id}/assign`, { assigneeId: assigneeId || null });
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    try {
      await api.post(`/leads/${detail}/notes`, { text: note });
      setNote('');
      detailFetch.reload();
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const remove = async (lead) => {
    if (!window.confirm(`Delete lead ${lead.name}?`)) return;
    try {
      await api.delete(`/leads/${lead.id}`);
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const exportCsv = async () => {
    try {
      const response = await api.get('/leads/export', { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const statusCounts = meta?.statusCounts || {};
  const tabs = [
    { value: '', label: 'All', count: meta?.total },
    ...STATUSES.map((status) => ({ value: status, label: titleCase(status), count: statusCounts[status] })),
  ];

  return (
    <div>
      <PageHeader
        eyebrow="CRM"
        title={user?.role === 'staff' ? 'My leads' : 'Leads'}
        subtitle="Every enquiry from chat, WhatsApp, calls and walk-ins — deduplicated by phone."
        actions={
          <>
            {isBusinessAdmin ? (
              <button type="button" className="btn-secondary" onClick={exportCsv}>
                <Download size={16} /> <Tx>Export CSV</Tx>
              </button>
            ) : null}
            <button type="button" className="btn-primary" onClick={openCreate}>
              <Plus size={16} /> <Tx>Add lead</Tx>
            </button>
          </>
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <Tabs tabs={tabs} value={filters.status} onChange={(status) => setFilters({ ...filters, status, page: 1 })} />
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input w-56 pl-9"
                placeholder={t('Search name, phone, service')}
                value={filters.search}
                onChange={(event) => setFilters({ ...filters, search: event.target.value, page: 1 })}
              />
            </div>
            <select className="input w-40" value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value, page: 1 })}>
              <option value=""><Tx>All sources</Tx></option>
              {SOURCES.map((source) => (
                <option key={source} value={source}>
                  {titleCase(source)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Table
          loading={loading}
          rows={leads}
          rowKey={(row) => row.id}
          columns={[
            {
              key: 'name',
              label: 'Lead',
              render: (row) => (
                <button type="button" className="text-left" onClick={() => setDetail(row.id)}>
                  <p className="font-semibold text-slate-800 hover:text-brand-600">{row.name}</p>
                  <p className="text-xs text-slate-500">{row.phone || row.email || 'No contact'}</p>
                </button>
              ),
            },
            {
              key: 'course',
              label: 'Service / interest',
              render: (row) => <span className="text-slate-600">{row.course || '—'}</span>,
            },
            { key: 'source', label: 'Source', render: (row) => <Badge status={row.source} /> },
            {
              key: 'status',
              label: 'Status',
              render: (row) => (
                <select
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold"
                  value={row.status}
                  onChange={(event) => changeStatus(row, event.target.value)}
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {titleCase(status)}
                    </option>
                  ))}
                </select>
              ),
            },
            {
              key: 'assignee',
              label: 'Assignee',
              render: (row) =>
                isBusinessAdmin ? (
                  <select
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                    value={row.assigneeId?._id || ''}
                    onChange={(event) => assign(row, event.target.value)}
                  >
                    <option value=""><Tx>Unassigned</Tx></option>
                    {(team || []).map((member) => (
                      <option key={member._id} value={member._id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-slate-500">{row.assigneeId?.name || '—'}</span>
                ),
            },
            {
              key: 'createdAt',
              label: 'Created',
              render: (row) => <span className="text-xs text-slate-500">{fromNow(row.createdAt)}</span>,
            },
            {
              key: 'actions',
              label: '',
              render: (row) => (
                <div className="flex justify-end gap-1">
                  <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setDetail(row.id)}>
                    <StickyNote size={14} />
                  </button>
                  <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => openEdit(row)}>
                    Edit
                  </button>
                  {isBusinessAdmin ? (
                    <button type="button" className="btn-ghost px-2 py-1 text-xs text-rose-600" onClick={() => remove(row)}>
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </div>
              ),
            },
          ]}
          empty={<EmptyState title="No leads found" description="Try a different filter, or add your first lead." />}
        />
        <Pagination meta={meta} onPage={(page) => setFilters({ ...filters, page })} />
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit lead' : 'Add lead'}
        description="Duplicate phone numbers are merged into the existing lead automatically."
        size="lg"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="lead-form" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save lead'}
            </button>
          </>
        }
      >
        <form id="lead-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <input className="input" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="Phone" hint="10-digit mobile number, used for calls and WhatsApp.">
            <input className="input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </Field>
          <Field label="Email">
            <input className="input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </Field>
          <Field label="Service / interest" hint="What the customer asked about.">
            <input className="input" value={form.course} onChange={(event) => setForm({ ...form, course: event.target.value })} />
          </Field>
          <Field label="Source" hint="Where this enquiry came from.">
            <select className="input" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })}>
              {SOURCES.map((source) => (
                <option key={source} value={source}>
                  {titleCase(source)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status" hint="Current stage of your follow-up.">
            <select className="input" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {titleCase(status)}
                </option>
              ))}
            </select>
          </Field>
          {isBusinessAdmin ? (
            <Field label="Assign to" hint="Staff member responsible for this lead.">
              <select className="input" value={form.assigneeId} onChange={(event) => setForm({ ...form, assigneeId: event.target.value })}>
                <option value=""><Tx>Unassigned</Tx></option>
                {(team || []).map((member) => (
                  <option key={member._id} value={member._id}>
                    {member.name} · {titleCase(member.role)}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Follow-up date" hint="Date for the next follow-up call.">
            <input className="input" type="date" value={form.followUpDate} onChange={(event) => setForm({ ...form, followUpDate: event.target.value })} />
          </Field>
          <Field label="Note" className="sm:col-span-2" hint="Anything the next person should know before calling.">
            <textarea className="input" rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </Field>
        </form>
      </Modal>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detailFetch.data?.lead?.name || 'Lead details'}
        description={detailFetch.data?.lead?.phone || ''}
        size="lg"
      >
        {detailFetch.loading ? (
          <Spinner />
        ) : detailFetch.data ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['Status', titleCase(detailFetch.data.lead.status)],
                ['Service / interest', detailFetch.data.lead.course || '—'],
                ['Source', titleCase(detailFetch.data.lead.source)],
                ['Assignee', detailFetch.data.lead.assigneeId?.name || 'Unassigned'],
                ['Follow-up', detailFetch.data.lead.followUpDate ? dateTime(detailFetch.data.lead.followUpDate, { timeStyle: undefined }) : '—'],
                ['Created', dateTime(detailFetch.data.lead.createdAt)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                  <p className="text-sm font-medium text-slate-700">{value}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Tx>Activity</Tx></p>
              <div className="space-y-2">
                {(detailFetch.data.lead.notes || []).slice().reverse().map((entry, index) => (
                  <div key={`${entry.at}-${index}`} className="rounded-xl border border-slate-100 px-3 py-2">
                    <p className="text-sm text-slate-700">{entry.text}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {entry.byName || 'System'} · {fromNow(entry.at)}
                    </p>
                  </div>
                ))}
                {!detailFetch.data.lead.notes?.length ? <p className="text-sm text-slate-500"><Tx>No notes yet.</Tx></p> : null}
              </div>
              <div className="mt-3 flex gap-2">
                <input className="input" placeholder={t('Add a note…')} value={note} onChange={(event) => setNote(event.target.value)} />
                <button type="button" className="btn-primary" onClick={addNote}>
                  Add
                </button>
              </div>
            </div>

            {detailFetch.data.appointments?.length ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Tx>Appointments</Tx></p>
                <ul className="space-y-1 text-sm text-slate-600">
                  {detailFetch.data.appointments.map((appointment) => (
                    <li key={appointment._id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
                      <span>{dateTime(appointment.startAt)}</span>
                      <Badge status={appointment.status} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {isBusinessAdmin ? (
              <div className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2">
                <UserCheck size={16} className="text-slate-400" />
                <span className="text-xs font-semibold text-slate-500"><Tx>Assign</Tx></span>
                <select
                  className="input mt-0 flex-1"
                  value={detailFetch.data.lead.assigneeId?._id || ''}
                  onChange={(event) => {
                    assign(detailFetch.data.lead, event.target.value);
                    detailFetch.reload();
                  }}
                >
                  <option value=""><Tx>Unassigned</Tx></option>
                  {(team || []).map((member) => (
                    <option key={member._id} value={member._id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
