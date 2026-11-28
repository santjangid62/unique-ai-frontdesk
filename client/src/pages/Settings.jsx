import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Plus, Save, Trash2, Plug, Sparkles, Bot } from 'lucide-react';
import api, { errorMessage } from '../lib/api.js';
import useFetch from '../lib/useFetch.js';
import { Alert, Badge, Card, Field, Modal, PageHeader, Spinner } from '../components/ui.jsx';
import { titleCase } from '../lib/format.js';
import { useI18n } from '../i18n/index.jsx';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Settings() {
  const { t } = useI18n();
  const { data: profile, loading, error: loadError, reload } = useFetch('/business/profile');
  const { data: integrations, reload: reloadIntegrations } = useFetch('/integrations');
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [providerForm, setProviderForm] = useState({});
  const [aiOpen, setAiOpen] = useState(false);
  const [aiProvider, setAiProvider] = useState(null);
  const [aiStep, setAiStep] = useState(0);
  const [aiValues, setAiValues] = useState({});
  const [aiInput, setAiInput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessages, setAiMessages] = useState([]);

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
      const response = await api.put(`/integrations/${provider}`, { status: 'connected', config });
      setProviderForm((prev) => ({ ...prev, [provider]: {} }));
      reloadIntegrations();
      return response.data?.data;
    } catch (err) {
      setError(errorMessage(err));
      throw err;
    }
  };

  const checkIntegration = async (provider) => {
    try {
      const response = await api.post(`/integrations/${provider}/check`);
      reloadIntegrations();
      return response.data?.data;
    } catch (err) {
      setError(errorMessage(err));
      throw err;
    }
  };

  const integrationFor = (provider) => (integrations || []).find((item) => item.provider === provider);

  const openAiAssist = (provider) => {
    const integration = integrationFor(provider);
    const required = integration?.requires || [];
    setAiProvider(provider);
    setAiOpen(true);
    setAiStep(0);
    setAiValues({});
    setAiInput('');
    setAiMessages([
      {
        from: 'ai',
        text:
          required.length === 0
            ? `I can set up ${provider} for you. No extra fields are needed — click "Finish" to mark it connected.`
            : `I'll set up ${provider} for you. I need ${required.length} value${required.length > 1 ? 's' : ''}: ${required.join(', ')}. Let's start with ${required[0]}.`,
      },
    ]);
  };

  const closeAiAssist = () => {
    setAiOpen(false);
    setAiProvider(null);
    setAiStep(0);
    setAiValues({});
    setAiInput('');
    setAiMessages([]);
  };

  const isOptionalField = (provider, field) => provider === 'openai' && field === 'apiKey';

  const submitAiStep = async (skip = false) => {
    if (!aiProvider) return;
    const integration = integrationFor(aiProvider);
    const required = integration?.requires || [];
    const field = required[aiStep];
    const value = skip ? '' : aiInput.trim();
    if (field && !value && !isOptionalField(aiProvider, field) && !skip) return;
    const nextValues = field && value ? { ...aiValues, [field]: value } : aiValues;
    setAiValues(nextValues);
    setAiInput('');
    const userMsg = field ? { from: 'user', text: skip ? 'Skip' : value } : { from: 'user', text: 'Finish' };
    if (aiStep + 1 >= required.length) {
      setAiBusy(true);
      setAiMessages((prev) => [...prev, userMsg, { from: 'ai', text: 'Saving your credentials…' }]);
      try {
        await saveIntegration(aiProvider, nextValues);
        const result = await checkIntegration(aiProvider);
        setAiMessages((prev) => [
          ...prev,
          {
            from: 'ai',
            text:
              result?.status === 'connected'
                ? `Done! ${aiProvider} is now connected. You can close this window.`
                : `Saved, but ${aiProvider} still needs: ${(result?.missing || []).join(', ') || 'more details'}. You can add it later from the fields below.`,
          },
        ]);
      } catch (err) {
        setAiMessages((prev) => [...prev, { from: 'ai', text: `Something went wrong: ${err?.message || 'unknown error'}. Try again.` }]);
      } finally {
        setAiBusy(false);
      }
      setAiStep(required.length);
    } else {
      setAiMessages((prev) => [
        ...prev,
        userMsg,
        { from: 'ai', text: `Got it. Now please enter ${required[aiStep + 1]}.` },
      ]);
      setAiStep(aiStep + 1);
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
            <Link
              to="/app/guide"
              className="btn-secondary"
              title={t('Step-by-step guide to training the AI for your business')}
            >
              <BookOpen size={16} /> {t('Training guide')}
            </Link>
            <button type="submit" form="profile-form" className="btn-primary" disabled={busy}>
              <Save size={16} /> {busy ? t('Saving…') : t('Save changes')}
            </button>
          </>
        }
      />

      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {notice ? <div className="mb-4"><Alert tone="success">{notice}</Alert></div> : null}

      <form id="profile-form" onSubmit={save} className="space-y-5">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">{t('Business profile')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name" className="sm:col-span-2" hint="Shown to customers and used when the AI introduces your business.">
              <input className="input" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </Field>
            <Field
              label="About the business"
              className="sm:col-span-2"
              hint="Two or three lines about what you do. The AI uses this to introduce your business."
            >
              <textarea className="input" rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </Field>
            <Field label="Phone" hint="The number the AI shares with customers.">
              <input className="input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </Field>
            <Field label="Email" hint="The address the AI gives customers who ask for email.">
              <input className="input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </Field>
            <Field label="Website" hint="Shared when a customer asks for your website.">
              <input className="input" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} />
            </Field>
            <Field label="Google Maps link" hint="Paste your Google Maps share link so the AI can send directions.">
              <input className="input" value={form.mapUrl} onChange={(event) => setForm({ ...form, mapUrl: event.target.value })} />
            </Field>
            <Field label="Address" className="sm:col-span-2" hint="Full address the AI can share, including a landmark.">
              <input className="input" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
            </Field>
            <Field label="City">
              <input className="input" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
            </Field>
            <Field label="State">
              <input className="input" value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} />
            </Field>
            <Field label="Opening time" hint="The AI only offers appointments within your working hours.">
              <input className="input" type="time" value={form.openingTime} onChange={(event) => setForm({ ...form, openingTime: event.target.value })} />
            </Field>
            <Field label="Closing time">
              <input className="input" type="time" value={form.closingTime} onChange={(event) => setForm({ ...form, closingTime: event.target.value })} />
            </Field>
            <Field label="Working days" className="sm:col-span-2" hint="Days you are open. Closed days are never offered for appointments.">
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
            <Field label="Supported languages" hint="Languages the AI can reply in, comma separated.">
              <input className="input" value={form.languages} onChange={(event) => setForm({ ...form, languages: event.target.value })} />
            </Field>
            <Field label="Free trial / demo">
              <label className="flex items-center gap-2 pt-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  checked={form.demoAvailable}
                  onChange={(event) => setForm({ ...form, demoAvailable: event.target.checked })}
                />
                {t('Offer a free trial or demo')}
              </label>
            </Field>
            <Field label="Next steps after enquiry" className="sm:col-span-2" hint="Steps a customer follows after showing interest. The AI explains these when asked.">
              <textarea className="input" rows={2} value={form.admissionProcess} onChange={(event) => setForm({ ...form, admissionProcess: event.target.value })} />
            </Field>
            <Field label="Additional support" className="sm:col-span-2" hint="Any guarantee, after-sales help or extra service you offer. The AI shares this when asked.">
              <textarea className="input" rows={2} value={form.placementInfo} onChange={(event) => setForm({ ...form, placementInfo: event.target.value })} />
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">{t('Courses')}</h2>
            <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={addCourse}>
              <Plus size={14} /> {t('Add course')}
            </button>
          </div>
          <p className="mb-4 text-xs text-slate-500">
            {t('Add every course with its fee and batch timings — the AI answers fee, duration and batch questions from here.')}
          </p>
          {!form.courses.length ? (
            <p className="text-sm text-slate-500">No courses yet. Add your courses so the AI can answer fee and batch questions.</p>
          ) : (
            <div className="space-y-4">
              {form.courses.map((course, index) => (
                <div key={course._id || index} className="rounded-xl border border-slate-200 p-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Course name" className="sm:col-span-2" hint="Name as customers know it.">
                      <input className="input" value={course.name} onChange={(event) => updateCourse(index, { name: event.target.value })} />
                    </Field>
                    <Field label="Category">
                      <input className="input" value={course.category || ''} onChange={(event) => updateCourse(index, { category: event.target.value })} />
                    </Field>
                    <Field label="Fee (INR)" hint="Total fee as you quote it.">
                      <input className="input" type="number" value={course.fee || 0} onChange={(event) => updateCourse(index, { fee: event.target.value })} />
                    </Field>
                    <Field label="Duration" hint="For example: 3 months.">
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
                    <Field label="Batch timings" hint="Comma separated, for example: 7 AM, 6 PM." className="sm:col-span-2">
                      <input
                        className="input"
                        value={Array.isArray(course.batchTimings) ? course.batchTimings.join(', ') : course.batchTimings || ''}
                        onChange={(event) => updateCourse(index, { batchTimings: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })}
                      />
                    </Field>
                    <Field label="Syllabus" className="sm:col-span-3 lg:col-span-4" hint="Short list of topics covered. The AI shares this when asked.">
                      <textarea className="input" rows={2} value={course.syllabus || ''} onChange={(event) => updateCourse(index, { syllabus: event.target.value })} />
                    </Field>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button type="button" className="btn-ghost px-2 py-1 text-xs text-rose-600" onClick={() => removeCourse(index)}>
                      <Trash2 size={14} /> {t('Remove')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </form>

      <Card className="mt-5 p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Plug size={18} className="text-brand-600" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{t('Channel integrations')}</h2>
              <p className="text-xs text-slate-500">
                {t('Credentials are stored per business and never returned in full. Webhooks are signature-verified.')}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-secondary px-3 py-1.5 text-xs"
            onClick={() => { setAiOpen(true); setAiProvider(null); setAiMessages([]); }}
            title="Setup wizard"
          >
            <Sparkles size={14} /> Setup wizard
          </button>
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
              ) : null}
              <div className="mt-2 space-y-2">
                {integration.requires.slice(0, 2).map((key) => (
                  <input
                    key={key}
                    className="input text-xs"
                    placeholder={`${titleCase(key)}${integration.provider === 'openai' ? ' (optional)' : ''}${integration.config?.[key] ? ' (saved)' : ''}`}
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
                    {t('Save')}
                  </button>
                  <button type="button" className="btn-secondary px-2 py-1.5 text-xs" onClick={() => checkIntegration(integration.provider)}>
                    {t('Check')}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Modal open={aiOpen} onClose={closeAiAssist} title="Setup wizard" description="I'll ask for each value and save it for you. Optional fields can be skipped." size="md">
        {!aiProvider ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">Which channel should I set up for you?</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(integrations || []).map((integration) => (
                <button
                  key={integration.provider}
                  type="button"
                  className="btn-secondary justify-start px-3 py-2 text-xs"
                  onClick={() => openAiAssist(integration.provider)}
                >
                  <Sparkles size={14} /> {titleCase(integration.provider)}
                  <span className="ml-auto text-[10px] text-slate-400">{integration.status}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-3">
              {aiMessages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.from === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs ${
                      message.from === 'user'
                        ? 'bg-brand-600 text-white'
                        : 'bg-white text-slate-700 shadow-sm'
                    }`}
                  >
                    {message.from === 'ai' ? <Bot size={12} className="mr-1 inline text-brand-600" /> : null}
                    {message.text}
                  </div>
                </div>
              ))}
            </div>
            {aiStep < (integrationFor(aiProvider)?.requires?.length || 0) ? (
              <div className="flex gap-2">
                <input
                  className="input text-xs"
                  placeholder={`Enter ${integrationFor(aiProvider).requires[aiStep]}${isOptionalField(aiProvider, integrationFor(aiProvider).requires[aiStep]) ? ' (optional)' : ''}`}
                  value={aiInput}
                  onChange={(event) => setAiInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') submitAiStep();
                  }}
                  disabled={aiBusy}
                />
                <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={() => submitAiStep(false)} disabled={aiBusy}>
                  Send
                </button>
                {isOptionalField(aiProvider, integrationFor(aiProvider).requires[aiStep]) ? (
                  <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => submitAiStep(true)} disabled={aiBusy}>
                    Skip
                  </button>
                ) : null}
              </div>
            ) : (
              <button type="button" className="btn-secondary w-full text-xs" onClick={closeAiAssist} disabled={aiBusy}>
                Close
              </button>
            )}
          </div>
        )}
      </Modal>

    </div>
  );
}
