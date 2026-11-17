import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Bot,
  CalendarClock,
  MessagesSquare,
  PhoneCall,
  TrendingUp,
  Users,
} from 'lucide-react';
import useFetch from '../lib/useFetch.js';
import { Alert, Card, PageHeader, Spinner, Stat, Tabs } from '../components/ui.jsx';
import { dayLabel, titleCase } from '../lib/format.js';

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9', '#64748b'];

export default function Reports() {
  const [days, setDays] = useState('14');
  const { data, loading, error, reload } = useFetch(`/analytics/business/overview?days=${days}`, [days]);

  if (loading && !data) return <Spinner label="Building your report…" />;
  if (error) return <Alert>{error}</Alert>;

  const kpis = data?.kpis || {};
  const statusData = (data?.leadStatus || []).map((row) => ({ name: titleCase(row.status), value: row.count }));
  const totalLeads = statusData.reduce((sum, row) => sum + row.value, 0) || 1;

  return (
    <div>
      <PageHeader
        eyebrow="Insights"
        title="Reports & Analytics"
        subtitle="Channel performance, AI resolution and conversion for your business."
        actions={
          <>
            <Tabs
              tabs={[
                { value: '7', label: '7 days' },
                { value: '14', label: '14 days' },
                { value: '30', label: '30 days' },
                { value: '90', label: '90 days' },
              ]}
              value={days}
              onChange={setDays}
            />
            <button type="button" className="btn-secondary" onClick={reload}>
              Refresh
            </button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Leads" value={kpis.leadTotal || 0} hint={`${kpis.newLeads || 0} awaiting first contact`} icon={Users} />
        <Stat label="AI resolution" value={`${kpis.aiResolutionRate || 0}%`} hint={`${kpis.handoffTotal || 0} escalated to staff`} icon={Bot} tone="emerald" />
        <Stat label="Appointments" value={kpis.appointmentTotal || 0} hint={`${kpis.upcomingAppointments || 0} upcoming`} icon={CalendarClock} tone="amber" />
        <Stat label="Conversations" value={kpis.conversationTotal || 0} hint={`${kpis.aiMessages || 0} AI replies`} icon={MessagesSquare} tone="sky" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">Daily enquiry flow</h2>
          <p className="text-xs text-slate-500">Leads vs appointments created per day</p>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.trends || []} margin={{ left: -20, right: 8, top: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip labelFormatter={(value) => new Date(value).toLocaleDateString('en-IN', { dateStyle: 'medium' })} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="leads" name="Leads" stroke="#4f46e5" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="appointments" name="Appointments" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="conversations" name="Conversations" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">Lead pipeline</h2>
          <p className="text-xs text-slate-500">Distribution by status</p>
          <div className="mt-2 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={70} paddingAngle={2}>
                  {statusData.map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => [`${value} (${Math.round((value / totalLeads) * 100)}%)`, name]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5">
            {statusData.map((row, index) => (
              <div key={row.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  {row.name}
                </span>
                <span className="font-semibold text-slate-700">{row.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">Channel performance</h2>
          <p className="text-xs text-slate-500">Conversations started per channel</p>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.channels || []} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="channel" tickFormatter={titleCase} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip formatter={(value, name, item) => [value, titleCase(item.payload.channel)]} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {(data?.channels || []).map((entry, index) => (
                    <Cell key={entry.channel} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">Operations snapshot</h2>
          <p className="text-xs text-slate-500">Service quality and workload</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              ['Total calls', kpis.callTotal || 0, PhoneCall],
              ['Missed calls', kpis.missedCalls || 0, PhoneCall],
              ['AI messages', kpis.aiMessages || 0, Bot],
              ['Knowledge entries', kpis.knowledgeCount || 0, TrendingUp],
              ['Today appointments', kpis.todayAppointments || 0, CalendarClock],
              ['Open conversations', kpis.openConversations || 0, MessagesSquare],
            ].map(([label, value, Icon]) => (
              <div key={label} className="rounded-xl bg-slate-50 px-3 py-3">
                <div className="flex items-center gap-2 text-slate-400">
                  <Icon size={14} />
                  <p className="text-[11px] font-semibold uppercase tracking-wide">{label}</p>
                </div>
                <p className="mt-1 text-xl font-bold text-slate-800">{value}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
