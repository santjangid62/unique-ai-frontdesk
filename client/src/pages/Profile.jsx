import { useState } from 'react';
import { KeyRound, Save } from 'lucide-react';
import api, { errorMessage } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Alert, Card, Field, PageHeader, PhoneInput, Tx } from '../components/ui.jsx';
import { useI18n } from '../i18n/index.jsx';
import { titleCase } from '../lib/format.js';

export default function Profile() {
  const { t } = useI18n();
  const { user, tenant, refreshUser } = useAuth();
  const [form, setForm] = useState({ name: user?.name || '', phone: user?.phone || '', designation: user?.designation || '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [profileState, setProfileState] = useState({ busy: false, error: '', notice: '' });
  const [passwordState, setPasswordState] = useState({ busy: false, error: '', notice: '' });

  const saveProfile = async (event) => {
    event.preventDefault();
    setProfileState({ busy: true, error: '', notice: '' });
    try {
      await api.patch('/auth/me', form);
      await refreshUser();
      setProfileState({ busy: false, error: '', notice: 'Profile updated.' });
    } catch (err) {
      setProfileState({ busy: false, error: errorMessage(err), notice: '' });
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setPasswordState({ busy: true, error: '', notice: '' });
    try {
      await api.post('/auth/change-password', passwords);
      setPasswords({ currentPassword: '', newPassword: '' });
      setPasswordState({ busy: false, error: '', notice: 'Password changed. Other sessions were signed out.' });
    } catch (err) {
      setPasswordState({ busy: false, error: errorMessage(err), notice: '' });
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Account" title="My Profile" subtitle="Your personal details and sign-in security." />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-xl font-bold text-brand-700">
              {(user?.name || 'U').slice(0, 1).toUpperCase()}
            </span>
            <div>
              <p className="text-base font-bold text-slate-900">{user?.name}</p>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500"><Tx>Role</Tx></dt>
              <dd className="font-semibold text-slate-800">{titleCase(user?.role)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500"><Tx>Business</Tx></dt>
              <dd className="font-semibold text-slate-800">{tenant?.name || 'Platform'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500"><Tx>Plan</Tx></dt>
              <dd className="font-semibold text-slate-800">{tenant?.planCode ? titleCase(tenant.planCode) : '—'}</dd>
            </div>
          </dl>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-slate-900"><Tx>Personal details</Tx></h2>
          {profileState.error ? (
            <div className="mb-3">
              <Alert>{profileState.error}</Alert>
            </div>
          ) : null}
          {profileState.notice ? (
            <div className="mb-3">
              <Alert tone="success">{profileState.notice}</Alert>
            </div>
          ) : null}
          <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </Field>
            <Field label="Email" hint="Email cannot be changed here.">
              <input className="input" value={user?.email || ''} disabled />
            </Field>
            <Field label="Phone" hint="Optional contact number for your account.">
              <PhoneInput value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
            </Field>
            <Field label="Designation" hint="Shown to your team.">
              <input className="input" value={form.designation} onChange={(event) => setForm({ ...form, designation: event.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <button type="submit" className="btn-primary" disabled={profileState.busy}>
                <Save size={16} /> {profileState.busy ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          </form>
        </Card>
      </div>

      <Card className="mt-5 p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <KeyRound size={16} className="text-brand-600" /> Change password
        </h2>
        <p className="mb-4 text-xs text-slate-500"><Tx>Changing your password signs out all other sessions.</Tx></p>
        {passwordState.error ? (
          <div className="mb-3">
            <Alert>{passwordState.error}</Alert>
          </div>
        ) : null}
        {passwordState.notice ? (
          <div className="mb-3">
            <Alert tone="success">{passwordState.notice}</Alert>
          </div>
        ) : null}
        <form onSubmit={changePassword} className="grid gap-4 sm:grid-cols-2">
          <Field label="Current password">
            <input
              className="input"
              type="password"
              required
              value={passwords.currentPassword}
              onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })}
            />
          </Field>
          <Field label="New password" hint="Minimum 8 characters with a letter and a number.">
            <input
              className="input"
              type="password"
              required
              value={passwords.newPassword}
              onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-secondary" disabled={passwordState.busy}>
              {passwordState.busy ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
