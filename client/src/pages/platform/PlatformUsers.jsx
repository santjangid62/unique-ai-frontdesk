import { useState } from 'react';
import { Search, Users } from 'lucide-react';
import api, { errorMessage } from '../../lib/api.js';
import useFetch from '../../lib/useFetch.js';
import { Alert, Badge, Card, EmptyState, PageHeader, Pagination, Spinner, Table, Tx } from '../../components/ui.jsx';
import { fromNow, titleCase } from '../../lib/format.js';

export default function PlatformUsers() {
  const [filters, setFilters] = useState({ search: '', role: '', page: 1 });
  const [error, setError] = useState('');
  const query = new URLSearchParams({
    page: String(filters.page),
    limit: '15',
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.role ? { role: filters.role } : {}),
  }).toString();
  const { data, meta, loading, reload } = useFetch(`/platform/users?${query}`, [query]);

  const toggle = async (member) => {
    try {
      await api.patch(`/platform/users/${member.id}/status`, { isActive: !member.isActive });
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Platform"
        title="Users"
        subtitle="All platform, business admin and staff accounts in one list."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-4">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input w-60 pl-9"
              placeholder="Search name or email"
              value={filters.search}
              onChange={(event) => setFilters({ ...filters, search: event.target.value, page: 1 })}
            />
          </div>
          <select className="input w-48" value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value, page: 1 })}>
            <option value=""><Tx>All roles</Tx></option>
            {['super_admin', 'business_admin', 'staff'].map((role) => (
              <option key={role} value={role}>
                {titleCase(role)}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <Spinner />
        ) : !data?.length ? (
          <EmptyState icon={Users} title="No users found" />
        ) : (
          <Table
            rows={data}
            columns={[
              {
                key: 'name',
                label: 'User',
                render: (row) => (
                  <div>
                    <p className="font-semibold text-slate-800">{row.name}</p>
                    <p className="text-xs text-slate-500">{row.email}</p>
                  </div>
                ),
              },
              { key: 'tenant', label: 'Business', render: (row) => <span className="text-xs text-slate-600">{row.tenant?.name || 'Platform'}</span> },
              { key: 'role', label: 'Role', render: (row) => <Badge status={row.role === 'business_admin' ? 'active' : 'website'}>{titleCase(row.role)}</Badge> },
              { key: 'lastLoginAt', label: 'Last login', render: (row) => <span className="text-xs text-slate-500">{row.lastLoginAt ? fromNow(row.lastLoginAt) : 'Never'}</span> },
              { key: 'status', label: 'Status', render: (row) => <Badge status={row.isActive ? 'active' : 'inactive'}>{row.isActive ? 'Active' : 'Disabled'}</Badge> },
              {
                key: 'actions',
                label: '',
                render: (row) =>
                  row.role === 'super_admin' ? null : (
                    <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => toggle(row)}>
                      {row.isActive ? 'Disable' : 'Enable'}
                    </button>
                  ),
              },
            ]}
          />
        )}
        <Pagination meta={meta} onPage={(page) => setFilters({ ...filters, page })} />
      </Card>
    </div>
  );
}
