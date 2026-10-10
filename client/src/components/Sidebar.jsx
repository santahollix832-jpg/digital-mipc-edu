import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { BookOpenCheck, CalendarCheck2, ChevronLeft, ChevronRight, GraduationCap, LogOut, Menu, ShieldAlert, Users, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const menuItems = [
  { label: 'Students', to: '/students', icon: Users, roles: ['ADMIN', 'PATRON', 'BURSAR', 'TEACHER'] },
  { label: 'Attendance', to: '/attendance', icon: CalendarCheck2, roles: ['ADMIN', 'PATRON', 'TEACHER'] },
  { label: 'Permissions', to: '/permissions', icon: BookOpenCheck, roles: ['ADMIN', 'PATRON', 'TEACHER'] },
  { label: 'Discipline', to: '/discipline', icon: ShieldAlert, roles: ['ADMIN', 'PATRON'] },
  { label: 'School Fees', to: '/school-fees', icon: GraduationCap, roles: ['ADMIN', 'BURSAR'] },
];

function Sidebar({ user, isOpen, onClose }) {
  const { logout } = useAuth();
  const [logoutError, setLogoutError] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  async function handleLogout() {
    setLogoutError('');
    try {
      await logout();
      onClose?.();
    } catch {
      setLogoutError('Unable to sign out. Check your connection and try again.');
    }
  }

  const navItems = menuItems.filter((item) => item.roles.includes(user.role));

  return (
    <>
      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-200 bg-slate-950 text-slate-200 shadow-2xl transition-all duration-300 md:relative md:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          collapsed ? 'w-20' : 'w-72',
          'md:w-72',
          collapsed ? 'md:w-20' : 'md:w-72'
        ].join(' ')}
      >
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <div className={`flex items-center gap-3 overflow-hidden ${collapsed ? 'justify-center' : ''}`}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">
              D
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Digital MIPC</p>
                <p className="text-sm font-semibold text-white">EDU Portal</p>
              </div>
            )}
          </div>

          <button
            type="button"
            className="hidden rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 transition hover:border-slate-600 hover:text-white md:inline-flex"
            onClick={() => setCollapsed((current) => !current)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 transition hover:border-slate-600 hover:text-white md:hidden"
            aria-label="Close sidebar"
          >
            <X size={16} />
          </button>
        </div>

        <div className={`px-3 py-4 ${collapsed ? 'px-2' : ''}`}>
          <p className={`mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 ${collapsed ? 'hidden' : 'block'}`}>
            {user.full_name}
          </p>
          {!collapsed && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-300">
              <span className="font-medium text-white">{user.role}</span>
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
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                ].join(' ')
              }
            >
              <Icon size={18} className={collapsed ? '' : 'shrink-0'} />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-800 p-3">
          {logoutError && (
            <p className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200" role="alert">
              {logoutError}
            </p>
          )}
          <button
            className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 font-medium text-slate-300 transition hover:bg-rose-500/10 hover:text-rose-200 ${collapsed ? 'justify-center px-0' : ''}`}
            onClick={handleLogout}
            type="button"
          >
            <LogOut size={18} />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
