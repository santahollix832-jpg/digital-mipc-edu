import React, { useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import LoginForm from './components/auth/LoginForm';
import RegisterForm from './components/auth/RegisterForm';
import ProtectedRoute from './components/auth/ProtectedRoute';
import DisciplineDashboard from './components/discipline/DisciplineDashboard';
import Permissions from './components/Permissions';
import Students from './components/Students';
import Attendance from './components/Attendance';
import Sidebar from './components/Sidebar';
import { ToastProvider } from './components/ToastProvider';

const roleLandingPage = {
  ADMIN: '/students',
  PATRON: '/students',
  BURSAR: '/students',
  TEACHER: '/students',
};

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
    <main className="p-6 md:p-10">
      <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Dashboard</p>
      <h1 className="mt-2 text-3xl font-bold text-slate-900">Welcome, {user.full_name}</h1>
      {location.state?.notice && (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800" role="status">
          {location.state.notice}
        </p>
      )}
      <p className="mt-3 text-slate-600">You are signed in as {user.role}.</p>
    </main>
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
      </AuthProvider>
    </BrowserRouter>
  );
}

function AuthenticatedApp() {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="md:hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white">D</div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Digital MIPC</p>
              <p className="text-sm font-semibold text-slate-800">EDU</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen((current) => !current)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
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
              <ProtectedRoute>
                <Students />
              </ProtectedRoute>
            } />
            <Route path="/discipline/*" element={
              <ProtectedRoute roles={['ADMIN', 'PATRON']}>
                <DisciplineDashboard />
              </ProtectedRoute>
            } />
            <Route path="/permissions/*" element={
              <ProtectedRoute roles={['ADMIN', 'PATRON', 'TEACHER']}>
                <Permissions />
              </ProtectedRoute>
            } />
            <Route path="/attendance/*" element={
              <ProtectedRoute roles={['ADMIN', 'PATRON', 'TEACHER']}>
                <Attendance />
              </ProtectedRoute>
            } />
            <Route path="/school-fees/*" element={
              <ProtectedRoute roles={['ADMIN', 'BURSAR']}>
                <ModulePlaceholder title="School Fees" />
              </ProtectedRoute>
            } />
            <Route path="*" element={<Navigate to={roleLandingPage[user.role] || '/students'} replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

export default App;
