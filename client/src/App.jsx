import { useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import LoginForm from './components/auth/LoginForm';
import RegisterForm from './components/auth/RegisterForm';
import ProtectedRoute from './components/auth/ProtectedRoute';
import DisciplineDashboard from './components/discipline/DisciplineDashboard';
import Permissions from './components/Permissions';
import Students from './components/Students';
import Attendance from './components/Attendance';
import Sidebar from './components/Sidebar';
import GateReturnTracking from './components/GateReturnTracking';
import TransportTracking from './components/TransportTracking';
import TransportManagement from './components/transport/TransportManagement';
import SMSNotificationsDashboard from './components/sms/SMSNotificationsDashboard';
import SmartBell from './components/SmartBell';
import Settings from './components/Settings';
import RoleDashboard from './components/RoleDashboard';
import { ThemeProvider } from './theme/ThemeContext';
import { ToastProvider } from './components/ToastProvider';
import ErrorBoundary from './components/ErrorBoundary';

const roleLandingPage = {
  ADMIN: '/dashboard',
  PATRON: '/dashboard',
  MATRON: '/dashboard',
  DOD: '/dashboard',
  SECURITY: '/dashboard',
  TEACHER: '/students',
};

function ThemeProviderWrapper({ children }) {
  const { user } = useAuth();
  return (
    <ThemeProvider user={user}>
      {children}
      <style>{`
        @keyframes mipc-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-up { animation: mipc-fade-up 250ms ease both; }
        .animate-in { animation: mipc-fade-in 150ms ease both; }
        @keyframes mipc-fade-in { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </ThemeProvider>
  );
}

function LoginPage() {
  const { user, login, loading, authError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <main className="p-10 text-slate-600">Checking your session…</main>;
  if (user) return <Navigate to={location.state?.from?.pathname || roleLandingPage[user.role] || '/dashboard'} replace />;

  async function handleLogin(username, password) {
    setError('');
    setSubmitting(true);
    try {
      const loggedInUser = await login(username, password);
      navigate(location.state?.from?.pathname || roleLandingPage[loggedInUser.role] || '/dashboard', {
        replace: true,
      });
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return <LoginForm onSubmit={handleLogin} submitting={submitting} error={error || authError} />;
}

function Dashboard() {
  const { user } = useAuth();
  const location = useLocation();
  return (
    <>
      {location.state?.notice && (
        <main className="p-4 md:p-8">
          <p className="rounded-2xl border border-emerald-300/40 bg-emerald-500/15 px-4 py-3 text-emerald-100 backdrop-blur" role="status">
            {location.state.notice}
          </p>
        </main>
      )}
      <RoleDashboard role={user.role} />
    </>
  );
}

function RegisterPage() {
  const { createAccount } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleRegister(account) {
    setError('');
    setSubmitting(true);
    try {
      await createAccount(account);
      navigate('/dashboard', {
        replace: true,
        state: { notice: `Account created for ${account.full_name}.` },
      });
    } catch (registrationError) {
      setError(registrationError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return <RegisterForm onSubmit={handleRegister} submitting={submitting} error={error} />;
}

function RegisterRoute() {
  const { user, loading } = useAuth();

  if (loading) return <main className="p-10 text-slate-600">Checking your session…</main>;
  if (!user) {
    return (
      <main className="mipc-register">
        <section className="mipc-register__panel">
          <h1>Account creation is restricted</h1>
          <p>Staff accounts are created by an administrator. Sign in with an administrator account to continue.</p>
          <Link className="mipc-register__back" to="/login" state={{ from: { pathname: '/register' } }}>
            Sign in as administrator
          </Link>
        </section>
      </main>
    );
  }
  if (user.role !== 'ADMIN') {
    return (
      <main className="mipc-register">
        <section className="mipc-register__panel">
          <h1>Administrator access required</h1>
          <p>Your account does not have permission to create staff accounts.</p>
          <Link className="mipc-register__back" to="/dashboard">Return to dashboard</Link>
        </section>
      </main>
    );
  }
  return <RegisterPage />;
}

function ModulePlaceholder({ title }) {
  return (
    <main className="p-6 md:p-10">
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      <p className="mt-2 text-slate-600">This module is not available in the current frontend.</p>
    </main>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LanguageProvider>
          <ThemeProviderWrapper>
            <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterRoute />} />
            <Route path="*" element={
              <ProtectedRoute>
                <AuthenticatedApp />
              </ProtectedRoute>
            } />
                    </Routes>
        </ToastProvider>
        </ThemeProviderWrapper>
        </LanguageProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

function AuthenticatedApp() {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell min-h-screen text-white">
      <ErrorBoundary>
      <div className="md:hidden">
        <div className="wp-glass flex items-center justify-between border-b px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white shadow-lg shadow-indigo-500/40">D</div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-indigo-300">Digital MIPC</p>
              <p className="text-sm font-semibold text-white">EDU</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen((current) => !current)}
            className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white backdrop-blur"
          >
            Menu
          </button>
        </div>
      </div>

      <div className="md:flex md:min-h-screen">
        <Sidebar user={user} isOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
        {mobileOpen && <button type="button" aria-label="Close navigation overlay" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-slate-950/35 md:hidden" />}
        <div className="min-w-0 flex-1">
          <Routes>
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/students/*" element={
              <ProtectedRoute roles={['ADMIN', 'PATRON', 'MATRON', 'DOD']}>
                <Students />
              </ProtectedRoute>
            } />
            <Route path="/discipline/*" element={
              <ProtectedRoute roles={['ADMIN', 'PATRON', 'MATRON', 'DOD']}>
                <DisciplineDashboard />
              </ProtectedRoute>
            } />
            <Route path="/permissions/*" element={
              <ProtectedRoute roles={['ADMIN', 'PATRON', 'MATRON', 'DOD']}>
                <Permissions />
              </ProtectedRoute>
            } />
                        <Route path="/attendance/*" element={
              <ProtectedRoute roles={['ADMIN', 'PATRON', 'MATRON', 'DOD', 'TEACHER']}>
                <Attendance />
              </ProtectedRoute>
            } />
            <Route path="/gate/*" element={
              <ProtectedRoute roles={['SECURITY', 'ADMIN']}>
                <GateReturnTracking />
              </ProtectedRoute>
            } />
            <Route path="/transport/*" element={
              <ProtectedRoute roles={['ADMIN', 'PATRON', 'MATRON', 'DOD', 'SECURITY']}>
                <TransportManagement />
              </ProtectedRoute>
            } />
            <Route path="/sms/*" element={
              <ProtectedRoute roles={['ADMIN', 'PATRON', 'MATRON', 'DOD', 'TEACHER', 'BURSAR', 'SECURITY']}>
                <SMSNotificationsDashboard />
              </ProtectedRoute>
            } />
            <Route path="/settings/*" element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            } />
            <Route path="/smart-bell/*" element={
              <ProtectedRoute roles={['ADMIN', 'TEACHER', 'PATRON', 'MATRON', 'DOD', 'SECURITY']}>
                <SmartBell />
              </ProtectedRoute>
            } />
            <Route path="*" element={<Navigate to={roleLandingPage[user.role] || '/students'} replace />} />
          </Routes>
        </div>
      </div>
      </ErrorBoundary>
    </div>
  );
}

export default App;
