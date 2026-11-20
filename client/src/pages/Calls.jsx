import { useState } from 'react';
import { Phone, PhoneMissed, PlayCircle } from 'lucide-react';
import useFetch from '../lib/useFetch.js';
import { Alert, Badge, Card, EmptyState, PageHeader, Pagination, Spinner, Stat, Table, Tx } from '../components/ui.jsx';
import { dateTime, titleCase } from '../lib/format.js';

export default function Calls() {
  const [filters, setFilters] = useState({ status: '', page: 1 });
  const [expanded, setExpanded] = useState(null);
  const query = new URLSearchParams({
    page: String(filters.page),
    limit: '15',
    ...(filters.status ? { status: filters.status } : {}),
  }).toString();
  const { data, meta, loading, error } = useFetch(`/calls?${query}`, [query]);

  const missed = (data || []).filter((call) => ['missed', 'failed'].includes(call.status)).length;
  const totalMinutes = Math.round((data || []).reduce((sum, call) => sum + (call.durationSeconds || 0), 0) / 60);

  return (
    <div>
      <PageHeader
        eyebrow="Voice channel"
        title="Voice Calls"
        subtitle="Inbound calls answered by the AI receptionist, with transcripts and summaries."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat label="Calls in view" value={data?.length || 0} icon={Phone} />
        <Stat label="Missed / failed" value={missed} icon={PhoneMissed} tone="rose" />
        <Stat label="Talk time" value={`${totalMinutes} min`} icon={PlayCircle} tone="sky" />
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <h2 className="text-sm font-semibold text-slate-900"><Tx>Call history</Tx></h2>
          <select className="input w-44" value={filters.status} onChange={(event) => setFilters({ status: event.target.value, page: 1 })}>
            <option value=""><Tx>All statuses</Tx></option>
            {['completed', 'missed', 'failed', 'in_progress', 'transferred'].map((status) => (
              <option key={status} value={status}>
                {titleCase(status)}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <Spinner />
        ) : !data?.length ? (
          <EmptyState
            title="No calls recorded"
            description="Connect Twilio in Settings and forward your business number to start answering calls with AI."
          />
        ) : (
          <Table
            rows={data}
            columns={[
              {
                key: 'from',
                label: 'Caller',
                render: (row) => (
                  <div>
                    <p className="font-semibold text-slate-800">{row.from || 'Unknown'}</p>
                    <p className="text-xs text-slate-500">to {row.to || '—'}</p>
                  </div>
                ),
              },
              { key: 'status', label: 'Status', render: (row) => <Badge status={row.status} /> },
              {
                key: 'duration',
                label: 'Duration',
                render: (row) => <span className="text-xs text-slate-600">{Math.floor((row.durationSeconds || 0) / 60)}m {(row.durationSeconds || 0) % 60}s</span>,
              },
              {
                key: 'summary',
                label: 'Summary',
                render: (row) => <span className="line-clamp-2 max-w-sm text-xs text-slate-600">{row.summary || '—'}</span>,
              },
              { key: 'startedAt', label: 'Started', render: (row) => <span className="text-xs text-slate-500">{dateTime(row.startedAt)}</span> },
              {
                key: 'actions',
                label: '',
                render: (row) => (
                  <button
                    type="button"
                    className="btn-ghost px-2 py-1 text-xs"
                    onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                  >
                    {expanded === row.id ? 'Hide transcript' : 'Transcript'}
                  </button>
                ),
              },
            ]}
          />
        )}
        <Pagination meta={meta} onPage={(page) => setFilters({ ...filters, page })} />
      </Card>

      {expanded ? (
        <Card className="mt-4 p-5">
          <h2 className="text-sm font-semibold text-slate-900"><Tx>Transcript</Tx></h2>
          <div className="mt-3 space-y-2">
            {(data?.find((call) => call.id === expanded)?.transcript || []).map((line, index) => (
              <div key={index} className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${line.role === 'customer' ? 'bg-slate-100 text-slate-700' : 'ml-auto bg-brand-600 text-white'}`}>
                {line.text}
              </div>
            ))}
            {!(data?.find((call) => call.id === expanded)?.transcript || []).length ? (
              <p className="text-sm text-slate-500"><Tx>No transcript stored for this call.</Tx></p>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
