import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowUpRight, ArrowDownRight, Bell, Bus, CalendarCheck2, DoorOpen,
  ShieldAlert, TrendingUp, UserCheck, Users, Activity,
} from 'lucide-react';

function TrendBadge({ trend, value }) {
  const up = trend >= 0;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
      {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {up ? '+' : ''}{trend}% · {value}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, trend, trendLabel, accent = 'from-indigo-500 to-indigo-600' }) {
  return (
    <div className="group rounded-3xl border border-white/10 bg-white p-5 shadow-xl shadow-slate-900/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl">
      <div className="flex items-center justify-between">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${accent} text-white shadow-lg`}>
          <Icon size={20} />
        </div>
        {typeof trend === 'number' && <TrendBadge trend={trend} value={trendLabel || 'vs last week'} />}
      </div>
      <p className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-sm font-medium text-slate-500">{label}</p>
    </div>
  );
}

function WidgetCard({ title, icon: Icon, children, accent = 'from-indigo-500 to-indigo-600', action }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white p-6 shadow-xl shadow-slate-900/10">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${accent} text-white shadow`}>
            <Icon size={16} />
          </div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function ProgressRow({ label, value, max, color = 'bg-indigo-500' }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="font-bold text-slate-800">{value}/{max}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ActionList({ items }) {
  return (
    <ul className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3 transition hover:bg-slate-100">
          <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${item.color || 'bg-indigo-500'}`}>
            <Activity size={13} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">{item.title}</p>
            <p className="text-xs text-slate-400">{item.meta}</p>
          </div>
        </li>
      ))}
      {items.length === 0 && <li className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">Nothing here — all clear.</li>}
    </ul>
  );
}

function QuickLink({ to, icon: Icon, label, accent }) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg"
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${accent} text-white shadow`}>
        <Icon size={16} />
      </span>
      <span className="flex-1 text-sm font-semibold text-slate-700">{label}</span>
      <ArrowUpRight size={16} className="text-slate-300 transition group-hover:text-indigo-500" />
    </Link>
  );
}

const sharedQuickLinks = {
  ADMIN: [
    { to: '/settings', icon: UserCheck, label: 'System Settings', accent: 'from-indigo-500 to-indigo-600' },
    { to: '/students', icon: Users, label: 'Student Directory', accent: 'from-emerald-500 to-emerald-600' },
    { to: '/transport', icon: Bus, label: 'Musanze Hub Transport', accent: 'from-amber-500 to-orange-600' },
    { to: '/smart-bell', icon: Bell, label: 'IoT Smart Bell', accent: 'from-rose-500 to-rose-600' },
  ],
  DOD: [
    { to: '/discipline', icon: ShieldAlert, label: 'Discipline Center', accent: 'from-rose-500 to-rose-600' },
    { to: '/students', icon: Users, label: 'Student Directory', accent: 'from-indigo-500 to-indigo-600' },
    { to: '/attendance', icon: CalendarCheck2, label: 'Attendance', accent: 'from-emerald-500 to-emerald-600' },
    { to: '/settings', icon: UserCheck, label: 'Discipline Settings', accent: 'from-slate-600 to-slate-800' },
  ],
  PATRON: [
    { to: '/permissions', icon: DoorOpen, label: 'Leave Permissions', accent: 'from-emerald-500 to-teal-600' },
    { to: '/students', icon: Users, label: 'Student Directory', accent: 'from-indigo-500 to-indigo-600' },
    { to: '/transport', icon: Bus, label: 'Transport Tracking', accent: 'from-amber-500 to-orange-600' },
    { to: '/settings', icon: UserCheck, label: 'Welfare Settings', accent: 'from-slate-600 to-slate-800' },
  ],
  MATRON: [
    { to: '/permissions', icon: DoorOpen, label: 'Leave Permissions', accent: 'from-emerald-500 to-teal-600' },
    { to: '/students', icon: Users, label: 'Student Directory', accent: 'from-indigo-500 to-indigo-600' },
    { to: '/transport', icon: Bus, label: 'Transport Tracking', accent: 'from-amber-500 to-orange-600' },
    { to: '/settings', icon: UserCheck, label: 'Boarding Settings', accent: 'from-slate-600 to-slate-800' },
  ],
  SECURITY: [
    { to: '/gate', icon: ShieldAlert, label: 'Gate Return Tracking', accent: 'from-slate-600 to-slate-800' },
    { to: '/transport', icon: Bus, label: 'Transport Tracking', accent: 'from-amber-500 to-orange-600' },
    { to: '/settings', icon: UserCheck, label: 'Gate Settings', accent: 'from-indigo-500 to-indigo-600' },
  ],
};

/* ------------------------------ Role dashboards ------------------------------ */

function AdminDashboard() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Enrolled students" value="1,248" trend={3} trendLabel="this term" />
        <StatCard icon={ShieldAlert} label="Open discipline cases" value="17" trend={-12} accent="from-rose-500 to-rose-600" />
        <StatCard icon={Bus} label="Active conduits today" value="9" trend={5} accent="from-amber-500 to-orange-600" />
        <StatCard icon={Bell} label="IoT bell uptime" value="99.8%" trend={0} accent="from-emerald-500 to-emerald-600" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <WidgetCard title="Role activity this week" icon={TrendingUp}>
          <div className="space-y-4">
            <ProgressRow label="PATRON" value={82} max={100} />
            <ProgressRow label="MATRON" value={64} max={100} color="bg-sky-500" />
            <ProgressRow label="DOD" value={47} max={100} color="bg-rose-500" />
            <ProgressRow label="SECURITY" value={91} max={100} color="bg-slate-700" />
          </div>
        </WidgetCard>
        <WidgetCard title="Recent system events" icon={AlertTriangle} accent="from-amber-500 to-orange-600">
          <ActionList items={[
            { title: 'Nightly backup completed', meta: 'Today 23:00 · healthy', color: 'bg-emerald-500' },
            { title: 'DOD approved 4 incidents', meta: 'Yesterday 16:42', color: 'bg-rose-500' },
            { title: 'New staff account created', meta: 'Monday 09:15', color: 'bg-indigo-500' },
          ]} />
        </WidgetCard>
        <WidgetCard title="Quick actions" icon={ArrowUpRight} accent="from-fuchsia-500 to-purple-600">
          <div className="space-y-3">
            {(sharedQuickLinks.ADMIN || []).map((l) => <QuickLink key={l.label} {...l} />)}
          </div>
        </WidgetCard>
      </div>
    </>
  );
}

