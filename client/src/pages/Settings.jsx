import { useEffect, useState } from 'react';
import { BookOpen, Plus, Save, Trash2, Plug } from 'lucide-react';
import api, { errorMessage } from '../lib/api.js';
import useFetch from '../lib/useFetch.js';
import { Alert, Badge, Card, Field, PageHeader, Spinner } from '../components/ui.jsx';
import { titleCase } from '../lib/format.js';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Settings() {
  const { data: profile, loading, error: loadError, reload } = useFetch('/business/profile');
  const { data: integrations, reload: reloadIntegrations } = useFetch('/integrations');
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [providerForm, setProviderForm] = useState({});

  useEffect(() => {
    if (!profile) return;
    setForm({
      name: profile.name || '',
      description: profile.description || '',
      phone: profile.phone || '',
      email: profile.email || '',
      website: profile.website || '',
      address: profile.address || '',
      city: profile.city || '',
      state: profile.state || '',
      country: profile.country || 'India',
      mapUrl: profile.mapUrl || '',
      openingTime: profile.openingTime || '09:00',
      closingTime: profile.closingTime || '19:00',
      workingDays: profile.workingDays || [],
      languages: (profile.languages || []).join(', '),
      demoAvailable: profile.coaching?.demoAvailable !== false,
      admissionProcess: profile.coaching?.admissionProcess || '',
      placementInfo: profile.coaching?.placementInfo || '',
      courses: profile.coaching?.courses || [],
      holidays: profile.holidays || [],
    });
  }, [profile]);

  const updateCourse = (index, patch) => {
    setForm((prev) => ({
      ...prev,
      courses: prev.courses.map((course, position) => (position === index ? { ...course, ...patch } : course)),
    }));
  };

  const addCourse = () => {
    setForm((prev) => ({
      ...prev,
      courses: [
        ...prev.courses,
        { name: '', category: '', fee: 0, duration: '', batchTimings: [], mode: 'offline', syllabus: '', isActive: true },
      ],
    }));
  };

  const removeCourse = (index) => {
    setForm((prev) => ({ ...prev, courses: prev.courses.filter((_, position) => position !== index) }));
  };

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.put('/business/profile', {
        name: form.name,
        description: form.description,
        phone: form.phone,
        email: form.email,
        website: form.website,
        address: form.address,
        city: form.city,
        state: form.state,
        country: form.country,
        mapUrl: form.mapUrl,
        openingTime: form.openingTime,
        closingTime: form.closingTime,
        workingDays: form.workingDays,
        languages: form.languages.split(',').map((language) => language.trim()).filter(Boolean),
        holidays: form.holidays,
        coaching: {
          courses: form.courses.map((course) => ({
            ...course,
            fee: Number(course.fee) || 0,
            batchTimings: Array.isArray(course.batchTimings)
              ? course.batchTimings
              : String(course.batchTimings || '').split(',').map((timing) => timing.trim()).filter(Boolean),
          })),
          demoAvailable: form.demoAvailable,
          admissionProcess: form.admissionProcess,
          placementInfo: form.placementInfo,
        },
      });
      setNotice('Business profile saved. The AI uses this information immediately.');
      reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const saveIntegration = async (provider, config) => {
    setError('');
    try {
      await api.put(`/integrations/${provider}`, { status: 'connected', config });
      setProviderForm((prev) => ({ ...prev, [provider]: {} }));
      reloadIntegrations();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const checkIntegration = async (provider) => {
    try {
      await api.post(`/integrations/${provider}/check`);
      reloadIntegrations();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (loading || !form) return <Spinner label="Loading business profile…" />;
  if (loadError) return <Alert>{loadError}</Alert>;

  return (
    <div>
      <PageHeader
        eyebrow="Configuration"
        title="Business Settings"
        subtitle="These details are given to the AI on every reply, so keep them accurate."
        actions={
          <>
            <a
              href="https://github.com/santjangid62/unique-ai-frontdesk/blob/main/docs/AI_TRAINING_GUIDE.md"
              target="_blank"
              rel="noreferrer"
              className="btn-secondary"
              title="Step-by-step guide to training the AI for your business"
            >
              <BookOpen size={16} /> Training guide
            </a>
            <button type="submit" form="profile-form" className="btn-primary" disabled={busy}>
              <Save size={16} /> {busy ? 'Saving…' : 'Save changes'}
            </button>
          </>
        }
      />

      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {notice ? <div className="mb-4"><Alert tone="success">{notice}</Alert></div> : null}

      <form id="profile-form" onSubmit={save} className="space-y-5">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Business profile</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name" className="sm:col-span-2">
              <input className="input" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </Field>
            <Field label="About the business" className="sm:col-span-2" hint="Used by the AI to introduce your institute.">
              <textarea className="input" rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </Field>
            <Field label="Phone">
              <input className="input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </Field>
            <Field label="Website">
              <input className="input" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} />
            </Field>
            <Field label="Google Maps link">
              <input className="input" value={form.mapUrl} onChange={(event) => setForm({ ...form, mapUrl: event.target.value })} />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <input className="input" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
            </Field>
            <Field label="City">
              <input className="input" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
            </Field>
            <Field label="State">
              <input className="input" value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} />
            </Field>
            <Field label="Opening time">
              <input className="input" type="time" value={form.openingTime} onChange={(event) => setForm({ ...form, openingTime: event.target.value })} />
            </Field>
            <Field label="Closing time">
              <input className="input" type="time" value={form.closingTime} onChange={(event) => setForm({ ...form, closingTime: event.target.value })} />
            </Field>
            <Field label="Working days" className="sm:col-span-2">
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day) => {
                  const active = form.workingDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          workingDays: active ? form.workingDays.filter((value) => value !== day) : [...form.workingDays, day],
                        })
                      }
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                        active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Supported languages" hint="Comma separated">
              <input className="input" value={form.languages} onChange={(event) => setForm({ ...form, languages: event.target.value })} />
            </Field>
            <Field label="Demo classes">
              <label className="flex items-center gap-2 pt-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  checked={form.demoAvailable}
                  onChange={(event) => setForm({ ...form, demoAvailable: event.target.checked })}
                />
                Offer free demo classes
              </label>
            </Field>
            <Field label="Admission process" className="sm:col-span-2">
              <textarea className="input" rows={2} value={form.admissionProcess} onChange={(event) => setForm({ ...form, admissionProcess: event.target.value })} />
            </Field>
            <Field label="Placement assistance" className="sm:col-span-2">
              <textarea className="input" rows={2} value={form.placementInfo} onChange={(event) => setForm({ ...form, placementInfo: event.target.value })} />
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Courses</h2>
            <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={addCourse}>
              <Plus size={14} /> Add course
            </button>
          </div>
          {!form.courses.length ? (
            <p className="text-sm text-slate-500">No courses yet. Add your courses so the AI can answer fee and batch questions.</p>
          ) : (
            <div className="space-y-4">
              {form.courses.map((course, index) => (
                <div key={course._id || index} className="rounded-xl border border-slate-200 p-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Course name" className="sm:col-span-2">
                      <input className="input" value={course.name} onChange={(event) => updateCourse(index, { name: event.target.value })} />
                    </Field>
                    <Field label="Category">
                      <input className="input" value={course.category || ''} onChange={(event) => updateCourse(index, { category: event.target.value })} />
                    </Field>
                    <Field label="Fee (INR)">
                      <input className="input" type="number" value={course.fee || 0} onChange={(event) => updateCourse(index, { fee: event.target.value })} />
                    </Field>
                    <Field label="Duration">
                      <input className="input" value={course.duration || ''} onChange={(event) => updateCourse(index, { duration: event.target.value })} />
                    </Field>
                    <Field label="Mode">
                      <select className="input" value={course.mode || 'offline'} onChange={(event) => updateCourse(index, { mode: event.target.value })}>
                        {['offline', 'online', 'hybrid'].map((mode) => (
                          <option key={mode} value={mode}>
                            {titleCase(mode)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Batch timings" hint="Comma separated" className="sm:col-span-2">
                      <input
                        className="input"
                        value={Array.isArray(course.batchTimings) ? course.batchTimings.join(', ') : course.batchTimings || ''}
                        onChange={(event) => updateCourse(index, { batchTimings: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })}
                      />
                    </Field>
                    <Field label="Syllabus" className="sm:col-span-3 lg:col-span-4">
                      <textarea className="input" rows={2} value={course.syllabus || ''} onChange={(event) => updateCourse(index, { syllabus: event.target.value })} />
                    </Field>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button type="button" className="btn-ghost px-2 py-1 text-xs text-rose-600" onClick={() => removeCourse(index)}>
                      <Trash2 size={14} /> Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </form>

      <Card className="mt-5 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Plug size={18} className="text-brand-600" />
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Channel integrations</h2>
            <p className="text-xs text-slate-500">
              Credentials are stored per business and never returned in full. Webhooks are signature-verified.
            </p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {(integrations || []).map((integration) => (
            <div key={integration.provider} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">{titleCase(integration.provider)}</h3>
                <Badge status={integration.status} />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {integration.requires.length ? `Needs: ${integration.requires.join(', ')}` : 'No configuration required'}
              </p>
              {integration.provider === 'openai' ? (
                <p className="mt-2 text-xs text-slate-500">
                  Platform AI key: {integration.platformConfigured ? 'configured' : 'not configured (grounded fallback active)'}
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {integration.requires.slice(0, 2).map((key) => (
                    <input
                      key={key}
                      className="input text-xs"
                      placeholder={`${titleCase(key)}${integration.config?.[key] ? ' (saved)' : ''}`}
                      value={providerForm[integration.provider]?.[key] || ''}
                      onChange={(event) =>
                        setProviderForm((prev) => ({
                          ...prev,
                          [integration.provider]: { ...(prev[integration.provider] || {}), [key]: event.target.value },
                        }))
                      }
                    />
                  ))}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-primary flex-1 px-2 py-1.5 text-xs"
                      disabled={!Object.keys(providerForm[integration.provider] || {}).length}
                      onClick={() => saveIntegration(integration.provider, providerForm[integration.provider] || {})}
                    >
                      Save
                    </button>
                    <button type="button" className="btn-secondary px-2 py-1.5 text-xs" onClick={() => checkIntegration(integration.provider)}>
                      Check
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
