import { Link } from 'react-router-dom';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Users,
  CalendarClock,
  MessagesSquare,
  Bot,
  Building2,
  IndianRupee,
  ArrowUpRight,
  PhoneMissed,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import useFetch from '../lib/useFetch.js';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner, Stat } from '../components/ui.jsx';
import { compactNumber, dateTime, fromNow, titleCase, dayLabel } from '../lib/format.js';

const CHART_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

function BusinessOverview() {
  const { data, loading, error } = useFetch('/analytics/business/overview');
  if (loading) return <Spinner label="Loading your dashboard…" />;
  if (error) return <Alert>{error}</Alert>;

  const kpis = data?.kpis || {};
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total leads" value={compactNumber(kpis.leadTotal)} hint={`${kpis.newLeads || 0} new to contact`} icon={Users} />
        <Stat label="AI resolution rate" value={`${kpis.aiResolutionRate || 0}%`} hint={`${kpis.handoffTotal || 0} handed to staff`} icon={Bot} tone="emerald" />
        <Stat label="Appointments today" value={kpis.todayAppointments || 0} hint={`${kpis.upcomingAppointments || 0} upcoming`} icon={CalendarClock} tone="amber" />
        <Stat label="Open conversations" value={kpis.openConversations || 0} hint={`${kpis.aiMessages || 0} AI replies in 14 days`} icon={MessagesSquare} tone="sky" />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Enquiry trend</h2>
              <p className="text-xs text-slate-500">Leads, conversations and appointments over the last 14 days</p>
            </div>
            <Link to="/app/reports" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
              Full report
            </Link>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.trends || []} margin={{ left: -18, right: 8, top: 4 }}>
                <defs>
                  <linearGradient id="leads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="convos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip labelFormatter={(value) => new Date(value).toLocaleDateString('en-IN', { dateStyle: 'medium' })} />
                <Area type="monotone" dataKey="leads" name="Leads" stroke="#4f46e5" strokeWidth={2} fill="url(#leads)" />
                <Area type="monotone" dataKey="conversations" name="Conversations" stroke="#10b981" strokeWidth={2} fill="url(#convos)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">Channel mix</h2>
          <p className="text-xs text-slate-500">Where your customers start conversations</p>
          {data?.channels?.length ? (
            <>
              <div className="mt-2 h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.channels} dataKey="count" nameKey="channel" innerRadius={45} outerRadius={70} paddingAngle={3}>
                      {data.channels.map((entry, index) => (
                        <Cell key={entry.channel} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name) => [value, titleCase(name)]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {data.channels.map((channel, index) => (
                  <div key={channel.channel} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                      {titleCase(channel.channel)}
                    </span>
                    <span className="font-semibold text-slate-800">{channel.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState title="No conversations yet" description="Share your widget or connect WhatsApp to start receiving enquiries." />
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Latest leads</h2>
            <Link to="/app/leads" className="text-xs font-semibold text-brand-600">
              View all
            </Link>
          </div>
          {data?.recentLeads?.length ? (
            <ul className="divide-y divide-slate-100">
              {data.recentLeads.map((lead) => (
                <li key={lead.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                    {lead.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{lead.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {lead.course || 'General enquiry'} · {titleCase(lead.source)}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge status={lead.status} />
                    <p className="mt-1 text-[11px] text-slate-400">{fromNow(lead.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No leads yet" description="The AI will capture leads from chat, WhatsApp and calls." />
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Upcoming appointments</h2>
            <Link to="/app/appointments" className="text-xs font-semibold text-brand-600">
              Calendar
            </Link>
          </div>
          {data?.upcomingAppointments?.length ? (
            <ul className="divide-y divide-slate-100">
              {data.upcomingAppointments.map((appointment) => (
                <li key={appointment.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-50 text-center">
                    <span className="text-[10px] font-bold uppercase text-slate-400">{dayLabel(appointment.startAt).split(' ')[1]}</span>
                    <span className="text-xs font-bold text-slate-700">{dayLabel(appointment.startAt).split(' ')[0]}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{appointment.customerName}</p>
                    <p className="truncate text-xs text-slate-500">
                      {titleCase(appointment.type)} · {appointment.course || 'General'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-700">{dateTime(appointment.startAt, { dateStyle: undefined })}</p>
                    <Badge status={appointment.status} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No upcoming appointments" description="Demo class bookings will appear here automatically." />
          )}
        </Card>
      </div>

      {kpis.missedCalls > 0 ? (
        <div className="mt-5 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <PhoneMissed size={16} /> {kpis.missedCalls} missed call(s) recorded. Follow up from the voice calls page.
        </div>
      ) : null}
    </>
  );
}

function PlatformOverview() {
  const { data, loading, error } = useFetch('/analytics/platform/overview');
  if (loading) return <Spinner label="Loading platform metrics…" />;
  if (error) return <Alert>{error}</Alert>;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Businesses" value={data?.tenants?.total || 0} hint={`${data?.tenants?.newThisMonth || 0} new this month`} icon={Building2} />
        <Stat label="Active users" value={data?.users?.total || 0} hint={`${data?.users?.byRole?.business_admin || 0} admins · ${data?.users?.byRole?.staff || 0} staff`} icon={Users} tone="sky" />
        <Stat label="Monthly recurring revenue" value={`₹${compactNumber(data?.revenue?.mrr || 0)}`} hint={`₹${compactNumber(data?.revenue?.revenueTotal || 0)} collected`} icon={IndianRupee} tone="emerald" />
        <Stat label="AI messages (month)" value={compactNumber(data?.usage?.aiMessagesThisMonth || 0)} hint={`${compactNumber(data?.usage?.byKind?.voice || 0)} voice minutes`} icon={Bot} tone="amber" />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">Plan distribution</h2>
          <p className="text-xs text-slate-500">Businesses per subscription tier</p>
          <div className="mt-4 h-56">
            {data?.planDistribution?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.planDistribution} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="planCode" tickFormatter={titleCase} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip formatter={(value, name, item) => [value, titleCase(item.payload.planCode)]} />
                  <Bar dataKey="count" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No businesses yet" />
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Newest businesses</h2>
            <Link to="/app/businesses" className="text-xs font-semibold text-brand-600">
              Manage
            </Link>
          </div>
          {data?.recentTenants?.length ? (
            <ul className="divide-y divide-slate-100">
              {data.recentTenants.map((tenant) => (
                <li key={tenant.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{tenant.name}</p>
                    <p className="text-xs text-slate-500">{tenant.slug} · {titleCase(tenant.industry)}</p>
                  </div>
                  <div className="text-right">
                    <Badge status={tenant.status} />
                    <p className="mt-1 text-[11px] text-slate-400">{fromNow(tenant.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No businesses yet" />
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Voice minutes (all)" value={compactNumber(data?.usage?.byKind?.voice || 0)} icon={CalendarClock} tone="sky" />
        <Stat label="WhatsApp messages" value={compactNumber(data?.usage?.byKind?.whatsapp || 0)} icon={MessagesSquare} tone="emerald" />
        <Stat label="Paid invoices" value={data?.revenue?.invoiceCount || 0} icon={TrendingUp} tone="amber" />
      </div>
    </>
  );
}

function StaffOverview() {
  const { user } = useAuth();
  const leads = useFetch('/leads?limit=5');
  const appointments = useFetch('/appointments?upcoming=true&limit=5');

  if (leads.loading || appointments.loading) return <Spinner label="Loading your day…" />;

  return (
    <>
      <Card className="mb-5 overflow-hidden">
        <div className="flex flex-col gap-3 bg-gradient-to-r from-brand-600 to-brand-500 px-6 py-6 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-100">My workspace</p>
            <h2 className="mt-1 text-xl font-bold">Good to see you, {user?.name?.split(' ')[0]}</h2>
            <p className="mt-1 text-sm text-brand-100">Your assigned leads and upcoming appointments are ready.</p>
          </div>
          <Link to="/app/leads" className="btn bg-white/15 text-white hover:bg-white/25">
            Open my leads <ArrowUpRight size={16} />
          </Link>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="Assigned leads" value={leads.data?.length || 0} icon={Users} />
        <Stat label="Upcoming appointments" value={appointments.data?.length || 0} icon={CalendarClock} tone="amber" />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">My leads</h2>
          </div>
          {leads.data?.length ? (
            <ul className="divide-y divide-slate-100">
              {leads.data.map((lead) => (
                <li key={lead.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{lead.name}</p>
                    <p className="text-xs text-slate-500">{lead.course || 'General enquiry'}</p>
                  </div>
                  <Badge status={lead.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No leads assigned" description="Your admin can assign enquiries to you." />
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Upcoming appointments</h2>
          </div>
          {appointments.data?.length ? (
            <ul className="divide-y divide-slate-100">
              {appointments.data.map((appointment) => (
                <li key={appointment.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{appointment.customerName}</p>
                    <p className="text-xs text-slate-500">{titleCase(appointment.type)} · {appointment.course || 'General'}</p>
                  </div>
                  <p className="text-xs font-semibold text-slate-600">{dateTime(appointment.startAt)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing scheduled" />
          )}
        </Card>
      </div>
    </>
  );
}

export default function Overview() {
  const { user } = useAuth();
  const subtitle =
    user?.role === 'super_admin'
      ? 'Platform health, revenue and AI usage across all businesses.'
      : user?.role === 'staff'
        ? 'Your assigned leads, conversations and appointments.'
        : 'How your AI receptionist performed and what needs your attention.';

  return (
    <div>
      <PageHeader
        eyebrow={user?.role === 'super_admin' ? 'Platform console' : 'Workspace'}
        title={`Welcome back, ${user?.name?.split(' ')[0] || 'there'}`}
        subtitle={subtitle}
        actions={
          user?.role === 'business_admin' ? (
            <Link to="/app/knowledge" className="btn-secondary">
              <Sparkles size={16} /> Improve AI answers
            </Link>
          ) : null
        }
      />
      {user?.role === 'super_admin' ? <PlatformOverview /> : user?.role === 'staff' ? <StaffOverview /> : <BusinessOverview />}
    </div>
  );
}
