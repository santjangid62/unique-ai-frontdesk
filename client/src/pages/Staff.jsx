import { useState } from 'react';
import { Plus, UserCog } from 'lucide-react';
import api, { errorMessage } from '../lib/api.js';
import useFetch from '../lib/useFetch.js';
import { Alert, Badge, Card, EmptyState, Field, Modal, PageHeader, PhoneInput, Spinner, Table, Tx } from '../components/ui.jsx';
import { useI18n } from '../i18n/index.jsx';
import { fromNow, titleCase } from '../lib/format.js';

const empty = { name: '', email: '', password: '', phone: '', designation: '', role: 'staff' };

export default function Staff() {
  const { t } = useI18n();
  const { data, loading, error: loadError, reload } = useFetch('/users');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/users', form);
      setOpen(false);
      setForm(empty);
      reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (member) => {
    try {
      await api.put(`/users/${member.id}`, { isActive: !member.isActive });
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Team"
        title="Staff Management"
        subtitle="Staff see only leads assigned to them, their conversations and their appointments."
        actions={
          <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
            <Plus size={16} /> {t('Add team member')}
          </button>
        }
      />

      {error || loadError ? (
        <div className="mb-4">
          <Alert>{error || loadError}</Alert>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        {loading ? (
          <Spinner />
        ) : !data?.length ? (
          <EmptyState icon={UserCog} title="No team members" />
        ) : (
          <Table
            rows={data}
            columns={[
              {
                key: 'name',
                label: 'Member',
                render: (row) => (
                  <div>
                    <p className="font-semibold text-slate-800">{row.name}</p>
                    <p className="text-xs text-slate-500">{row.email}</p>
                  </div>
                ),
              },
              { key: 'designation', label: 'Role', render: (row) => <span className="text-xs text-slate-600">{row.designation || titleCase(row.role)}</span> },
              { key: 'role', label: 'Access', render: (row) => <Badge status={row.role === 'business_admin' ? 'active' : 'website'}>{titleCase(row.role)}</Badge> },
              { key: 'leads', label: 'Assigned leads', render: (row) => <span className="text-xs text-slate-600">{row.assignedLeads || 0}</span> },
              { key: 'lastLoginAt', label: 'Last login', render: (row) => <span className="text-xs text-slate-500">{row.lastLoginAt ? fromNow(row.lastLoginAt) : 'Never'}</span> },
              {
                key: 'status',
                label: 'Status',
                render: (row) => <Badge status={row.isActive ? 'active' : 'inactive'}>{row.isActive ? 'Active' : 'Disabled'}</Badge>,
              },
              {
                key: 'actions',
                label: '',
                render: (row) => (
                  <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => toggle(row)}>
                    {row.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add team member"
        description="They can sign in immediately with the password you set."
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              {t('Cancel')}
            </button>
            <button type="submit" form="staff-form" className="btn-primary" disabled={busy}>
              {busy ? t('Creating…') : t('Create member')}
            </button>
          </>
        }
      >
        <form id="staff-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {error && open ? (
            <div className="sm:col-span-2">
              <Alert>{error}</Alert>
            </div>
          ) : null}
          <Field label="Full name">
            <input className="input" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="Email" hint="They will sign in with this email.">
            <input className="input" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </Field>
          <Field label="Password" hint="Minimum 8 characters with a number.">
            <input className="input" type="password" required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          </Field>
          <Field label="Phone" hint="Used for assignment notifications.">
            <PhoneInput value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
          </Field>
          <Field label="Designation" hint="Shown next to their name across the app.">
            <input className="input" placeholder="Counsellor" value={form.designation} onChange={(event) => setForm({ ...form, designation: event.target.value })} />
          </Field>
          <Field label="Access level" hint="Staff see only work assigned to them; business admins manage everything.">
            <select className="input" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              <option value="staff"><Tx>Staff (assigned work only)</Tx></option>
              <option value="business_admin"><Tx>Business admin (full access)</Tx></option>
            </select>
          </Field>
        </form>
      </Modal>
    </div>
  );
}
