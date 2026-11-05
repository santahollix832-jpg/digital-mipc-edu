import React, { useState, useEffect, useCallback } from 'react';
import {
  Bus,
  MapPin,
  Navigation,
  Users,
  Clock,
  Plus,
  Search,
  Phone,
  Eye,
  AlertCircle,
  TrendingUp,
  RefreshCw,
  Trash2,
  X,
  ClipboardList,
  Ticket,
  Home,
  CheckCircle2,
  Circle,
  Wallet,
} from 'lucide-react';
import { apiFetch } from '../api/config';
import RouteMapModal from './RouteMapModal';

const STATUS_OPTIONS = ['In Transit', 'Delayed', 'Completed'];
const ROUTES = ['Kigali', 'Rubavu', 'Musanze', 'Parent Pick-Up'];
const PAYMENT_OPTIONS = ['Fully Paid', 'Partial Payment', 'Unpaid'];

const PAYMENT_BADGE = {
  'Fully Paid': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Partial Payment': 'bg-amber-50 text-amber-700 border-amber-200',
  'Unpaid': 'bg-rose-50 text-rose-700 border-rose-200',
};

const emptyForm = {
  bus_number: '',
  driver_name: '',
  route_name: '',
  status: 'In Transit',
  speed: '',
  capacity: 50,
  passengers_count: '',
  driver_phone: '',
};

