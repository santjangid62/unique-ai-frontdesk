import { useState } from 'react';
import { Bot, FlaskConical, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import api, { errorMessage } from '../lib/api.js';
import useFetch from '../lib/useFetch.js';
import { Alert, Badge, Card, EmptyState, Field, Modal, PageHeader, Spinner, Tx } from '../components/ui.jsx';
import { titleCase } from '../lib/format.js';

const empty = {
  name: '',
  description: '',
  greeting: 'Namaste! Welcome to our institute. How can I help you today?',
  personality: 'Warm, helpful and concise',
  tone: 'friendly',
  language: 'English',
  voice: 'female-neutral',
  instructions:
    'Answer only from the knowledge base. Offer a free demo class when a student shows interest. Escalate fee negotiations and complaints to the team.',
  channels: { website: true, whatsapp: false, voice: false },
  handoff: { enabled: true, transferNumber: '' },
  isActive: true,
  isDefault: false,
};

export default function Agents() {
  const { data: agents, loading, error: loadError, reload } = useFetch('/ai-agents');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [testOpen, setTestOpen] = useState(null);
  const [testMessage, setTestMessage] = useState('What is the fee for the Python course?');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setForm(empty);
    setError('');
    setOpen(true);
  };

  const openEdit = (agent) => {
    setEditing(agent);
    setForm({
      name: agent.name,
      description: agent.description || '',
      greeting: agent.greeting || '',
      personality: agent.personality || '',
      tone: agent.tone || 'friendly',
      language: agent.language || 'English',
      voice: agent.voice || 'female-neutral',
      instructions: agent.instructions || '',
      channels: { website: true, whatsapp: false, voice: false, ...agent.channels },
      handoff: { enabled: true, transferNumber: '', ...agent.handoff },
      isActive: agent.isActive !== false,
      isDefault: Boolean(agent.isDefault),
    });
    setError('');
    setOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (editing) await api.put(`/ai-agents/${editing.id}`, form);
      else await api.post('/ai-agents', form);
      setOpen(false);
      reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (agent) => {
    if (!window.confirm(`Remove ${agent.name}?`)) return;
    try {
      await api.delete(`/ai-agents/${agent.id}`);
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const runTest = async (event) => {
    event.preventDefault();
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await api.post(`/ai-agents/${testOpen.id}/test`, { message: testMessage });
      setTestResult(data.data);
    } catch (err) {
      setTestResult({ reply: errorMessage(err), escalate: true, error: true });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="AI configuration"
        title="AI Receptionist"
        subtitle="Design how your receptionist speaks, what it may answer, and when it should bring in a human."
        actions={
          <button type="button" className="btn-primary" onClick={openCreate}>
            <Plus size={16} /> New agent
          </button>
        }
      />

      {error || loadError ? (
        <div className="mb-4">
          <Alert>{error || loadError}</Alert>
        </div>
      ) : null}

      {loading ? (
        <Spinner />
      ) : !agents?.length ? (
        <Card>
          <EmptyState
            icon={Bot}
            title="No AI agent yet"
            description="Create your first receptionist to start answering enquiries."
            action={
              <button type="button" className="btn-primary" onClick={openCreate}>
                Create agent
              </button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {agents.map((agent) => (
            <Card key={agent.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                    <Bot size={20} />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-bold text-slate-900">{agent.name}</h2>
                      {agent.isDefault ? <span className="chip bg-brand-50 text-brand-700"><Tx>Default</Tx></span> : null}
                      <Badge status={agent.isActive ? 'active' : 'inactive'}>{agent.isActive ? 'Active' : 'Paused'}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{agent.description || 'No description'}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-3">
                <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400"><Tx>Tone</Tx></p>
                  <p className="font-semibold">{titleCase(agent.tone)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400"><Tx>Language</Tx></p>
                  <p className="font-semibold">{agent.language}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400"><Tx>Voice</Tx></p>
                  <p className="font-semibold">{agent.voice}</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {Object.entries(agent.channels || {})
                  .filter(([, enabled]) => enabled)
                  .map(([channel]) => (
                    <Badge key={channel} status={channel}>
                      {titleCase(channel)}
                    </Badge>
                  ))}
              </div>

              <p className="mt-3 line-clamp-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span className="font-semibold text-slate-700">Greeting: </span>
                {agent.greeting}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary px-3 py-1.5 text-xs"
                  onClick={() => {
                    setTestOpen(agent);
                    setTestResult(null);
                  }}
                >
                  <FlaskConical size={14} /> Test agent
                </button>
                <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => openEdit(agent)}>
                  <Pencil size={14} /> Edit
                </button>
                <button type="button" className="btn-ghost px-3 py-1.5 text-xs text-rose-600" onClick={() => remove(agent)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit AI agent' : 'New AI agent'}
        description="Instructions are combined with your verified knowledge base on every reply."
        size="lg"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="agent-form" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save agent'}
            </button>
          </>
        }
      >
        {error && open ? (
          <div className="mb-3">
            <Alert>{error}</Alert>
          </div>
        ) : null}
        <form id="agent-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Agent name" className="sm:col-span-2" hint="A short name your team will recognise.">
            <input className="input" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="Description" className="sm:col-span-2" hint="One line about what this agent handles.">
            <input className="input" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </Field>
          <Field label="Greeting" className="sm:col-span-2" hint="The first message a customer sees. Keep it short and friendly.">
            <textarea className="input" rows={2} value={form.greeting} onChange={(event) => setForm({ ...form, greeting: event.target.value })} />
          </Field>
          <Field label="Tone" hint="How the AI sounds in every reply.">
            <select className="input" value={form.tone} onChange={(event) => setForm({ ...form, tone: event.target.value })}>
              {['friendly', 'professional', 'enthusiastic'].map((tone) => (
                <option key={tone} value={tone}>
                  {titleCase(tone)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Language" hint="Language the AI replies in. Pick Hinglish for mixed Hindi-English customers.">
            <select className="input" value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })}>
              {['English', 'Hindi', 'Hinglish'].map((language) => (
                <option key={language} value={language}>
                  {language}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Personality" hint="A few words that guide the AI's style.">
            <input className="input" value={form.personality} onChange={(event) => setForm({ ...form, personality: event.target.value })} />
          </Field>
          <Field label="Voice profile" hint="Used for AI phone calls. Pick the voice that fits your brand.">
            <select className="input" value={form.voice} onChange={(event) => setForm({ ...form, voice: event.target.value })}>
              {['female-neutral', 'male-neutral', 'female-warm', 'male-deep'].map((voice) => (
                <option key={voice} value={voice}>
                  {voice}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Business instructions"
            className="sm:col-span-2"
            hint="Rules the AI must follow: what to offer, what to avoid, and when to hand over to a human. Never promise fees or policies you have not added to the Knowledge Base."
          >
            <textarea
              className="input"
              rows={4}
              value={form.instructions}
              onChange={(event) => setForm({ ...form, instructions: event.target.value })}
            />
          </Field>
          <Field label="Enabled channels" className="sm:col-span-2" hint="Where this agent answers. Website chat works right away; WhatsApp and voice need setup.">
            <div className="flex flex-wrap gap-4">
              {['website', 'whatsapp', 'voice'].map((channel) => (
                <label key={channel} className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-brand-600"
                    checked={Boolean(form.channels?.[channel])}
                    onChange={(event) =>
                      setForm({ ...form, channels: { ...form.channels, [channel]: event.target.checked } })
                    }
                  />
                  {titleCase(channel)}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Transfer number (human handoff)" hint="Chats and calls are handed to this number when a customer asks for a human.">
            <input
              className="input"
              placeholder="+91 98290 11223"
              value={form.handoff?.transferNumber || ''}
              onChange={(event) => setForm({ ...form, handoff: { ...form.handoff, transferNumber: event.target.value } })}
            />
          </Field>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
                checked={form.isActive}
                onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
              />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
                checked={form.isDefault}
                onChange={(event) => setForm({ ...form, isDefault: event.target.checked })}
              />
              Default agent
            </label>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(testOpen)}
        onClose={() => setTestOpen(null)}
        title={`Playground · ${testOpen?.name || ''}`}
        description="Test answers against your knowledge base. Nothing is saved and no lead is created."
      >
        <form onSubmit={runTest} className="space-y-3">
          <Field label="Ask a customer question">
            <textarea className="input" rows={3} value={testMessage} onChange={(event) => setTestMessage(event.target.value)} />
          </Field>
          <button type="submit" className="btn-primary w-full" disabled={testing}>
            {testing ? 'Thinking…' : 'Run test'}
          </button>
        </form>

        {testResult ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl bg-slate-900 px-4 py-3 text-sm text-white">
              <p className="whitespace-pre-wrap">{testResult.reply}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="chip bg-slate-100 text-slate-600">Mode: {testResult.mode || 'fallback'}</span>
              {testResult.intent ? <span className="chip bg-slate-100 text-slate-600">Intent: {titleCase(testResult.intent)}</span> : null}
              {testResult.confidence !== undefined ? (
                <span className="chip bg-slate-100 text-slate-600">Confidence: {Math.round((testResult.confidence || 0) * 100)}%</span>
              ) : null}
              {testResult.escalate ? <span className="chip bg-rose-50 text-rose-700"><Tx>Would escalate</Tx></span> : null}
            </div>
            {testResult.knowledgeUsed?.length ? (
              <div className="rounded-xl border border-slate-100 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400"><Tx>Knowledge used</Tx></p>
                <ul className="mt-1 space-y-1 text-xs text-slate-600">
                  {testResult.knowledgeUsed.map((item) => (
                    <li key={item.title}>
                      {item.title} <span className="text-slate-400">(score {item.score})</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <Sparkles size={12} className="mr-1 inline" />
                No knowledge matched. Add an entry so the AI can answer without guessing.
              </p>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
