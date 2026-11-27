import { useEffect, useRef, useState } from 'react';
import { Bot, MessageSquare, RefreshCw, Send, UserCog, XCircle } from 'lucide-react';
import api, { errorMessage } from '../lib/api.js';
import useFetch from '../lib/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner, Tabs, Tx } from '../components/ui.jsx';
import { dateTime, fromNow, titleCase } from '../lib/format.js';
import { useI18n } from '../i18n/index.jsx';

export default function Conversations() {
  const { t } = useI18n();
  const { user, isBusinessAdmin } = useAuth();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  const query = new URLSearchParams({
    limit: '30',
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(search ? { search } : {}),
  }).toString();

  const list = useFetch(`/conversations?${query}`, [query]);
  const detail = useFetch(selected ? `/conversations/${selected}` : null, [selected], { enabled: Boolean(selected) });

  useEffect(() => {
    if (detail.data?.messages?.length) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [detail.data?.messages?.length]);

  useEffect(() => {
    if (!selected) return undefined;
    const timer = setInterval(() => detail.reload(), 20000);
    return () => clearInterval(timer);
  }, [selected, detail.reload]);

  const sendReply = async (event) => {
    event.preventDefault();
    if (!reply.trim() || !selected) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/conversations/${selected}/reply`, { text: reply });
      setReply('');
      await Promise.all([detail.reload(), list.reload()]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const action = async (name) => {
    if (!selected) return;
    setError('');
    try {
      if (name === 'handoff') await api.patch(`/conversations/${selected}/handoff`, { assignedTo: user?.id });
      if (name === 'resume') await api.patch(`/conversations/${selected}/resume-ai`);
      if (name === 'close') await api.patch(`/conversations/${selected}/close`);
      await Promise.all([detail.reload(), list.reload()]);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const conversations = list.data || [];
  const conversation = detail.data?.conversation;
  const messages = detail.data?.messages || [];

  return (
    <div>
      <PageHeader
        eyebrow="Inbox"
        title="Conversations"
        subtitle="Website, WhatsApp and voice conversations in one place. Take over whenever the AI needs a human."
        actions={
          <button type="button" className="btn-secondary" onClick={() => list.reload()}>
            <RefreshCw size={16} /> Refresh
          </button>
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card className="flex max-h-[75vh] flex-col overflow-hidden">
          <div className="space-y-3 border-b border-slate-100 p-3">
            <input
              className="input"
              placeholder={t('Search name, phone or message')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Tabs
              tabs={[
                { value: '', label: 'All', count: list.meta?.total },
                { value: 'open', label: 'Open', count: list.meta?.statusCounts?.open },
                { value: 'handoff', label: 'Handoff', count: list.meta?.statusCounts?.handoff },
                { value: 'closed', label: 'Closed', count: list.meta?.statusCounts?.closed },
              ]}
              value={statusFilter}
              onChange={setStatusFilter}
            />
          </div>

          <div className="scroll-thin flex-1 overflow-y-auto">
            {list.loading ? (
              <Spinner />
            ) : !conversations.length ? (
              <EmptyState title="No conversations" description="Chats from your widget, WhatsApp and calls appear here." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {conversations.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(item.id)}
                      className={`w-full px-4 py-3 text-left transition ${
                        selected === item.id ? 'bg-brand-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-slate-800">{item.customerName}</p>
                        <span className="text-[10px] text-slate-400">{fromNow(item.lastMessageAt)}</span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{item.lastMessagePreview || 'No messages yet'}</p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Badge status={item.channel} />
                        <Badge status={item.status} />
                        {item.unreadForStaff ? (
                          <span className="rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{item.unreadForStaff}</span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card className="flex max-h-[75vh] min-h-[520px] flex-col overflow-hidden">
          {!selected ? (
            <EmptyState
              icon={MessageSquare}
              title="Select a conversation"
              description="Pick a chat on the left to read the transcript and reply."
            />
          ) : detail.loading && !conversation ? (
            <Spinner />
          ) : conversation ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">{conversation.customerName}</p>
                  <p className="text-xs text-slate-500">
                    {conversation.customerPhone || 'No phone'} · {titleCase(conversation.channel)} ·{' '}
                    {t(conversation.aiEnabled ? 'AI replying' : 'Staff handling')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {conversation.status !== 'handoff' ? (
                    <button type="button" className="btn-secondary px-2.5 py-1.5 text-xs" onClick={() => action('handoff')}>
                      <UserCog size={14} /> <Tx>Take over</Tx>
                    </button>
                  ) : null}
                  {!conversation.aiEnabled && isBusinessAdmin ? (
                    <button type="button" className="btn-secondary px-2.5 py-1.5 text-xs" onClick={() => action('resume')}>
                      <Bot size={14} /> <Tx>Resume AI</Tx>
                    </button>
                  ) : null}
                  {conversation.status !== 'closed' ? (
                    <button type="button" className="btn-danger px-2.5 py-1.5 text-xs" onClick={() => action('close')}>
                      <XCircle size={14} /> Close
                    </button>
                  ) : null}
                </div>
              </div>

              {conversation.escalationReason ? (
                <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                  Escalated: {conversation.escalationReason}
                </div>
              ) : null}

              <div className="scroll-thin flex-1 space-y-3 overflow-y-auto bg-slate-50/50 px-4 py-4">
                {messages.map((message) => {
                  if (message.role === 'system') {
                    return (
                      <p key={message.id} className="mx-auto w-fit rounded-full bg-white px-3 py-1 text-[11px] text-slate-500 shadow-sm">
                        {message.content}
                      </p>
                    );
                  }
                  const mine = message.role !== 'customer';
                  return (
                    <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${
                          message.role === 'customer'
                            ? 'bg-white text-slate-700 shadow-sm'
                            : message.role === 'ai'
                              ? 'bg-brand-600 text-white'
                              : 'bg-slate-800 text-white'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{message.content}</p>
                        <p className={`mt-1 text-[10px] ${mine ? 'text-white/60' : 'text-slate-400'}`}>
                          {message.role === 'ai' ? 'AI' : message.authorName || titleCase(message.role)} ·{' '}
                          {dateTime(message.createdAt, { dateStyle: undefined })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              <form onSubmit={sendReply} className="flex items-center gap-2 border-t border-slate-100 px-3 py-3">
                <input
                  className="input flex-1"
                  placeholder={t('Reply as staff — this pauses the AI for this chat')}
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                />
                <button type="submit" className="btn-primary px-3" disabled={busy || !reply.trim()}>
                  <Send size={16} />
                </button>
              </form>
            </>
          ) : (
            <EmptyState title="Conversation unavailable" />
          )}
        </Card>
      </div>
    </div>
  );
}
