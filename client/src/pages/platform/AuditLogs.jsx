import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import useFetch from '../../lib/useFetch.js';
import { Alert, Badge, Card, EmptyState, PageHeader, Pagination, Spinner, Table, Tx } from '../../components/ui.jsx';
import { dateTime, titleCase } from '../../lib/format.js';

export default function AuditLogs() {
  const [filters, setFilters] = useState({ action: '', severity: '', page: 1 });
  const query = new URLSearchParams({
    page: String(filters.page),
    limit: '25',
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.severity ? { severity: filters.severity } : {}),
  }).toString();
  const { data, meta, loading, error } = useFetch(`/audit?${query}`, [query]);

  return (
    <div>
      <PageHeader
        eyebrow="Security"
        title="Audit Logs"
        subtitle="Authentication, tenant changes and cross-tenant access attempts are all recorded."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-4">
          <input
            className="input w-64"
            placeholder="Filter by action (for example login)"
            value={filters.action}
            onChange={(event) => setFilters({ ...filters, action: event.target.value, page: 1 })}
          />
          <select className="input w-40" value={filters.severity} onChange={(event) => setFilters({ ...filters, severity: event.target.value, page: 1 })}>
            <option value=""><Tx>All severities</Tx></option>
            {['info', 'warning', 'critical'].map((severity) => (
              <option key={severity} value={severity}>
                {titleCase(severity)}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <Spinner />
        ) : !data?.length ? (
          <EmptyState icon={ShieldCheck} title="No audit entries" />
        ) : (
          <Table
            rows={data}
            columns={[
              {
                key: 'action',
                label: 'Action',
                render: (row) => (
                  <div>
                    <p className="font-semibold text-slate-800">{row.action}</p>
                    <p className="text-xs text-slate-500">
                      {row.entity || '—'} {row.entityId ? `· ${String(row.entityId).slice(-6)}` : ''}
                    </p>
                  </div>
                ),
              },
              {
                key: 'actor',
                label: 'Actor',
                render: (row) => (
                  <div>
                    <p className="text-xs font-semibold text-slate-700">{row.actorId?.name || 'System'}</p>
                    <p className="text-xs text-slate-500">{row.actorId?.email || row.actorRole || ''}</p>
                  </div>
                ),
              },
              { key: 'severity', label: 'Severity', render: (row) => <Badge status={row.severity === 'critical' ? 'failed' : row.severity === 'warning' ? 'suspended' : 'active'}>{titleCase(row.severity)}</Badge> },
              { key: 'ip', label: 'IP', render: (row) => <span className="text-xs text-slate-500">{row.ip || '—'}</span> },
              { key: 'createdAt', label: 'When', render: (row) => <span className="text-xs text-slate-500">{dateTime(row.createdAt)}</span> },
            ]}
          />
        )}
        <Pagination meta={meta} onPage={(page) => setFilters({ ...filters, page })} />
      </Card>
    </div>
  );
}
