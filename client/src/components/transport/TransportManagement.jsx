import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft, Bus, CheckCircle2, Home, Loader2, MapPin, RefreshCw,
  Search, UserRound, Users, X,
} from 'lucide-react';
import { apiFetch } from '../../api/config';
import { useToast } from '../ToastProvider';

// Routes are locked to the four official options school-wide.
export const ALLOWED_ROUTES = ['Kigali', 'Rubavu', 'Musanze', 'Parent Pick-Up'];
const BUS_ROUTES = ALLOWED_ROUTES.filter((r) => r !== 'Parent Pick-Up');

const ROUTE_META = {
  Kigali: { icon: Bus, tone: 'bg-sky-50 text-sky-700 border-sky-200', dot: 'bg-sky-500' },
  Rubavu: { icon: Bus, tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  Musanze: { icon: MapPin, tone: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500' },
  'Parent Pick-Up': { icon: Home, tone: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
};

const PAYMENT_BADGE = {
  'Fully Paid': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Partial Payment': 'bg-amber-50 text-amber-700 border-amber-200',
  'Unpaid': 'bg-rose-50 text-rose-700 border-rose-200',
};

const emptyBusForm = {
  bus_number: '',
  driver_name: '',
  route_name: '',
  status: 'In Transit',
  speed: '',
  capacity: 50,
  passengers_count: '',
  driver_phone: '',
};

function Modal({ open, title, icon: Icon, onClose, children, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close dialog" onClick={onClose} className="absolute inset-0 cursor-default bg-slate-950/50 backdrop-blur-sm animate-in" />
      <div className={`relative max-h-[90vh] w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl animate-fade-up`}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {Icon && <Icon size={20} className="text-indigo-600" />}
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TransportManagement({ user }) {
  const { notify } = useToast();
  const [tab, setTab] = useState('roster');
  const [students, setStudents] = useState([]);
  const [counts, setCounts] = useState([]);
  const [routes, setRoutes] = useState(ALLOWED_ROUTES);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [routeFilter, setRouteFilter] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [buses, setBuses] = useState([]);
  const [busLoading, setBusLoading] = useState(false);
  const [showAddBus, setShowAddBus] = useState(false);
  const [busForm, setBusForm] = useState(emptyBusForm);
  const [savingBus, setSavingBus] = useState(false);

  // Transfer modal
  const [transferStudent, setTransferStudent] = useState(null);
  const [transferRoute, setTransferRoute] = useState('');
  const [transferring, setTransferring] = useState(false);

  const canManage = ['ADMIN', 'PATRON', 'MATRON', 'DOD'].includes(user?.role);

  const loadStudents = useCallback(async (opts = {}) => {
    if (!opts.silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (routeFilter) params.set('route', routeFilter);
      if (search.trim()) params.set('search', search.trim());
      const response = await apiFetch(`/transport/students${params.toString() ? `?${params}` : ''}`);
      if (!response.ok) throw new Error('Unable to load the route roster.');
      const payload = await response.json();
      setStudents(payload.data || []);
      setCounts(payload.counts || []);
      if (Array.isArray(payload.routes) && payload.routes.length) setRoutes(payload.routes);
    } catch (err) {
      notify(err.message || 'Failed to load students.', 'error');
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }, [routeFilter, search, notify]);

  const loadBuses = useCallback(async () => {
    setBusLoading(true);
    try {
      const response = await apiFetch('/transport/buses');
      if (!response.ok) throw new Error('Unable to load the fleet.');
      const payload = await response.json();
      setBuses(payload.buses || []);
    } catch (err) {
      notify(err.message || 'Failed to load fleet.', 'error');
    } finally {
      setBusLoading(false);
    }
  }, [notify]);

  useEffect(() => { loadBuses(); }, [loadBuses]);
  useEffect(() => { loadStudents(); }, [loadStudents]); // eslint-disable-line react-hooks/exhaustive-deps

  const countFor = useCallback((route) => counts.find((c) => c.route === route)?.total || 0, [counts]);

  const openTransfer = (student) => {
    setTransferStudent(student);
    setTransferRoute('');
  };

  const confirmTransfer = async () => {
    if (!transferStudent || !transferRoute) return;
    setTransferring(true);
    try {
      const response = await apiFetch(`/transport/students/${transferStudent.id}/route`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route: transferRoute }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Transfer failed.');
      notify(payload.message || 'Student transferred.', 'success');
      setTransferStudent(null);
      setTransferRoute('');
      loadStudents({ silent: true });
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setTransferring(false);
    }
  };

  const handleAddBus = async (e) => {
    e.preventDefault();
    setSavingBus(true);
    try {
      const response = await apiFetch('/transport/buses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(busForm),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to register bus.');
      notify('Bus registered on the fleet.', 'success');
      setShowAddBus(false);
      setBusForm(emptyBusForm);
      loadBuses();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSavingBus(false);
    }
  };

  const grouped = useMemo(() => {
    const map = {};
    for (const route of routes) map[route] = [];
    for (const s of students) {
      if (!map[s.route]) map[s.route] = [];
      map[s.route].push(s);
    }
    return map;
  }, [students, routes]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Bus size={26} className="text-indigo-600" /> Transport Management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Student route assignment and live fleet tracking across <strong>Kigali, Rubavu, Musanze</strong> and the <strong>Parent Pick-Up</strong> register.
            {canManage ? ' You can assign and transfer students between routes.' : ' You have view access for boarding and pick-up operations.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => { loadStudents(); loadBuses(); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
            <RefreshCw size={15} /> Refresh
          </button>
          {canManage && (
            <button type="button" onClick={() => setShowAddBus(true)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-700">
              <Bus size={16} /> Add Bus
            </button>
          )}
        </div>
      </header>

      {/* Route summary cards */}
      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {ALLOWED_ROUTES.map((route) => {
          const meta = ROUTE_META[route];
          const Icon = meta.icon;
          const active = routeFilter === route;
          return (
            <button
              key={route}
              type="button"
              onClick={() => setRouteFilter(active ? '' : route)}
              className={`rounded-2xl border p-4 text-left shadow-sm transition ${active ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-slate-200 bg-white hover:shadow-md'}`}
            >
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.tone}`}>
                  <Icon size={13} /> {route}
                </span>
                <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                  <span className={`h-2 w-2 rounded-full ${meta.dot}`} /> {countFor(route)}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">{route === 'Parent Pick-Up' ? 'Day students collected by guardians' : 'Boarding students on this bus route'}</p>
            </button>
          );
        })}
      </section>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-2">
          {[
            { id: 'roster', label: 'Route Assignment' },
            { id: 'fleet', label: 'Fleet' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === t.id ? 'bg-slate-900 text-white shadow' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'roster' && (
          <div className="relative md:w-80">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or reg number…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-400"
            />
          </div>
        )}
      </div>

      {tab === 'roster' && (
        <section className="grid gap-4 lg:grid-cols-2">
          {loading && (
            <p className="col-span-full flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" /> Loading roster…
            </p>
          )}
          {!loading && ALLOWED_ROUTES.map((route) => {
            const meta = ROUTE_META[route];
            const list = grouped[route] || [];
            const Icon = meta.icon;
            return (
              <div key={route} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className={`flex items-center justify-between rounded-t-2xl border-b px-4 py-3 ${meta.tone}`}>
                  <span className="inline-flex items-center gap-2 text-sm font-bold">
                    <Icon size={16} /> {route}
                  </span>
                  <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-semibold">{list.length} student{list.length === 1 ? '' : 's'}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {list.length === 0 && (
                    <p className="p-6 text-center text-sm text-slate-400">No students assigned to this route.</p>
                  )}
                  {list.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 truncate text-sm font-semibold text-slate-900">
                          <UserRound size={14} className="shrink-0 text-slate-400" /> {s.name}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {s.reg_number} · {s.class_name || '—'} · {s.status || 'Active'}
                          {s.route !== 'Parent Pick-Up' && (
                            <span className={`ml-2 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PAYMENT_BADGE[s.payment_status] || PAYMENT_BADGE.Unpaid}`}>
                              {s.payment_status}
                            </span>
                          )}
                        </p>
                      </div>
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => openTransfer(s)}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                        >
                          <ArrowRightLeft size={13} /> Transfer
                        </button>
                      ) : (
                        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${meta.tone}`}>{s.route}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {tab === 'fleet' && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {busLoading ? (
            <p className="flex items-center gap-2 p-8 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading fleet…</p>
          ) : buses.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">No buses registered yet. Buses must use one of the approved routes: Kigali, Rubavu, Musanze or Parent Pick-Up.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Bus</th>
                    <th className="px-4 py-3">Driver</th>
                    <th className="px-4 py-3">Route</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Load</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {buses.map((b) => {
                    const routeOk = ALLOWED_ROUTES.some((r) => String(b.route_name || '').toLowerCase().includes(r.toLowerCase()));
                    return (
                      <tr key={b.id} className="transition hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-900">{b.bus_number}</td>
                        <td className="px-4 py-3 text-slate-600">{b.driver_name}{b.driver_phone ? ` · ${b.driver_phone}` : ''}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${routeOk ? ROUTE_META['Kigali'].tone : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                            {b.route_name} {routeOk ? '' : '(unapproved)'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{b.status}</td>
                        <td className="px-4 py-3 text-slate-600">{b.passengers_count}/{b.capacity}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Transfer modal */}
      <Modal
        open={Boolean(transferStudent)}
        title="Transfer Student Route"
        icon={ArrowRightLeft}
        onClose={() => setTransferStudent(null)}
      >
        {transferStudent && (
          <>
            <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-bold text-slate-900">{transferStudent.name}</p>
              <p className="text-sm text-slate-500">{transferStudent.reg_number} · {transferStudent.class_name || '—'}</p>
              <p className="mt-2 text-xs text-slate-500">
                Current route:{' '}
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ROUTE_META[transferStudent.route]?.tone || ''}`}>
                  {transferStudent.route}
                </span>
              </p>
            </div>
            <p className="mb-2 text-sm font-medium text-slate-700">Move to:</p>
            <div className="grid grid-cols-2 gap-3">
              {routes.filter((r) => r !== transferStudent.route).map((route) => {
                const meta = ROUTE_META[route];
                const Icon = meta.icon;
                return (
                  <button
                    key={route}
                    type="button"
                    onClick={() => setTransferRoute(route)}
                    className={`flex items-center gap-2 rounded-2xl border p-3 text-left text-sm font-semibold transition ${transferRoute === route ? 'border-indigo-500 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-200' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                  >
                    <Icon size={16} /> {route}
                    {transferRoute === route && <CheckCircle2 size={16} className="ml-auto" />}
                  </button>
                );
              })}
            </div>
            {transferRoute === 'Parent Pick-Up' && (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Moving to Parent Pick-Up clears the bus ticket and boarding check-off and registers the guardian for collection.
              </p>
            )}
            {transferRoute && transferRoute !== 'Parent Pick-Up' && (
              <p className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-800">
                The boarding manifest and ticketing records follow the student to {transferRoute} automatically (boarding resets to not-boarded).
              </p>
            )}
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setTransferStudent(null)} className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmTransfer}
                disabled={!transferRoute || transferring}
                className="flex-1 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-700 disabled:opacity-60"
              >
                {transferring ? <Loader2 size={16} className="mx-auto animate-spin" /> : 'Confirm Transfer'}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* Add bus modal */}
      <Modal open={showAddBus} title="Register Bus" icon={Bus} onClose={() => setShowAddBus(false)}>
        <form onSubmit={handleAddBus} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700">Bus number</label>
              <input required value={busForm.bus_number} onChange={(e) => setBusForm({ ...busForm, bus_number: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Driver name</label>
              <input required value={busForm.driver_name} onChange={(e) => setBusForm({ ...busForm, driver_name: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Route</label>
              <select required value={busForm.route_name} onChange={(e) => setBusForm({ ...busForm, route_name: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white">
                <option value="">Select route…</option>
                {ALLOWED_ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Capacity</label>
              <input type="number" min="1" value={busForm.capacity} onChange={(e) => setBusForm({ ...busForm, capacity: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Driver phone</label>
              <input value={busForm.driver_phone} onChange={(e) => setBusForm({ ...busForm, driver_phone: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Status</label>
              <select value={busForm.status} onChange={(e) => setBusForm({ ...busForm, status: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white">
                {['In Transit', 'Delayed', 'Completed'].map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-500">Routes are restricted to Kigali, Rubavu, Musanze and Parent Pick-Up.</p>
          <button type="submit" disabled={savingBus} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-700 disabled:opacity-60">
            {savingBus ? <Loader2 size={16} className="animate-spin" /> : <Bus size={16} />} {savingBus ? 'Saving…' : 'Register Bus'}
          </button>
        </form>
      </Modal>
    </div>
  );
}

export default TransportManagement;
