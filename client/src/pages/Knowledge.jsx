import { useRef, useState } from 'react';
import { FileText, Plus, Search, Trash2, Upload } from 'lucide-react';
import api, { errorMessage } from '../lib/api.js';
import useFetch from '../lib/useFetch.js';
import { Alert, Badge, Card, EmptyState, Field, Modal, PageHeader, Pagination, Spinner, Table, Tabs, Tx } from '../components/ui.jsx';
import { fromNow, titleCase } from '../lib/format.js';
import { useI18n } from '../i18n/index.jsx';
import { useBusinessCategory } from '../lib/useBusinessCategory.js';

const CATEGORIES = ['business', 'course', 'fee', 'faq', 'policy', 'timing', 'contact', 'other'];
const empty = { category: 'faq', title: '', content: '', tags: '' };

export default function Knowledge() {
  const { t } = useI18n();
  const category = useBusinessCategory();
  const categoryLabels = { course: category.offerings };
  const categoryLabel = (value) => categoryLabels[value] || titleCase(value);
  const [tab, setTab] = useState('entries');
  const [filters, setFilters] = useState({ category: '', search: '', page: 1 });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const query = new URLSearchParams({
    page: String(filters.page),
    limit: '15',
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.search ? { search: filters.search } : {}),
  }).toString();

  const entries = useFetch(`/knowledge?${query}`, [query]);
  const documents = useFetch('/knowledge/documents', [tab]);

  const openCreate = () => {
    setEditing(null);
    setForm(empty);
    setError('');
    setOpen(true);
  };

  const openEdit = (entry) => {
    setEditing(entry);
    setForm({
      category: entry.category,
      title: entry.title,
      content: entry.content,
      tags: (entry.tags || []).join(', '),
    });
    setError('');
    setOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        category: form.category,
        title: form.title,
        content: form.content,
        tags: form.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      };
      if (editing) await api.put(`/knowledge/${editing.id}`, payload);
      else await api.post('/knowledge', payload);
      setOpen(false);
      entries.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry) => {
    if (!window.confirm(`Delete "${entry.title}"?`)) return;
    try {
      await api.delete(`/knowledge/${entry.id}`);
      entries.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const toggle = async (entry) => {
    try {
      await api.put(`/knowledge/${entry.id}`, { isEnabled: !entry.isEnabled });
      entries.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    setNotice('');
    const body = new FormData();
    body.append('file', file);
    try {
      const { data } = await api.post('/knowledge/upload', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setNotice(`${data.data.document.filename} processed — ${data.data.entries.length} knowledge entries created.`);
      entries.reload();
      documents.reload();
      setTab('entries');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeDocument = async (document) => {
    if (!window.confirm(`Delete ${document.filename} and its entries?`)) return;
    try {
      await api.delete(`/knowledge/documents/${document.id}`);
      documents.reload();
      entries.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Grounded AI"
        title="Knowledge Base"
        subtitle="The AI only answers from what you verify here. Anything else is escalated instead of invented."
        actions={
          <>
            <input ref={fileRef} type="file" accept=".pdf,.txt,.md,.csv" className="hidden" onChange={upload} />
            <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload size={16} /> {t(uploading ? 'Processing…' : 'Upload document')}
            </button>
            <button type="button" className="btn-primary" onClick={openCreate}>
              <Plus size={16} /> <Tx>Add entry</Tx>
            </button>
          </>
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

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={[
            { value: 'entries', label: 'Entries', count: entries.meta?.total },
            { value: 'documents', label: 'Documents', count: documents.data?.length },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'entries' ? (
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input w-56 pl-9"
                placeholder={t('Search knowledge')}
                value={filters.search}
                onChange={(event) => setFilters({ ...filters, search: event.target.value, page: 1 })}
              />
            </div>
            <select className="input w-40" value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value, page: 1 })}>
              <option value=""><Tx>All categories</Tx></option>
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {categoryLabel(value)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {tab === 'entries' ? (
        <Card className="overflow-hidden">
          <Table
            loading={entries.loading}
            rows={entries.data}
            columns={[
              {
                key: 'title',
                label: 'Entry',
                render: (row) => (
                  <div className="max-w-md">
                    <p className="font-semibold text-slate-800">{row.title}</p>
                    <p className="line-clamp-2 text-xs text-slate-500">{row.content}</p>
                  </div>
                ),
              },
              { key: 'category', label: 'Category', render: (row) => <Badge status="website">{categoryLabel(row.category)}</Badge> },
              {
                key: 'tags',
                label: 'Tags',
                render: (row) => <span className="text-xs text-slate-500">{(row.tags || []).join(', ') || '—'}</span>,
              },
              { key: 'version', label: 'Version', render: (row) => <span className="text-xs text-slate-500">v{row.version}</span> },
              {
                key: 'isEnabled',
                label: 'Status',
                render: (row) => (
                  <button type="button" onClick={() => toggle(row)}>
                    <Badge status={row.isEnabled ? 'active' : 'inactive'}>{row.isEnabled ? 'Enabled' : 'Disabled'}</Badge>
                  </button>
                ),
              },
              { key: 'updatedAt', label: 'Updated', render: (row) => <span className="text-xs text-slate-500">{fromNow(row.updatedAt)}</span> },
              {
                key: 'actions',
                label: '',
                render: (row) => (
                  <div className="flex justify-end gap-1">
                    <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => openEdit(row)}>
                      Edit
                    </button>
                    <button type="button" className="btn-ghost px-2 py-1 text-xs text-rose-600" onClick={() => remove(row)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ),
              },
            ]}
            empty={
              <EmptyState
                title="No knowledge entries"
                description={`Add fees, ${category.offerings.toLowerCase()}, timings and FAQs so the AI can answer accurately.`}
              />
            }
          />
          <Pagination meta={entries.meta} onPage={(page) => setFilters({ ...filters, page })} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table
            loading={documents.loading}
            rows={documents.data}
            columns={[
              {
                key: 'filename',
                label: 'Document',
                render: (row) => (
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-slate-400" />
                    <div>
                      <p className="font-semibold text-slate-800">{row.filename}</p>
                      <p className="text-xs text-slate-500">{Math.round((row.size || 0) / 1024)} KB · {row.entriesCreated} entries</p>
                    </div>
                  </div>
                ),
              },
              { key: 'status', label: 'Status', render: (row) => <Badge status={row.status} /> },
              { key: 'createdAt', label: 'Uploaded', render: (row) => <span className="text-xs text-slate-500">{fromNow(row.createdAt)}</span> },
              {
                key: 'actions',
                label: '',
                render: (row) => (
                  <div className="flex justify-end">
                    <button type="button" className="btn-ghost px-2 py-1 text-xs text-rose-600" onClick={() => removeDocument(row)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ),
              },
            ]}
            empty={
              <EmptyState
                title="No documents uploaded"
                description="Upload a PDF or text file — it is split into knowledge entries automatically."
                action={
                  <button type="button" className="btn-primary" onClick={() => fileRef.current?.click()}>
                    <Upload size={16} /> <Tx>Upload document</Tx>
                  </button>
                }
              />
            }
          />
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit knowledge entry' : 'New knowledge entry'}
        size="lg"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="knowledge-form" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save entry'}
            </button>
          </>
        }
      >
        {error && open ? (
          <div className="mb-3">
            <Alert>{error}</Alert>
          </div>
        ) : null}
        <form id="knowledge-form" onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Category" hint="Pick the section this fact belongs to.">
              <select className="input" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                {CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {categoryLabel(value)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Title" className="sm:col-span-2" hint="Short label, for example Fees or Opening hours.">
              <input className="input" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </Field>
          </div>
          <Field
            label="Verified content"
            hint="Write the exact facts the AI may quote: prices, timings, address and policies. One topic per entry works best."
          >
            <textarea className="input" rows={8} required value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} />
          </Field>
          <Field label="Tags" hint="Comma separated, for example: python, fees, demo">
            <input className="input" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} />
          </Field>
        </form>
      </Modal>

      {uploading ? <Spinner label="Extracting text and creating entries…" /> : null}
    </div>
  );
}
