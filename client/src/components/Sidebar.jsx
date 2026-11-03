import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  BookOpenCheck, Bus, CalendarCheck2, ChevronLeft, ChevronRight, LayoutDashboard,
  LogOut, Settings as SettingsIcon, ShieldAlert, Users, X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';

const menuItems = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'PATRON', 'MATRON', 'DOD', 'SECURITY'] },
  { label: 'Student Directory', to: '/students', icon: Users, roles: ['ADMIN', 'PATRON', 'MATRON', 'DOD'] },
  { label: 'Attendance', to: '/attendance', icon: CalendarCheck2, roles: ['ADMIN', 'PATRON', 'MATRON', 'DOD'] },
  { label: 'Permissions', to: '/permissions', icon: BookOpenCheck, roles: ['ADMIN', 'PATRON', 'MATRON', 'DOD'] },
  { label: 'Discipline', to: '/discipline', icon: ShieldAlert, roles: ['ADMIN', 'PATRON', 'MATRON', 'DOD'] },
  { label: 'Transport (Musanze Hub)', to: '/transport', icon: Bus, roles: ['ADMIN', 'PATRON', 'MATRON', 'DOD', 'SECURITY'] },
  { label: 'Gate Return Tracking', to: '/gate', icon: ShieldAlert, roles: ['SECURITY', 'ADMIN'] },
];

function SignOutModal({ open, busy, onCancel, onConfirm }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="signout-title">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-slate-950/60 backdrop-blur-sm animate-in"
      />
      <div className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-white p-6 shadow-2xl shadow-indigo-950/40 transition-all duration-200">
        <div className="flex items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 ring-8 ring-rose-50/60">
            <LogOut size={24} className="text-rose-500" />
          </div>
        </div>
        <h2 id="signout-title" className="mt-4 text-center text-lg font-bold text-slate-900">
          Are you sure you want to sign out?
        </h2>
        <p className="mt-2 text-center text-sm text-slate-500">
          You will need to sign in again to access your dashboard and modules.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 rounded-2xl bg-gradient-to-r from-rose-500 to-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition hover:from-rose-600 hover:to-rose-700 disabled:opacity-60"
          >
            {busy ? 'Signing out…' : 'Confirm Sign Out'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ user, isOpen, onClose }) {
  const { logout } = useAuth();
  const { wallpaper } = useTheme();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  async function confirmLogout() {
    setBusy(true);
    setLogoutError('');
    try {
      await logout();
      onClose?.();
      navigate('/login', { replace: true });
    } catch {
      setLogoutError('Unable to sign out. Check your connection and try again.');
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  const navItems = menuItems.filter((item) => item.roles.includes(user.role));

  return (
    <>
      <aside
        className={[
          'wp-glass fixed inset-y-0 left-0 z-40 flex flex-col border-r text-slate-200 shadow-2xl transition-all duration-300 md:relative md:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          collapsed ? 'w-20' : 'w-72',
          collapsed ? 'md:w-20' : 'md:w-72',
        ].join(' ')}
      >
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div className={`flex items-center gap-3 overflow-hidden ${collapsed ? 'justify-center' : ''}`}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">
              D
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-300">Digital MIPC</p>
                <p className="text-sm font-semibold text-white">EDU Portal</p>
              </div>
            )}
          </div>

          <button
            type="button"
            className="hidden rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white md:inline-flex"
            onClick={() => setCollapsed((current) => !current)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white md:hidden"
            aria-label="Close sidebar"
          >
            <X size={16} />
          </button>
        </div>

        <div className={`px-3 py-4 ${collapsed ? 'px-2' : ''}`}>
          <p className={`mb-3 truncate text-xs font-semibold uppercase tracking-[0.22em] text-indigo-300 ${collapsed ? 'hidden' : 'block'}`}>
            {user.full_name}
          </p>
          {!collapsed && (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
              <span className="font-medium text-white">{user.role}</span>
              <span className="ml-2 text-xs text-indigo-300">{wallpaper.name}</span>
            </div>
          )}
        </div>

        <nav aria-label="Main navigation" className="flex-1 space-y-1 px-3 pb-4">
          {navItems.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                [
                  'group flex items-center gap-3 rounded-2xl px-3 py-2.5 font-medium transition-all duration-200',
                  collapsed ? 'justify-center px-0' : '',
                  isActive
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white',
                ].join(' ')
              }
            >
              <Icon size={18} className={collapsed ? '' : 'shrink-0'} />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}

          <NavLink
            to="/settings"
            onClick={onClose}
            className={({ isActive }) =>
              [
                'group flex items-center gap-3 rounded-2xl px-3 py-2.5 font-medium transition-all duration-200',
                collapsed ? 'justify-center px-0' : '',
                isActive
                  ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white',
              ].join(' ')
            }
          >
            <SettingsIcon size={18} className={collapsed ? '' : 'shrink-0'} />
            {!collapsed && <span className="truncate">Settings</span>}
          </NavLink>
        </nav>

        <div className="border-t border-white/10 p-3">
          {logoutError && (
            <p className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200" role="alert">
              {logoutError}
            </p>
          )}
          <button
            className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 font-medium text-slate-300 transition hover:bg-rose-500/15 hover:text-rose-200 ${collapsed ? 'justify-center px-0' : ''}`}
            onClick={() => setConfirmOpen(true)}
            type="button"
          >
            <LogOut size={18} />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      <SignOutModal
        open={confirmOpen}
        busy={busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirmLogout}
      />
    </>
  );
}

export default Sidebar;
