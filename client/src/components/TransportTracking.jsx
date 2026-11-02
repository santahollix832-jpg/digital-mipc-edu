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
  MoreVertical,
  AlertCircle,
  TrendingUp,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch } from '../api/config';

const STATUS_OPTIONS = ['In Transit', 'Delayed', 'Completed'];

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
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [assignForm, setAssignForm] = useState({ bus_id: '', student_name: '', class_name: '' });
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    loadFleet();
    const interval = setInterval(loadFleet, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [loadFleet]);

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
      loadFleet();
    } catch (err) {
      alert(err.message);
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

      const nextCount = Math.min((busDetail.passengers_count || 0) + 1, busDetail.capacity);
      const putRes = await apiFetch(`/transport/buses/${assignForm.bus_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passengers_count: nextCount }),
      });
      if (!putRes.ok) throw new Error('Failed to assign student.');
      setShowAssignModal(false);
      setAssignForm({ bus_id: '', student_name: '', class_name: '' });
      loadFleet();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBus = async (id) => {
    if (!window.confirm('Remove this bus from the fleet?')) return;
    try {
      const response = await apiFetch(`/transport/buses/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete bus.');
      loadFleet();
    } catch (err) {
      alert(err.message);
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

  const displayStats = [
    { label: 'Active Buses', value: stats ? String(stats.active_buses) : '—', icon: Bus, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Students in Transit', value: stats ? String(stats.students_in_transit) : '—', icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'On-Time Rate', value: stats ? stats.on_time_rate : '—', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Routes Covered', value: stats ? stats.routes_covered : '—', icon: Navigation, color: 'text-rose-600', bg: 'bg-rose-50' },
  ];

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      {/* Header Section */}
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">Transport Management</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Fleet Dashboard</h1>
          <p className="text-slate-500">Real-time monitoring and logistics for school transport.</p>
        </div>
        <div className="flex gap-3">
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
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle size={16} /> {error}
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
        {/* Table Controls */}
        <div className="flex flex-col border-b border-slate-100 p-6 md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            <button
              onClick={() => setActiveTab('fleet')}
              className={`px-4 py-2 text-sm font-semibold transition-all rounded-lg ${activeTab === 'fleet' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Active Fleet
            </button>
            <button
              onClick={() => setActiveTab('routes')}
              className={`px-4 py-2 text-sm font-semibold transition-all rounded-lg ${activeTab === 'routes' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Route Schedule
            </button>
          </div>

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
        </div>

        {/* Table Section */}
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
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      bus.status === 'In Transit' ? 'bg-indigo-50 text-indigo-700' :
                      bus.status === 'Delayed' ? 'bg-amber-50 text-amber-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        bus.status === 'In Transit' ? 'bg-indigo-500 animate-pulse' :
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
                      <button title="Call Driver" className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                        <Phone size={18} />
                      </button>
                      <button title="View Live" className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
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

        {/* Footer info */}
        <div className="border-t border-slate-100 bg-slate-50/30 p-4 px-6">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <AlertCircle size={14} />
            Data refreshes automatically every 30 seconds. System time: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>

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
              <input required placeholder="Route (e.g. Kicukiro - Town)" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm sm:col-span-2"
                value={form.route_name} onChange={(e) => setForm({ ...form, route_name: e.target.value })} />
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
