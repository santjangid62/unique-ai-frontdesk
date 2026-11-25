import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, MessageSquareCode, Palette } from 'lucide-react';
import api, { errorMessage } from '../lib/api.js';
import useFetch from '../lib/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Alert, Card, Field, PageHeader, Spinner, Tx } from '../components/ui.jsx';

export default function ChatWidget() {
  const { tenant } = useAuth();
  const { data: profile, loading, error: loadError, reload } = useFetch('/business/profile');
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (profile) {
      setForm({
        primaryColor: profile.widget?.primaryColor || '#4f46e5',
        position: profile.widget?.position || 'right',
        welcomeMessage: profile.widget?.welcomeMessage || 'Hi! How can we help you today?',
        welcomeMessageHi: profile.widget?.welcomeMessageHi || '',
        showBranding: profile.widget?.showBranding !== false,
        isEnabled: profile.widget?.isEnabled !== false,
        demoAvailable: profile.coaching?.demoAvailable !== false,
      });
    }
  }, [profile]);

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.put('/business/profile', {
        widget: {
          primaryColor: form.primaryColor,
          position: form.position,
          welcomeMessage: form.welcomeMessage,
          welcomeMessageHi: form.welcomeMessageHi,
          showBranding: form.showBranding,
          isEnabled: form.isEnabled,
        },
        coaching: { ...(profile.coaching || {}), demoAvailable: form.demoAvailable },
      });
      setNotice('Widget settings saved.');
      reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const origin = window.location.origin;
  const slug = tenant?.slug || '';
  const embedCode = `<!-- Unique AI Frontdesk widget -->\n<script src="${origin}/api/public/widget/${slug}/embed.js" async></script>`;
  const directLink = `${origin}/chat/${slug}`;

  const copy = async (value, key) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(''), 1800);
    } catch {
      setError('Copy failed — select the code manually.');
    }
  };

  if (loading || !form) return <Spinner label="Loading widget settings…" />;
  if (loadError) return <Alert>{loadError}</Alert>;

  return (
    <div>
      <PageHeader
        eyebrow="Website channel"
        title="Website Chat Widget"
        subtitle="Match the widget to your brand, then paste one line of code on your website."
        actions={
          <a href={directLink} target="_blank" rel="noreferrer" className="btn-secondary">
            <ExternalLink size={16} /> Open live widget
          </a>
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4">
          <Alert tone="success">{notice}</Alert>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Palette size={18} className="text-brand-600" />
            <h2 className="text-sm font-semibold text-slate-900"><Tx>Appearance</Tx></h2>
          </div>
          <form onSubmit={save} className="space-y-4">
            <Field label="Welcome message">
              <textarea
                className="input"
                rows={3}
                value={form.welcomeMessage}
                onChange={(event) => setForm({ ...form, welcomeMessage: event.target.value })}
              />
            </Field>
            <Field label="Welcome message (Hindi)" hint="Shown to visitors viewing the chat in Hindi. Leave blank to show the English message.">
              <textarea
                className="input"
                rows={3}
                value={form.welcomeMessageHi}
                onChange={(event) => setForm({ ...form, welcomeMessageHi: event.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Brand colour">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200"
                    value={form.primaryColor}
                    onChange={(event) => setForm({ ...form, primaryColor: event.target.value })}
                  />
                  <input className="input" value={form.primaryColor} onChange={(event) => setForm({ ...form, primaryColor: event.target.value })} />
                </div>
              </Field>
              <Field label="Launcher position">
                <select className="input" value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value })}>
                  <option value="right"><Tx>Bottom right</Tx></option>
                  <option value="left"><Tx>Bottom left</Tx></option>
                </select>
              </Field>
            </div>
            <div className="space-y-2">
              {[
                ['isEnabled', 'Widget is enabled on my website'],
                ['demoAvailable', 'Offer demo class booking in the widget'],
                ['showBranding', 'Show "Powered by Unique AI Frontdesk"'],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-brand-600"
                    checked={Boolean(form[key])}
                    onChange={(event) => setForm({ ...form, [key]: event.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save widget settings'}
            </button>
          </form>
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <MessageSquareCode size={18} className="text-brand-600" />
              <h2 className="text-sm font-semibold text-slate-900"><Tx>Embed on your website</Tx></h2>
            </div>
            <p className="text-sm text-slate-600">
              Paste this before <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">&lt;/body&gt;</code> on every page where
              you want the chat button.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
              {embedCode}
            </pre>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => copy(embedCode, 'embed')}>
                {copied === 'embed' ? <Check size={15} /> : <Copy size={15} />} Copy embed code
              </button>
              <button type="button" className="btn-secondary" onClick={() => copy(directLink, 'link')}>
                {copied === 'link' ? <Check size={15} /> : <Copy size={15} />} Copy chat link
              </button>
            </div>
            <p className="mt-3 break-all rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{directLink}</p>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-slate-900"><Tx>Preview</Tx></h2>
            </div>
            <div className="p-5">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                <div className="flex items-center gap-2">
                  <span className="grid h-9 w-9 place-items-center rounded-xl text-white" style={{ backgroundColor: form.primaryColor }}>
                    <MessageSquareCode size={16} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{profile?.name}</p>
                    <p className="text-[11px] text-slate-500"><Tx>AI assistant · online</Tx></p>
                  </div>
                </div>
                <div className="mt-3 max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                  {form.welcomeMessage}
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {form.isEnabled ? 'Widget is live for this business.' : 'Widget is currently disabled — visitors see nothing.'}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