const TransportTracking = () => {
  const [activeTab, setActiveTab] = useState('fleet');
  const [searchQuery, setSearchQuery] = useState('');
  const [buses, setBuses] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [assignForm, setAssignForm] = useState({ bus_id: '', student_name: '', class_name: '' });
  const [saving, setSaving] = useState(false);
  const [mapBus, setMapBus] = useState(null); // bus currently open in the live route map

  // Musanze Hub state
  const [manifest, setManifest] = useState([]);
  const [manifestRoutes, setManifestRoutes] = useState(ROUTES);
  const [routeFilter, setRouteFilter] = useState('');
  const [manifestLoading, setManifestLoading] = useState(false);
  const [manifestError, setManifestError] = useState('');
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError] = useState('');
  const [pickupRegister, setPickupRegister] = useState([]);
  const [pickupLoading, setPickupLoading] = useState(false);
  const [pickupError, setPickupError] = useState('');
  const [busyStudent, setBusyStudent] = useState(null);
  const [pickupDraft, setPickupDraft] = useState({}); // per-student editable pickup fields

  const loadFleet = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch('/transport/buses');
      if (!response.ok) throw new Error(`Failed to load fleet (${response.status})`);
      const payload = await response.json();
      setBuses(payload.buses || []);
      setStats(payload.stats || null);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to fetch fleet data.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadManifest = useCallback(async (route = routeFilter) => {
    setManifestLoading(true);
    setManifestError('');
    try {
      const qs = route ? `?route=${encodeURIComponent(route)}` : '';
      const response = await apiFetch(`/transport/manifest${qs}`);
      if (!response.ok) throw new Error(`Failed to load boarding list (${response.status})`);
      const payload = await response.json();
      setManifest(payload.data || []);
      if (Array.isArray(payload.routes) && payload.routes.length) setManifestRoutes(payload.routes);
    } catch (err) {
      console.error(err);
      setManifestError(err.message || 'Failed to load the grouped manifest.');
    } finally {
      setManifestLoading(false);
    }
  }, [routeFilter]);

  const loadTickets = useCallback(async () => {
    setTicketsLoading(true);
    setTicketsError('');
    try {
      const response = await apiFetch('/transport/tickets');
      if (!response.ok) throw new Error(`Failed to load tickets (${response.status})`);
      const payload = await response.json();
      setTickets(payload.data || []);
    } catch (err) {
      console.error(err);
      setTicketsError(err.message || 'Failed to load ticketing board.');
    } finally {
      setTicketsLoading(false);
    }
  }, []);

  const loadPickupRegister = useCallback(async () => {
    setPickupLoading(true);
    setPickupError('');
    try {
      const response = await apiFetch('/transport/parent-pickup');
      if (!response.ok) throw new Error(`Failed to load parent pick-up register (${response.status})`);
      const payload = await response.json();
      setPickupRegister(payload.data || []);
    } catch (err) {
      console.error(err);
      setPickupError(err.message || 'Failed to load the parent pick-up register.');
    } finally {
      setPickupLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFleet();
    const interval = setInterval(loadFleet, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [loadFleet]);

  // Load Musanze Hub data on demand when the relevant tab becomes active.
  useEffect(() => {
    if (activeTab === 'callup') loadManifest(routeFilter);
  }, [activeTab, routeFilter, loadManifest]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeTab === 'tickets') loadTickets();
  }, [activeTab, loadTickets]);
  useEffect(() => {
    if (activeTab === 'pickup') loadPickupRegister();
  }, [activeTab, loadPickupRegister]);

  const flash = (message) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 4000);
  };

  const handleAddBus = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await apiFetch('/transport/buses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Failed to add bus.');
      setShowAddModal(false);
      setForm(emptyForm);
      flash('Bus registered on the fleet.');
      loadFleet();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAssignStudent = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Assigning a student increments the selected bus's passenger count.
      const bus = buses.find((b) => String(b.id) === String(assignForm.bus_id));
      if (!bus) throw new Error('Bus not found.');

      const nextCount = Math.min((bus.passengers_count || 0) + 1, bus.capacity || 50);
      const putRes = await apiFetch(`/transport/buses/${assignForm.bus_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passengers_count: nextCount }),
      });
      if (!putRes.ok) throw new Error('Failed to assign student.');
      setShowAssignModal(false);
      setAssignForm({ bus_id: '', student_name: '', class_name: '' });
      flash('Student assigned to the bus.');
      loadFleet();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRoute = async (busId, routePoints) => {
    try {
      const res = await apiFetch(`/transport/buses/${busId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route_points: routePoints }),
      });
      if (!res.ok) throw new Error('Failed to save route.');
      setMapBus(null);
      flash('Route schedule saved.');
      loadFleet();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteBus = async (id) => {
    if (!window.confirm('Remove this bus from the fleet?')) return;
    try {
      const response = await apiFetch(`/transport/buses/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete bus.');
      flash('Bus removed from the fleet.');
      loadFleet();
    } catch (err) {
      setError(err.message);
    }
  };

  // Toggle a student's "Boarded" check-off on the call-up queue.
  const toggleBoarded = async (studentId) => {
    setBusyStudent(studentId);
    try {
      const response = await apiFetch(`/transport/manifest/${studentId}/board`, { method: 'PUT' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to update boarding status.');
      setManifest((current) =>
        current.map((row) =>
          row.student_id === studentId
            ? { ...row, boarded: payload.boarding?.boarded ?? !row.boarded }
            : row
        )
      );
      flash(payload.boarding?.boarded ? 'Student marked as boarded.' : 'Boarding check-off undone.');
    } catch (err) {
      setManifestError(err.message);
    } finally {
      setBusyStudent(null);
    }
  };

  // Cycle a student's ticket payment status (interactive admin toggle).
  const cyclePaymentStatus = async (studentId, currentStatus) => {
    const next = PAYMENT_OPTIONS[(PAYMENT_OPTIONS.indexOf(currentStatus) + 1) % PAYMENT_OPTIONS.length];
    setBusyStudent(studentId);
    try {
      const response = await apiFetch(`/transport/tickets/${studentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_status: next }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to update payment status.');
      setTickets((current) =>
        current.map((row) =>
          row.student_id === studentId
            ? { ...row, payment_status: next, paid_at: payload.ticket?.paid_at ?? row.paid_at }
            : row
        )
      );
      flash(`Ticket marked ${next}.`);
      loadTickets(); // re-sync (paid_at drives queue priority)
    } catch (err) {
  setTicketsError(err.message);
} finally {
  setBusyStudent(null);
}
  };

const updatePickupEntry = async (studentId, fields) => {
  setBusyStudent(studentId);
  try {
    const response = await apiFetch(`/transport/parent-pickup/${studentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Failed to update the pick-up entry.');
    await loadPickupRegister();
    flash('Parent pick-up register updated.');
  } catch (err) {
    setPickupError(err.message);
  } finally {
    setBusyStudent(null);
  }
};

const filteredFleet = buses.filter((bus) => {
  const q = searchQuery.toLowerCase();
  return (
    bus.bus_number?.toLowerCase().includes(q) ||
    bus.driver_name?.toLowerCase().includes(q) ||
    bus.route_name?.toLowerCase().includes(q)
  );
});

// Buses grouped strictly by destination route for the Route Schedule view.
const routeGroups = ROUTES.map((route) => ({
  route,
  buses: buses.filter((bus) => bus.route_name === route),
})).filter((group) => group.buses.length > 0);

const boardedList = manifest.filter((row) => row.boarded);
const boardingStats = [
  { label: 'Registered', value: manifest.length, icon: ClipboardList, tone: 'text-indigo-600 bg-indigo-50' },
  { label: 'Boarded', value: boardedList.length, icon: CheckCircle2, tone: 'text-emerald-600 bg-emerald-50' },
  { label: 'Waiting', value: manifest.length - boardedList.length, icon: Clock, tone: 'text-amber-600 bg-amber-50' },
  { label: 'Fully Paid', value: manifest.filter((r) => r.payment_status === 'Fully Paid').length, icon: Wallet, tone: 'text-sky-600 bg-sky-50' },
];

const displayStats = [
  { label: 'Active Buses', value: stats ? String(stats.active_buses) : '—', icon: Bus, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { label: 'Students in Transit', value: stats ? String(stats.students_in_transit) : '—', icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { label: 'On-Time Rate', value: stats ? stats.on_time_rate : '—', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
  { label: 'Routes Covered', value: stats ? stats.routes_covered : '—', icon: Navigation, color: 'text-rose-600', bg: 'bg-rose-50' },
];

const tabs = [
  { id: 'fleet', label: 'Active Fleet', icon: Bus },
  { id: 'routes', label: 'Route Schedule', icon: MapPin },
  { id: 'callup', label: 'Call-Up Queue', icon: ClipboardList },
  { id: 'tickets', label: 'Ticketing', icon: Ticket },
  { id: 'pickup', label: 'Parent Pick-Up', icon: Home },
];

return (
  <main className="min-h-screen bg-slate-50 p-4 md:p-8">
    {/* Header Section */}
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">Musanze Hub · End-of-Term Logistics</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Transport Management</h1>
        <p className="text-slate-500">Fleet tracking, route call-up queues, ticketing and parent pick-up.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button onClick={loadFleet} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
        <button onClick={() => setShowAssignModal(true)} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">
          <Users size={18} />
          Assign Student
        </button>
        <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700">
          <Plus size={18} />
          Add Bus Route
        </button>
      </div>
    </div>

    {error && (
      <div className="mb-6 flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        <span className="flex items-center gap-2"><AlertCircle size={16} /> {error}</span>
        <button onClick={() => setError(null)} aria-label="Dismiss error"><X size={14} /></button>
      </div>
    )}
    {notice && (
      <div className="mb-6 flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        <span className="flex items-center gap-2"><CheckCircle2 size={16} /> {notice}</span>
        <button onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={14} /></button>
      </div>
    )}

    {/* Stats Grid */}
    <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {displayStats.map((stat, i) => (
        <div key={i} className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.bg} ${stat.color}`}>
            <stat.icon size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">{stat.label}</p>
            <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
          </div>
        </div>
      ))}
    </div>

    {/* Main Content Card */}
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Tabs */}
      <div className="flex flex-col gap-4 border-b border-slate-100 p-4 md:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-all ${activeTab === id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {activeTab === 'fleet' && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search bus or driver..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all md:w-64"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* ================= ACTIVE FLEET ================= */}
      {activeTab === 'fleet' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-xs font-bold uppercase tracking-wider text-slate-500">
                <th className="px-6 py-4">Bus Details</th>
                <th className="px-6 py-4">Current Route</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Metrics</th>
                <th className="px-6 py-4">Passengers</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && buses.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-500">Loading fleet data...</td>
                </tr>
              )}
              {!loading && filteredFleet.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-500">
                    No buses found. Click "Add Bus Route" to register one.
                  </td>
                </tr>
              )}
              {filteredFleet.map((bus) => (
                <tr key={bus.id} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                        <Bus size={20} />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{bus.bus_number}</p>
                        <p className="text-xs text-slate-500">{bus.driver_name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <MapPin size={14} className="text-slate-400" />
                      {bus.route_name}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${bus.status === 'In Transit' ? 'bg-indigo-50 text-indigo-700' :
                        bus.status === 'Delayed' ? 'bg-amber-50 text-amber-700' :
                          'bg-slate-100 text-slate-600'
                      }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${bus.status === 'In Transit' ? 'bg-indigo-500 animate-pulse' :
                          bus.status === 'Delayed' ? 'bg-amber-500' :
                            'bg-slate-400'
                        }`} />
                      {bus.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={14} className="text-emerald-500" />
                      {bus.speed} km/h
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="w-24">
                      <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                        <span>{bus.passengers_count}/{bus.capacity}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full bg-indigo-500 rounded-full"
                          style={{ width: `${Math.min(((bus.passengers_count || 0) / (bus.capacity || 50)) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <a
                        title="Call Driver"
                        href={bus.driver_phone ? `tel:${bus.driver_phone}` : undefined}
                        className={`p-2 rounded-lg transition-colors ${bus.driver_phone ? 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50' : 'cursor-not-allowed text-slate-200'}`}
                      >
                        <Phone size={18} />
                      </a>
                      <button
                        title="View Live Route Map"
                        onClick={() => setMapBus(bus)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        title="Remove Bus"
                        onClick={() => handleDeleteBus(bus.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ================= ROUTE SCHEDULE ================= */}
      {activeTab === 'routes' && (
        <div className="grid gap-4 p-4 md:p-6 md:grid-cols-2">
          {routeGroups.length === 0 && (
            <p className="col-span-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              No buses assigned yet. Add buses whose route matches Kigali, Rubavu, Musanze or Parent Pick-Up.
            </p>
          )}
          {routeGroups.map(({ route, buses: groupBuses }) => (
            <div key={route} className="rounded-2xl border border-slate-200 p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin size={18} className="text-indigo-600" />
                  <h3 className="text-lg font-bold text-slate-900">{route} Route</h3>
                </div>
                <button
                  type="button"
                  onClick={() => { setRouteFilter(route); setActiveTab('callup'); }}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                >
                  View Call-Up Queue
                </button>
              </div>
              <ul className="divide-y divide-slate-100">
                {groupBuses.map((bus) => (
                  <li key={bus.id} className="flex items-center gap-3 py-3">
                    <span className={`h-2 w-2 rounded-full ${bus.status === 'In Transit' ? 'bg-indigo-500 animate-pulse' : bus.status === 'Delayed' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{bus.bus_number} · {bus.driver_name}</p>
                      <p className="text-xs text-slate-500">Dep. ready · {bus.passengers_count}/{bus.capacity} seats filled</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMapBus(bus)}
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                      title="Open live route map"
                    >
                      <Eye size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* ================= CALL-UP QUEUE (GROUPED MANIFEST) ================= */}
      {activeTab === 'callup' && (
        <div className="p-4 md:p-6">
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {boardingStats.map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon size={17} /></span>
                <div>
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="text-lg font-bold text-slate-900">{value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRouteFilter('')}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${routeFilter === '' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'
                }`}
            >
              All Routes
            </button>
            {manifestRoutes.map((route) => (
              <button
                key={route}
                type="button"
                onClick={() => setRouteFilter(route)}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${routeFilter === route ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'
                  }`}
              >
                {route}
              </button>
            ))}
            <button
              type="button"
              onClick={() => loadManifest(routeFilter)}
              className="ml-auto flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:border-indigo-300"
            >
              <RefreshCw size={14} className={manifestLoading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>

          {manifestError && (
            <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{manifestError}</p>
          )}

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">#</th>
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-4 py-3 font-semibold">Class</th>
                  <th className="px-4 py-3 font-semibold">Route</th>
                  <th className="px-4 py-3 font-semibold">Ticket</th>
                  <th className="px-4 py-3 font-semibold">Boarding Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {manifestLoading && manifest.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Loading call-up queue…</td></tr>
                )}
                {!manifestLoading && manifest.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    No boarding students registered on this route yet. Set a Boarding student's preferred route in their profile.
                  </td></tr>
                )}
                {manifest.map((row, index) => (
                  <tr key={row.student_id} className={`transition ${row.boarded ? 'bg-emerald-50/50' : 'hover:bg-slate-50'}`}>
                    <td className="px-4 py-3 font-bold text-slate-400">{index + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{row.student_name}</p>
                      <p className="text-xs text-slate-500">{row.reg_number}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.class_name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                        <Bus size={12} /> {row.route}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${PAYMENT_BADGE[row.payment_status] || PAYMENT_BADGE.Unpaid}`}>
                        {row.payment_status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={busyStudent === row.student_id}
                        onClick={() => toggleBoarded(row.student_id)}
                        className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold transition disabled:opacity-50 ${row.boarded
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'border border-slate-300 bg-white text-slate-600 hover:border-emerald-400 hover:text-emerald-700'
                          }`}
                      >
                        {row.boarded ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                        {busyStudent === row.student_id ? '…' : row.boarded ? 'Boarded' : 'Mark Boarded'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Queue order: fully-paid students first (earliest payment at the top), then partial payments, then unpaid.
          </p>
        </div>
      )}

      {/* ================= TICKETING ================= */}
      {activeTab === 'tickets' && (
        <div className="p-4 md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">Click a status badge to cycle it: Unpaid → Partial Payment → Fully Paid. Paid-earliest students board first.</p>
            <button
              type="button"
              onClick={loadTickets}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-indigo-300"
            >
              <RefreshCw size={14} className={ticketsLoading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
          {ticketsError && (
            <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{ticketsError}</p>
          )}
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-4 py-3 font-semibold">Class</th>
                  <th className="px-4 py-3 font-semibold">Route</th>
                  <th className="px-4 py-3 font-semibold">Amount Paid</th>
                  <th className="px-4 py-3 font-semibold">Paid At</th>
                  <th className="px-4 py-3 font-semibold">Payment Status (click to toggle)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ticketsLoading && tickets.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Loading ticketing board…</td></tr>
                )}
                {!ticketsLoading && tickets.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No boarding students registered yet.</td></tr>
                )}
                {tickets.map((row) => (
                  <tr key={row.student_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{row.student_name}</p>
                      <p className="text-xs text-slate-500">{row.reg_number}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.class_name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                        <Bus size={12} /> {row.route}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">RWF {Number(row.amount_paid || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{row.paid_at ? new Date(row.paid_at).toLocaleString() : '—'}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={busyStudent === row.student_id}
                        onClick={() => cyclePaymentStatus(row.student_id, row.payment_status)}
                        className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${PAYMENT_BADGE[row.payment_status] || PAYMENT_BADGE.Unpaid} hover:scale-[1.03]`}
                      >
                        {busyStudent === row.student_id ? '…' : row.payment_status}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= PARENT PICK-UP REGISTER ================= */}
      {activeTab === 'pickup' && (
        <div className="p-4 md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Abacyurwa n'Ababyeyi — Parent Pick-Up Register</h3>
              <p className="text-sm text-slate-500">Students collected directly by parents/guardians. Excluded from all bus manifest queues.</p>
            </div>
            <button
              type="button"
              onClick={loadPickupRegister}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-indigo-300"
            >
              <RefreshCw size={14} className={pickupLoading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
          {pickupError && (
            <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{pickupError}</p>
          )}
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-4 py-3 font-semibold">Class</th>
                  <th className="px-4 py-3 font-semibold">Parent / Guardian</th>
                  <th className="px-4 py-3 font-semibold">Phone</th>
                  <th className="px-4 py-3 font-semibold">Expected Pick-Up</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pickupLoading && pickupRegister.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Loading register…</td></tr>
                )}
                {!pickupLoading && pickupRegister.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    No parent pick-up students. Set a student's preferred route to "Parent Pick-Up" in their profile.
                  </td></tr>
                )}
                {pickupRegister.map((row) => {
                  const draft = pickupDraft[row.student_id] || {};
                  return (
                    <tr key={row.student_id} className={row.picked_up ? 'bg-emerald-50/50' : 'hover:bg-slate-50'}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{row.student_name}</p>
                        <p className="text-xs text-slate-500">{row.reg_number}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.class_name}</td>
                      <td className="px-4 py-3">
                        <input
                          className="w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
                          defaultValue={row.parent_name || ''}
                          placeholder="Parent name"
                          onBlur={(e) => {
                            if (e.target.value !== (row.parent_name || '')) {
                              updatePickupEntry(row.student_id, { parent_name: e.target.value });
                            }
                          }}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className="w-36 rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
                          defaultValue={row.parent_phone || ''}
                          placeholder="+250..."
                          onBlur={(e) => {
                            if (e.target.value !== (row.parent_phone || '')) {
                              updatePickupEntry(row.student_id, { parent_phone: e.target.value });
                            }
                          }}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="datetime-local"
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
                          defaultValue={row.expected_pickup_at || ''}
                          onBlur={(e) => {
                            if (e.target.value && e.target.value !== (row.expected_pickup_at || '')) {
                              updatePickupEntry(row.student_id, { expected_pickup_at: e.target.value });
                            }
                          }}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={busyStudent === row.student_id}
                          onClick={() => updatePickupEntry(row.student_id, { picked_up: !row.picked_up })}
                          className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold transition disabled:opacity-50 ${row.picked_up
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : 'border border-slate-300 bg-white text-slate-600 hover:border-emerald-400 hover:text-emerald-700'
                            }`}
                        >
                          {row.picked_up ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                          {busyStudent === row.student_id ? '…' : row.picked_up ? 'Picked Up' : 'Awaiting Pick-Up'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer info (fleet only) */}
      {activeTab === 'fleet' && (
        <div className="border-t border-slate-100 bg-slate-50/30 p-4 px-6">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <AlertCircle size={14} />
            Data refreshes automatically every 30 seconds. System time: {new Date().toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>

    {/* Route Map Modal */}
    {mapBus && (
      <RouteMapModal
        bus={buses.find((b) => String(b.id) === String(mapBus.id)) || mapBus}
        onClose={() => setMapBus(null)}
        onSaveRoute={handleSaveRoute}
      />
    )}

    {/* Add Bus Modal */}
    {showAddModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Add Bus Route</h3>
            <button onClick={() => setShowAddModal(false)} className="p-2 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>
          <form onSubmit={handleAddBus} className="grid gap-3 sm:grid-cols-2">
            <input required placeholder="Bus Number (BUS-006)" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              value={form.bus_number} onChange={(e) => setForm({ ...form, bus_number: e.target.value })} />
            <input required placeholder="Driver Name" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              value={form.driver_name} onChange={(e) => setForm({ ...form, driver_name: e.target.value })} />
            <select required className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm sm:col-span-2"
              value={form.route_name} onChange={(e) => setForm({ ...form, route_name: e.target.value })}>
              <option value="">Select destination route…</option>
              {ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}
              <option value="Other">Other / Custom</option>
            </select>
            {form.route_name === 'Other' && (
              <input required placeholder="Custom route name" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm sm:col-span-2"
                onChange={(e) => setForm({ ...form, route_name: e.target.value })} />
            )}
            <select className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
            </select>
            <input type="number" min="0" placeholder="Speed (km/h)" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              value={form.speed} onChange={(e) => setForm({ ...form, speed: e.target.value })} />
            <input type="number" min="1" placeholder="Capacity" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
            <input type="number" min="0" placeholder="Passengers" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              value={form.passengers_count} onChange={(e) => setForm({ ...form, passengers_count: e.target.value })} />
            <input placeholder="Driver Phone (+250 ...)" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm sm:col-span-2"
              value={form.driver_phone} onChange={(e) => setForm({ ...form, driver_phone: e.target.value })} />
            <button type="submit" disabled={saving}
              className="sm:col-span-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Bus'}
            </button>
          </form>
        </div>
      </div>
    )}

    {/* Assign Student Modal */}
    {showAssignModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Assign Student to Bus</h3>
            <button onClick={() => setShowAssignModal(false)} className="p-2 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>
          <p className="mb-3 rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
            Tip: Boarding students with a saved preferred route are registered automatically — use this only for ad-hoc assignments.
          </p>
          <form onSubmit={handleAssignStudent} className="grid gap-3">
            <select required className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              value={assignForm.bus_id} onChange={(e) => setAssignForm({ ...assignForm, bus_id: e.target.value })}>
              <option value="">Select bus...</option>
              {buses.map((bus) => (
                <option key={bus.id} value={bus.id}>
                  {bus.bus_number} — {bus.route_name} ({bus.passengers_count}/{bus.capacity})
                </option>
              ))}
            </select>
            <input required placeholder="Student Name" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              value={assignForm.student_name} onChange={(e) => setAssignForm({ ...assignForm, student_name: e.target.value })} />
            <input placeholder="Class" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              value={assignForm.class_name} onChange={(e) => setAssignForm({ ...assignForm, class_name: e.target.value })} />
            <button type="submit" disabled={saving}
              className="rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Assigning...' : 'Assign Student'}
            </button>
          </form>
        </div>
      </div>
    )}
  </main>
);
};

export default TransportTracking;
