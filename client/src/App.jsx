import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { Spinner } from './components/ui.jsx';
import Shell from './components/Shell.jsx';
import Landing from './pages/Landing.jsx';
import { Login, Register, ForgotPassword, ResetPassword } from './pages/Auth.jsx';
import PublicChat from './pages/PublicChat.jsx';
import Overview from './pages/Overview.jsx';
import Agents from './pages/Agents.jsx';
import Knowledge from './pages/Knowledge.jsx';
import ChatWidget from './pages/ChatWidget.jsx';
import Conversations from './pages/Conversations.jsx';
import Leads from './pages/Leads.jsx';
import Customers from './pages/Customers.jsx';
import Appointments from './pages/Appointments.jsx';
import Calls from './pages/Calls.jsx';
import Staff from './pages/Staff.jsx';
import Reports from './pages/Reports.jsx';
import Subscription from './pages/Subscription.jsx';
import Settings from './pages/Settings.jsx';
import Notifications from './pages/Notifications.jsx';
import Profile from './pages/Profile.jsx';
import Businesses from './pages/platform/Businesses.jsx';
import PlatformUsers from './pages/platform/PlatformUsers.jsx';
import Plans from './pages/platform/Plans.jsx';
import AuditLogs from './pages/platform/AuditLogs.jsx';

function Protected({ children, roles }) {
  const { user, loading, isSuperAdmin } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label="Loading your workspace…" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (roles && !roles.includes(user.role) && !isSuperAdmin) {
    return <Navigate to="/app" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/chat/:slug" element={<PublicChat />} />

      <Route
        path="/app"
        element={
          <Protected>
            <Shell />
          </Protected>
        }
      >
        <Route index element={<Overview />} />
        <Route
          path="ai-agents"
          element={
            <Protected roles={['business_admin']}>
              <Agents />
            </Protected>
          }
        />
        <Route
          path="knowledge"
          element={
            <Protected roles={['business_admin']}>
              <Knowledge />
            </Protected>
          }
        />
        <Route
          path="chat-widget"
          element={
            <Protected roles={['business_admin']}>
              <ChatWidget />
            </Protected>
          }
        />
        <Route path="conversations" element={<Conversations />} />
        <Route path="leads" element={<Leads />} />
        <Route
          path="customers"
          element={
            <Protected roles={['business_admin']}>
              <Customers />
            </Protected>
          }
        />
        <Route path="appointments" element={<Appointments />} />
        <Route
          path="calls"
          element={
            <Protected roles={['business_admin']}>
              <Calls />
            </Protected>
          }
        />
        <Route
          path="staff"
          element={
            <Protected roles={['business_admin']}>
              <Staff />
            </Protected>
          }
        />
        <Route
          path="reports"
          element={
            <Protected roles={['business_admin']}>
              <Reports />
            </Protected>
          }
        />
        <Route
          path="subscription"
          element={
            <Protected roles={['business_admin']}>
              <Subscription />
            </Protected>
          }
        />
        <Route
          path="settings"
          element={
            <Protected roles={['business_admin']}>
              <Settings />
            </Protected>
          }
        />
        <Route path="notifications" element={<Notifications />} />
        <Route path="profile" element={<Profile />} />
        <Route
          path="businesses"
          element={
            <Protected roles={['super_admin']}>
              <Businesses />
            </Protected>
          }
        />
        <Route
          path="platform-users"
          element={
            <Protected roles={['super_admin']}>
              <PlatformUsers />
            </Protected>
          }
        />
        <Route
          path="plans"
          element={
            <Protected roles={['super_admin']}>
              <Plans />
            </Protected>
          }
        />
        <Route
          path="audit"
          element={
            <Protected roles={['super_admin']}>
              <AuditLogs />
            </Protected>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
