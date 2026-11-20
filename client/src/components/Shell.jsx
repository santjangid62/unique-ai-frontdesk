import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Bot,
  BookOpen,
  MessageSquareCode,
  MessagesSquare,
  Users,
  Contact,
  CalendarClock,
  Phone,
  UserCog,
  BarChart3,
  CreditCard,
  Settings as SettingsIcon,
  Bell,
  User,
  Building2,
  ShieldCheck,
  Package,
  LogOut,
  Menu,
  X,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../lib/api.js';
import { LanguageSwitcher, useI18n } from '../i18n/index.jsx';

const NAV = {
  super_admin: [
    {
      group: 'Platform',
      items: [
        { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
        { to: '/app/businesses', label: 'Businesses', icon: Building2 },
        { to: '/app/platform-users', label: 'Users', icon: Users },
        { to: '/app/plans', label: 'Subscription Plans', icon: Package },
        { to: '/app/audit', label: 'Audit Logs', icon: ShieldCheck },
      ],
    },
    {
      group: 'Account',
      items: [
        { to: '/app/guide', label: 'Training guide', icon: BookOpen },
        { to: '/app/notifications', label: 'Notifications', icon: Bell },
        { to: '/app/profile', label: 'Profile', icon: User },
      ],
    },
  ],
  business_admin: [
    {
      group: 'Workspace',
      items: [
        { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
        { to: '/app/ai-agents', label: 'AI Receptionist', icon: Bot },
        { to: '/app/knowledge', label: 'Knowledge Base', icon: BookOpen },
        { to: '/app/chat-widget', label: 'Website Chat', icon: MessageSquareCode },
        { to: '/app/conversations', label: 'Conversations', icon: MessagesSquare },
      ],
    },
    {
      group: 'Growth',
      items: [
        { to: '/app/leads', label: 'Leads', icon: Users },
        { to: '/app/customers', label: 'Customers', icon: Contact },
        { to: '/app/appointments', label: 'Appointments', icon: CalendarClock },
        { to: '/app/calls', label: 'Voice Calls', icon: Phone },
        { to: '/app/reports', label: 'Reports', icon: BarChart3 },
      ],
    },
    {
      group: 'Manage',
      items: [
        { to: '/app/staff', label: 'Staff', icon: UserCog },
        { to: '/app/subscription', label: 'Subscription', icon: CreditCard },
        { to: '/app/settings', label: 'Business Settings', icon: SettingsIcon },
        { to: '/app/guide', label: 'Training guide', icon: BookOpen },
        { to: '/app/notifications', label: 'Notifications', icon: Bell },
      ],
    },
  ],
  staff: [
    {
      group: 'My Work',
      items: [
        { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
        { to: '/app/leads', label: 'My Leads', icon: Users },
        { to: '/app/conversations', label: 'Conversations', icon: MessagesSquare },
        { to: '/app/appointments', label: 'Appointments', icon: CalendarClock },
      ],
    },
    {
      group: 'Account',
      items: [
        { to: '/app/guide', label: 'Training guide', icon: BookOpen },
        { to: '/app/notifications', label: 'Notifications', icon: Bell },
        { to: '/app/profile', label: 'Profile', icon: User },
      ],
    },
  ],
};

export default function Shell() {
  const { user, tenant, logout } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data } = await api.get('/notifications/unread-count');
        if (active) setUnread(data.data.unread || 0);
      } catch {
        /* silent */
      }
    };
    load();
    const timer = setInterval(load, 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [location.pathname]);

  const groups = NAV[user?.role] || NAV.staff;

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      {open ? (
        <button
          type="button"
          aria-label={t('Close navigation')}
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-ink text-slate-300 transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-5 py-5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500 text-white">
              <Sparkles size={18} />
            </span>
            <div>
              <p className="text-sm font-bold text-white">{t('Unique AI Frontdesk')}</p>
              <p className="text-[11px] text-slate-400">
                {user?.role === 'super_admin' ? t('Platform Console') : tenant?.name || t('Business workspace')}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="text-slate-400 lg:hidden"
            aria-label={t('Close navigation')}
            onClick={() => setOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <nav className="scroll-thin flex-1 space-y-6 overflow-y-auto px-3 pb-6">
          {groups.map((group) => (
            <div key={group.group}>
              <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                {t(group.group)}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
                        isActive
                          ? 'bg-white/10 text-white shadow-sm'
                          : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
                      }`
                    }
                  >
                    <item.icon size={17} />
                    <span className="flex-1">{t(item.label)}</span>
                    {item.label === 'Notifications' && unread > 0 ? (
                      <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{unread}</span>
                    ) : null}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="space-y-3 border-t border-white/10 p-3">
          <LanguageSwitcher tone="dark" className="w-full justify-center" />
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-500/20 text-sm font-bold text-brand-200">
              {(user?.name || 'U').slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{user?.name}</p>
              <p className="truncate text-[11px] text-slate-400">{user?.email}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
              title={t('Sign out')}
              aria-label={t('Sign out')}
            >
              <LogOut size={16} />
            </button>
          </div>
          <p className="px-2 text-center text-[10px] leading-relaxed text-slate-500">
            © {new Date().getFullYear()} Unique IT Solutions
            <span className="block">
              <a
                href="https://uniqueitsolutionsjaipur.com"
                target="_blank"
                rel="noreferrer"
                className="hover:text-slate-300"
              >
                uniqueitsolutionsjaipur.com
              </a>
            </span>
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:px-8">
          <button
            type="button"
            className="btn-ghost px-2 py-1 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label={t('Open navigation')}
          >
            <Menu size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">
              {tenant?.name || t('Unique AI Frontdesk')}
              {tenant?.planCode ? (
                <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-600">
                  {tenant.planCode}
                </span>
              ) : null}
            </p>
            <p className="text-[11px] text-slate-400">{t('24/7 AI receptionist · never miss a customer')}</p>
          </div>
          <LanguageSwitcher className="hidden sm:inline-flex" />
          <NavLink
            to="/app/notifications"
            className="relative rounded-xl p-2 text-slate-500 hover:bg-slate-100"
            aria-label={t('Notifications')}
          >
            <Bell size={18} />
            {unread > 0 ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-500" /> : null}
          </NavLink>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