function DodDashboard() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ShieldAlert} label="Pending approvals" value="6" trend={-8} accent="from-rose-500 to-rose-600" />
        <StatCard icon={AlertTriangle} label="Critical incidents (7d)" value="3" trend={-25} accent="from-orange-500 to-red-600" />
        <StatCard icon={TrendingUp} label="Avg. resolution time" value="1.8d" trend={-15} accent="from-emerald-500 to-emerald-600" />
        <StatCard icon={Users} label="Students on watchlist" value="12" trend={4} accent="from-amber-500 to-orange-600" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <WidgetCard title="Awaiting your approval" icon={UserCheck} accent="from-rose-500 to-rose-600">
          <ActionList items={[
            { title: 'Incident #482 — Fighting (Critical)', meta: 'Filed by PATRON · 2h ago', color: 'bg-rose-500' },
            { title: 'Incident #481 — Disrespect to staff', meta: 'Filed by TEACHER · 5h ago', color: 'bg-amber-500' },
            { title: 'Corrective action plan — S3 IMB', meta: 'Submitted · yesterday', color: 'bg-indigo-500' },
          ]} />
        </WidgetCard>
        <WidgetCard title="Threshold breaches" icon={AlertTriangle} accent="from-orange-500 to-red-600">
          <div className="space-y-4">
            <ProgressRow label="Student #1042 — 18 pts" value={18} max={20} color="bg-rose-500" />
            <ProgressRow label="Student #0977 — 14 pts" value={14} max={20} color="bg-amber-500" />
            <ProgressRow label="Student #0861 — 11 pts" value={11} max={20} color="bg-amber-400" />
          </div>
        </WidgetCard>
        <WidgetCard title="Quick actions" icon={ArrowUpRight} accent="from-fuchsia-500 to-purple-600">
          <div className="space-y-3">
            {(sharedQuickLinks.DOD || []).map((l) => <QuickLink key={l.label} {...l} />)}
          </div>
        </WidgetCard>
      </div>
    </>
  );
}

