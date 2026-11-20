import { useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../lib/api.js';
import useFetch from '../lib/useFetch.js';
import { Alert, Card, EmptyState, PageHeader, Pagination, Spinner, Tabs } from '../components/ui.jsx';
import { fromNow, titleCase } from '../lib/format.js';
import { useI18n } from '../i18n/index.jsx';

export default function Notifications() {
  const { t } = useI18n();
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const query = new URLSearchParams({
    page: String(page),
    limit: '20',
    ...(filter === 'unread' ? { unread: 'true' } : {}),
  }).toString();
  const { data, meta, loading, reload } = useFetch(`/notifications?${query}`, [query]);

  const markRead = async (notification) => {
    if (notification.readAt) return;
    try {
      await api.patch(`/notifications/${notification.id}/read`);
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const markAll = async () => {
    try {
      await api.post('/notifications/read-all');
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Activity"
        title="Notifications"
        subtitle="New leads, handoffs, appointments and billing alerts."
        actions={
          <button type="button" className="btn-secondary" onClick={markAll}>
            <CheckCheck size={16} /> {t('Mark all read')}
          </button>
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <Tabs
            tabs={[
              { value: 'all', label: 'All', count: meta?.total },
              { value: 'unread', label: 'Unread', count: meta?.unread },
            ]}
            value={filter}
            onChange={(value) => {
              setFilter(value);
              setPage(1);
            }}
          />
        </div>

        {loading ? (
          <Spinner />
        ) : !data?.length ? (
          <EmptyState icon={Bell} title="You are all caught up" description="New activity will appear here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.map((notification) => (
              <li key={notification.id} className={`flex items-start gap-3 px-5 py-4 ${notification.readAt ? '' : 'bg-brand-50/40'}`}>
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${notification.readAt ? 'bg-slate-200' : 'bg-brand-500'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800">{notification.title}</p>
                    <span className="chip bg-slate-100 text-slate-500">{titleCase(notification.type)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">{notification.body}</p>
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-400">
                    <span>{fromNow(notification.createdAt)}</span>
                    {notification.link ? (
                      <Link to={notification.link} className="font-semibold text-brand-600" onClick={() => markRead(notification)}>
                        {t('Open')}
                      </Link>
                    ) : null}
                  </div>
                </div>
                {!notification.readAt ? (
                  <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => markRead(notification)}>
                    {t('Mark read')}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <Pagination meta={meta} onPage={setPage} />
      </Card>
    </div>
  );
}
