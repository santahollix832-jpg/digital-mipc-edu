import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowUpRight, ArrowDownRight, Bell, Bus, CalendarCheck2, Clock, DoorOpen,
  ShieldAlert, TrendingUp, UserCheck, Users, Activity, RefreshCw, Wifi, WifiOff, Loader2,
} from 'lucide-react';
import {
  useStudentCount, useLeavePermissions, useDisciplineMetrics,
  useAttendanceSummary, useTransportStats, useGateStatus,
} from './dashboardService';

/* ------------------------------ Shared primitives ------------------------------ */

function TrendBadge({ trend, value }) {
  const up = trend >= 0;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
      {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {up ? '+' : ''}{trend}% · {value}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, trend, trendLabel, accent = 'from-indigo-500 to-indigo-600', loading }) {
  return (
    <div className="group rounded-3xl border border-white/10 bg-white p-5 shadow-xl shadow-slate-900/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl">
      <div className="flex items-center justify-between">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${accent} text-white shadow-lg`}>
          <Icon size={20} />
        </div>
        {typeof trend === 'number' && <TrendBadge trend={trend} value={trendLabel || 'vs last week'} />}
      </div>
      <p className={`mt-4 text-3xl font-extrabold tracking-tight text-slate-900 ${loading ? 'animate-pulse text-slate-300' : ''}`}>
        {loading ? '····' : value}
      </p>
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

function CardSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-3">
      {[...Array(rows)].map((_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-2xl bg-slate-100" />
      ))}
    </div>
  );
}

function WidgetLoading() {
  return (
    <div className="flex items-center gap-2 py-8 text-sm font-medium text-slate-400">
      <Loader2 size={16} className="animate-spin" /> Loading live data…
    </div>
  );
}

function ErrorNotice({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800" role="status">
      <WifiOff size={16} />
      <span className="flex-1">{message} The dashboard stays available — showing the last known values as “—” until the connection recovers.</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
        >
          <RefreshCw size={13} /> Retry
        </button>
      )}
    </div>
  );
}

function ProgressRow({ label, value, max, color = 'bg-indigo-500' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
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

function ActionList({ items, emptyText = 'Nothing here — all clear.' }) {
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
      {items.length === 0 && <li className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">{emptyText}</li>}
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

function QuickActionsCard({ role }) {
  return (
    <WidgetCard title="Quick actions" icon={ArrowUpRight} accent="from-fuchsia-500 to-purple-600">
      <div className="space-y-3">
        {(sharedQuickLinks[role] || sharedQuickLinks.ADMIN).map((l) => <QuickLink key={l.label} {...l} />)}
      </div>
    </WidgetCard>
  );
}

function WidgetError({ error, onRetry, children }) {
  return (
    <>
      <ErrorNotice message={error} onRetry={onRetry} />
      {error ? <CardSkeleton /> : children}
    </>
  );
}

/* ------------------------------ Role dashboards ------------------------------ */

function AdminDashboard() {
  const students = useStudentCount();
  const discipline = useDisciplineMetrics();
  const attendance = useAttendanceSummary();
  const transport = useTransportStats();

  const presentRate = attendance.data && attendance.data.totalEnrolled > 0
    ? Math.round((attendance.data.present / attendance.data.totalEnrolled) * 100)
    : 0;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Enrolled students" value={students.data?.total.toLocaleString() ?? '—'} loading={students.loading} accent="from-indigo-500 to-indigo-600" />
        <StatCard icon={ShieldAlert} label="Discipline incidents recorded" value={discipline.data ? discipline.data.totalIncidents.toLocaleString() : '—'} loading={discipline.loading} accent="from-rose-500 to-rose-600" />
        <StatCard icon={Bus} label="Buses in transit" value={transport.data ? `${transport.data.activeBuses} / ${transport.data.totalBuses}` : '—'} loading={transport.loading} accent="from-amber-500 to-orange-600" />
        <StatCard icon={CalendarCheck2} label={`Present today${attendance.data ? ` · ${attendance.data.date}` : ''}`} value={attendance.data ? `${presentRate}%` : '—'} loading={attendance.loading} accent="from-emerald-500 to-emerald-600" />
      </div>

      <div className="mt-4">
        <ErrorNotice
          message={[students.error, discipline.error, attendance.error, transport.error].filter(Boolean)[0]}
          onRetry={() => { students.reload(); discipline.reload(); attendance.reload(); transport.reload(); }}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <WidgetCard title="Attendance breakdown today" icon={CalendarCheck2} accent="from-sky-500 to-blue-600">
          {attendance.loading ? <WidgetLoading /> : (
            <div className="space-y-4">
              <ProgressRow label="Present" value={attendance.data?.present ?? 0} max={attendance.data?.totalEnrolled ?? 0} color="bg-emerald-500" />
              <ProgressRow label="Late" value={attendance.data?.late ?? 0} max={attendance.data?.totalEnrolled ?? 0} color="bg-amber-500" />
              <ProgressRow label="Absent" value={attendance.data?.absent ?? 0} max={attendance.data?.totalEnrolled ?? 0} color="bg-rose-500" />
              <ProgressRow label="On permission" value={attendance.data?.permission ?? 0} max={attendance.data?.totalEnrolled ?? 0} color="bg-sky-500" />
              <p className="text-xs text-slate-400">{attendance.data?.unmarked ?? 0} student(s) not yet marked.</p>
            </div>
          )}
        </WidgetCard>

        <WidgetCard title="Discipline overview" icon={ShieldAlert} accent="from-rose-500 to-rose-600">
          {discipline.loading ? <WidgetLoading /> : (
            <div className="space-y-4">
              <ProgressRow label="Pending incident approvals" value={discipline.data?.pending ?? 0} max={Math.max(discipline.data?.totalIncidents ?? 0, 1)} color="bg-amber-500" />
              <ProgressRow label="Approved incidents" value={discipline.data?.approved ?? 0} max={Math.max(discipline.data?.totalIncidents ?? 0, 1)} color="bg-rose-500" />
              <ProgressRow label="Corrective actions completed" value={discipline.data?.completedActions ?? 0} max={Math.max((discipline.data?.completedActions ?? 0) + (discipline.data?.pendingActions ?? 0) + (discipline.data?.inProgressActions ?? 0), 1)} color="bg-emerald-500" />
              <p className="text-xs text-slate-400">Merits awarded: {discipline.data?.totalMerits ?? 0} · Demerits: {discipline.data?.totalDemerits ?? 0}</p>
            </div>
          )}
        </WidgetCard>

        <QuickActionsCard role="ADMIN" />
      </div>
    </>
  );
}

function DodDashboard() {
  const discipline = useDisciplineMetrics();
  const students = useStudentCount();
  const attendance = useAttendanceSummary();

  const topClasses = useMemo(() => (discipline.data?.incidentsByClass || []).slice(0, 4), [discipline.data]);
  const maxClassIncidents = topClasses[0]?.count || 1;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ShieldAlert} label="Pending incident approvals" value={discipline.data ? discipline.data.pending.toLocaleString() : '—'} loading={discipline.loading} accent="from-rose-500 to-rose-600" />
        <StatCard icon={AlertTriangle} label="Total incidents on record" value={discipline.data ? discipline.data.totalIncidents.toLocaleString() : '—'} loading={discipline.loading} accent="from-orange-500 to-red-600" />
        <StatCard icon={Users} label="Students in directory" value={students.data?.total.toLocaleString() ?? '—'} loading={students.loading} accent="from-amber-500 to-orange-600" />
        <StatCard icon={CalendarCheck2} label="Marked absent today" value={attendance.data ? attendance.data.absent.toLocaleString() : '—'} loading={attendance.loading} accent="from-sky-500 to-blue-600" />
      </div>

      <div className="mt-4">
        <ErrorNotice
          message={[discipline.error, students.error, attendance.error].filter(Boolean)[0]}
          onRetry={() => { discipline.reload(); students.reload(); attendance.reload(); }}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <WidgetCard title="Incidents by class (live)" icon={TrendingUp} accent="from-rose-500 to-rose-600">
          {discipline.loading ? <WidgetLoading /> : (
            <div className="space-y-4">
              {topClasses.length === 0 && <p className="py-4 text-center text-sm text-slate-400">No incidents recorded for any class.</p>}
              {topClasses.map((row) => (
                <ProgressRow
                  key={row.label}
                  label={`${row.label || 'Unassigned'}`}
                  value={row.count}
                  max={maxClassIncidents}
                  color="bg-rose-500"
                />
              ))}
            </div>
          )}
        </WidgetCard>

        <WidgetCard title="Corrective actions pipeline" icon={Clock} accent="from-indigo-500 to-indigo-600">
          {discipline.loading ? <WidgetLoading /> : (
            <div className="space-y-4">
              <ProgressRow label="Pending" value={discipline.data?.pendingActions ?? 0} max={Math.max((discipline.data?.pendingActions ?? 0) + (discipline.data?.inProgressActions ?? 0) + (discipline.data?.completedActions ?? 0), 1)} color="bg-amber-500" />
              <ProgressRow label="In progress" value={discipline.data?.inProgressActions ?? 0} max={Math.max((discipline.data?.pendingActions ?? 0) + (discipline.data?.inProgressActions ?? 0) + (discipline.data?.completedActions ?? 0), 1)} color="bg-indigo-500" />
              <ProgressRow label="Completed" value={discipline.data?.completedActions ?? 0} max={Math.max((discipline.data?.pendingActions ?? 0) + (discipline.data?.inProgressActions ?? 0) + (discipline.data?.completedActions ?? 0), 1)} color="bg-emerald-500" />
            </div>
          )}
        </WidgetCard>

        <QuickActionsCard role="DOD" />
      </div>
    </>
  );
}

function PatronMatronDashboard({ role }) {
  const isPatron = role === 'PATRON';
  const students = useStudentCount();
  const permissions = useLeavePermissions();
  const attendance = useAttendanceSummary();

  const attendanceRate = attendance.data && attendance.data.totalEnrolled > 0
    ? Math.round(((attendance.data.present + attendance.data.late) / attendance.data.totalEnrolled) * 100)
    : 0;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Students under care" value={students.data?.total.toLocaleString() ?? '—'} loading={students.loading} accent="from-emerald-500 to-emerald-600" />
        <StatCard icon={DoorOpen} label="Students out on leave" value={permissions.data ? permissions.data.active.toLocaleString() : '—'} loading={permissions.loading} accent="from-indigo-500 to-indigo-600" />
        <StatCard icon={CalendarCheck2} label={`Attendance rate (present + late)`} value={attendance.data ? `${attendanceRate}%` : '—'} loading={attendance.loading} accent="from-sky-500 to-blue-600" />
        <StatCard icon={AlertTriangle} label="Pending leave requests" value={permissions.data ? permissions.data.pending.toLocaleString() : '—'} loading={permissions.loading} accent="from-amber-500 to-orange-600" />
      </div>

      <div className="mt-4">
        <ErrorNotice
          message={[students.error, permissions.error, attendance.error].filter(Boolean)[0]}
          onRetry={() => { students.reload(); permissions.reload(); attendance.reload(); }}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <WidgetCard title="Pending leave requests (live queue)" icon={DoorOpen} accent="from-emerald-500 to-teal-600">
          {permissions.loading ? <WidgetLoading /> : (
            <ActionList
              emptyText="No pending leave requests."
              items={(permissions.data?.pendingList || []).map((p) => ({
                title: `${p.student_name || 'Student'} — ${p.reason || 'Leave request'}`,
                meta: `${p.status} · departs ${p.departure_time ? new Date(p.departure_time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'TBC'}`,
                color: 'bg-amber-500',
              }))}
            />
          )}
        </WidgetCard>

        <WidgetCard title={isPatron ? 'Leave & return snapshot' : 'Leave & return snapshot'} icon={Users} accent="from-sky-500 to-indigo-600">
          {permissions.loading ? <WidgetLoading /> : (
            <div className="space-y-4">
              <ProgressRow label="Approved (still out)" value={permissions.data?.active ?? 0} max={Math.max(permissions.data?.total ?? 0, 1)} color="bg-indigo-500" />
              <ProgressRow label="Overdue returns" value={permissions.data?.overdue ?? 0} max={Math.max(permissions.data?.total ?? 0, 1)} color="bg-rose-500" />
              <ProgressRow label="Returned safely" value={permissions.data?.returned ?? 0} max={Math.max(permissions.data?.total ?? 0, 1)} color="bg-emerald-500" />
              <p className="text-xs text-slate-400">{permissions.data?.total ?? 0} total permits on record.</p>
            </div>
          )}
        </WidgetCard>

        <QuickActionsCard role={role} />
      </div>
    </>
  );
}

function SecurityDashboard() {
  const gate = useGateStatus();
  const transport = useTransportStats();
  const students = useStudentCount();

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={DoorOpen} label="Students out on approved leave" value={gate.data ? gate.data.outsideNow.toLocaleString() : '—'} loading={gate.loading} accent="from-slate-600 to-slate-800" />
        <StatCard icon={Bus} label="Buses in transit" value={transport.data ? transport.data.activeBuses.toLocaleString() : '—'} loading={transport.loading} accent="from-amber-500 to-orange-600" />
        <StatCard icon={AlertTriangle} label="Overdue returns" value={gate.data ? gate.data.overdue.toLocaleString() : '—'} loading={gate.loading} accent="from-rose-500 to-rose-600" />
        <StatCard icon={Users} label="Students in directory" value={students.data?.total.toLocaleString() ?? '—'} loading={students.loading} accent="from-emerald-500 to-emerald-600" />
      </div>

      <div className="mt-4">
        <ErrorNotice
          message={[gate.error, transport.error, students.error].filter(Boolean)[0]}
          onRetry={() => { gate.reload(); transport.reload(); students.reload(); }}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <WidgetCard title="Live gate feed — students outside" icon={Activity} accent="from-slate-600 to-slate-800">
          {gate.loading ? <WidgetLoading /> : (
            <ActionList
              emptyText="No students are outside on leave right now."
              items={(gate.data?.active || []).slice(0, 5).map((row) => ({
                title: `${row.student_name || 'Student'} — ${row.reason || 'Leave'}`,
                meta: row.status === 'Overdue'
                  ? `OVERDUE · expected back ${row.expected_return_time ? new Date(row.expected_return_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}`
                  : `Approved · due back ${row.expected_return_time ? new Date(row.expected_return_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}`,
                color: row.status === 'Overdue' ? 'bg-rose-500' : 'bg-emerald-500',
              }))}
            />
          )}
        </WidgetCard>

        <WidgetCard title="Fleet status (live)" icon={Bus} accent="from-amber-500 to-orange-600">
          {transport.loading ? <WidgetLoading /> : (
            <div className="space-y-4">
              <ProgressRow label="In transit" value={transport.data?.activeBuses ?? 0} max={Math.max(transport.data?.totalBuses ?? 0, 1)} color="bg-emerald-500" />
              <ProgressRow label="Delayed" value={transport.data?.delayed ?? 0} max={Math.max(transport.data?.totalBuses ?? 0, 1)} color="bg-rose-500" />
              <ProgressRow label="Completed" value={transport.data?.completed ?? 0} max={Math.max(transport.data?.totalBuses ?? 0, 1)} color="bg-slate-600" />
              <p className="text-xs text-slate-400">{transport.data?.studentsInTransit ?? 0} student(s) currently on buses · on-time rate {transport.data?.onTimeRate ?? '0%'}.</p>
            </div>
          )}
        </WidgetCard>

        <QuickActionsCard role="SECURITY" />
      </div>
    </>
  );
}

function TeacherDashboard() {
  const students = useStudentCount();
  const attendance = useAttendanceSummary();

  const presentRate = attendance.data && attendance.data.totalEnrolled > 0
    ? Math.round((attendance.data.present / attendance.data.totalEnrolled) * 100)
    : 0;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Students in directory" value={students.data?.total.toLocaleString() ?? '—'} loading={students.loading} accent="from-indigo-500 to-indigo-600" />
        <StatCard icon={CalendarCheck2} label="Present today" value={attendance.data ? `${attendance.data.present} / ${attendance.data.totalEnrolled}` : '—'} loading={attendance.loading} accent="from-emerald-500 to-emerald-600" />
        <StatCard icon={AlertTriangle} label="Not marked yet" value={attendance.data ? attendance.data.unmarked.toLocaleString() : '—'} loading={attendance.loading} accent="from-amber-500 to-orange-600" />
        <StatCard icon={TrendingUp} label="Attendance rate" value={attendance.data ? `${presentRate}%` : '—'} loading={attendance.loading} accent="from-sky-500 to-blue-600" />
      </div>

      <div className="mt-4">
        <ErrorNotice
          message={[students.error, attendance.error].filter(Boolean)[0]}
          onRetry={() => { students.reload(); attendance.reload(); }}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <WidgetCard title="Today's register at a glance" icon={CalendarCheck2} accent="from-emerald-500 to-emerald-600">
          {attendance.loading ? <WidgetLoading /> : (
            <div className="space-y-4">
              <ProgressRow label="Present" value={attendance.data?.present ?? 0} max={attendance.data?.totalEnrolled ?? 0} color="bg-emerald-500" />
              <ProgressRow label="Late" value={attendance.data?.late ?? 0} max={attendance.data?.totalEnrolled ?? 0} color="bg-amber-500" />
              <ProgressRow label="Absent" value={attendance.data?.absent ?? 0} max={attendance.data?.totalEnrolled ?? 0} color="bg-rose-500" />
              <ProgressRow label="On permission" value={attendance.data?.permission ?? 0} max={attendance.data?.totalEnrolled ?? 0} color="bg-sky-500" />
            </div>
          )}
        </WidgetCard>

        <WidgetCard title="Class breakdown (live)" icon={Users} accent="from-indigo-500 to-indigo-600">
          {attendance.loading ? <WidgetLoading /> : (
            <div className="space-y-4">
              {(attendance.data?.classes || []).slice(0, 5).map((row) => (
                <ProgressRow
                  key={row.class_name}
                  label={row.class_name}
                  value={row.present || 0}
                  max={row.total_enrolled || 0}
                  color="bg-indigo-500"
                />
              ))}
              {(attendance.data?.classes || []).length === 0 && (
                <p className="py-4 text-center text-sm text-slate-400">No class data for the selected date.</p>
              )}
            </div>
          )}
        </WidgetCard>

        <QuickActionsCard role="TEACHER" />
      </div>
    </>
  );
}

/* ------------------------------ Root ------------------------------ */

export default function RoleDashboard({ role }) {
  const dashboards = {
    ADMIN: AdminDashboard,
    DOD: DodDashboard,
    PATRON: () => <PatronMatronDashboard role="PATRON" />,
    MATRON: () => <PatronMatronDashboard role="MATRON" />,
    TEACHER: TeacherDashboard,
    SECURITY: SecurityDashboard,
  };
  const Active = dashboards[role] || AdminDashboard;
  return (
    <main className="app-shell-inner p-4 md:p-8 lg:p-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-300">Executive Dashboard</p>
        <h1 className="mt-1 text-2xl font-bold text-white md:text-3xl">{role} Overview</h1>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-300">
          <Wifi size={13} /> Live database metrics — refreshed automatically every 30 seconds.
        </p>
      </header>
      <div className="animate-fade-up">
        <Active />
      </div>
    </main>
  );
}