function PatronMatronDashboard({ role }) {
  const isPatron = role === 'PATRON';
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Students under care" value={isPatron ? '312' : '286'} trend={2} accent="from-emerald-500 to-emerald-600" />
        <StatCard icon={DoorOpen} label="Departures today" value="14" trend={-6} accent="from-indigo-500 to-indigo-600" />
        <StatCard icon={CalendarCheck2} label="Attendance rate" value="96.4%" trend={1} accent="from-sky-500 to-blue-600" />
        <StatCard icon={AlertTriangle} label="Pending leave requests" value="7" trend={10} accent="from-amber-500 to-orange-600" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <WidgetCard title="Pending departure requests" icon={DoorOpen} accent="from-emerald-500 to-teal-600">
          <ActionList items={[
            { title: 'Aline M. — Weekend departure', meta: 'Guardian arriving 15:00 · escort confirmed', color: 'bg-emerald-500' },
            { title: 'Eric N. — Medical visit', meta: 'Matron endorsed · awaiting approval', color: 'bg-indigo-500' },
            { title: 'Diane U. — Family event', meta: 'Pending guardian confirmation', color: 'bg-amber-500' },
          ]} />
        </WidgetCard>
        <WidgetCard title={isPatron ? 'Weekly welfare snapshot' : 'Dormitory occupancy'} icon={Users} accent="from-sky-500 to-indigo-600">
          <div className="space-y-4">
            <ProgressRow label="Rooms occupied" value={92} max={100} />
            <ProgressRow label="Medical flags resolved" value={18} max={21} color="bg-rose-500" />
            <ProgressRow label="Returns on schedule" value={53} max={56} color="bg-emerald-500" />
          </div>
        </WidgetCard>
        <WidgetCard title="Quick actions" icon={ArrowUpRight} accent="from-fuchsia-500 to-purple-600">
          <div className="space-y-3">
            {(sharedQuickLinks[role] || []).map((l) => <QuickLink key={l.label} {...l} />)}
          </div>
        </WidgetCard>
      </div>
    </>
  );
}

function SecurityDashboard() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ShieldAlert} label="Gate entries today" value="213" trend={7} accent="from-slate-600 to-slate-800" />
        <StatCard icon={Bus} label="Conduits handled" value="9" trend={5} accent="from-amber-500 to-orange-600" />
        <StatCard icon={AlertTriangle} label="Overdue returns" value="4" trend={-20} accent="from-rose-500 to-rose-600" />
        <StatCard icon={UserCheck} label="Verified guardians" value="67" trend={12} accent="from-emerald-500 to-emerald-600" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <WidgetCard title="Live gate feed" icon={Activity} accent="from-slate-600 to-slate-800">
          <ActionList items={[
            { title: 'Gate A — Guardian pickup verified', meta: '14:22 · Student #1042', color: 'bg-emerald-500' },
            { title: 'Gate B — Conduit BUS-07 departed', meta: '14:05 · 38 students aboard', color: 'bg-amber-500' },
            { title: 'Gate A — Unverified visitor turned away', meta: '13:47 · escalated to admin', color: 'bg-rose-500' },
          ]} />
        </WidgetCard>
        <WidgetCard title="Overdue watch" icon={AlertTriangle} accent="from-rose-500 to-orange-500">
          <ActionList items={[
            { title: 'Student #0861 — 34 min overdue', meta: 'Escort notified · audio alert sent', color: 'bg-rose-500' },
            { title: 'Conduit BUS-03 — 12 min overdue', meta: 'Driver contacted', color: 'bg-amber-500' },
          ]} />
        </WidgetCard>
        <WidgetCard title="Quick actions" icon={ArrowUpRight} accent="from-fuchsia-500 to-purple-600">
          <div className="space-y-3">
            {(sharedQuickLinks.SECURITY || []).map((l) => <QuickLink key={l.label} {...l} />)}
          </div>
        </WidgetCard>
      </div>
    </>
  );
}

export default function RoleDashboard({ role }) {
  const dashboards = {
    ADMIN: AdminDashboard,
    DOD: DodDashboard,
    PATRON: () => <PatronMatronDashboard role="PATRON" />,
    MATRON: () => <PatronMatronDashboard role="MATRON" />,
    SECURITY: SecurityDashboard,
  };
  const Active = dashboards[role] || AdminDashboard;
  return (
    <main className="app-shell-inner p-4 md:p-8 lg:p-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-300">Executive Dashboard</p>
        <h1 className="mt-1 text-2xl font-bold text-white md:text-3xl">{role} Overview</h1>
      </header>
      <div className="animate-fade-up">
        <Active />
      </div>
    </main>
  );
}
