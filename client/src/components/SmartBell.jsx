import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Bell, BellRing, Clock, Cpu, Loader2, Pencil, Play, Plus,
  Power, RefreshCw, Siren, Trash2, Wifi, WifiOff, X,
} from 'lucide-react';
import { API_BASE_URL } from '../api/config';
import { useAuth } from '../auth/AuthContext';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LABELS = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };

const TONES = ['Standard Bell', 'Classic Chime', 'Digital Beep', 'Emergency Siren', 'Soft Chime'];
const PRESETS = [
  { key: 'standard', label: 'Ring Bell Now', tone: 'bg-indigo-600 hover:bg-indigo-700', icon: Bell, note: 'Standard bell ring', duration: 5 },
  { key: 'emergency', label: 'Emergency Alarm', tone: 'bg-rose-600 hover:bg-rose-700', icon: AlertTriangle, note: 'EMERGENCY alarm activated', duration: 30 },
  { key: 'recess', label: 'Recess Bell', tone: 'bg-amber-500 hover:bg-amber-600', icon: Play, note: 'Recess bell', duration: 8 },
];

const EMPTY_FORM = { time: '08:00', title: '', days: [], tone: 'Standard Bell', is_active: true };

function formatTime(value) {
  if (!value) return '--:--';
  const [h, m] = value.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m ?? 0).padStart(2, '0')} ${suffix}`;
}

function formatDays(days) {
  if (!days) return 'Mon-Fri';
  return days.split(',').map((d) => DAY_LABELS[d.trim()] || d.trim()).join(', ');
}

function relativeTime(timestamp) {
  if (!timestamp) return 'Never';
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const SmartBell = () => {
  const { user } = useAuth();
  const isAdmin = String(user?.role || '').toUpperCase() === 'ADMIN';
  const [schedules, setSchedules] = useState([]);
  const [logs, setLogs] = useState([]);
  const [device, setDevice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyPreset, setBusyPreset] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchData = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      setError('');
      const [schedRes, devRes] = await Promise.all([
        fetch(`${API_BASE_URL}/bell/schedules`, { credentials: 'include' }),
        fetch(`${API_BASE_URL}/bell/device`, { credentials: 'include' }),
      ]);
      if (!schedRes.ok) throw new Error(`Failed to load schedules (${schedRes.status})`);
      const schedData = await schedRes.json();
      setSchedules(schedData.schedules || []);
      setLogs(schedData.logs || []);
      if (devRes.ok) {
        const devData = await devRes.json();
        setDevice(devData.device || null);
      }
    } catch (err) {
      setError(err.message || 'Unable to reach the bell service.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Poll device status every 30s and refresh timestamps every minute.
    const poll = window.setInterval(() => fetchData(true), 30000);
    return () => window.clearInterval(poll);
  }, [fetchData]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (schedule) => {
    setEditingId(schedule.id);
    setForm({
      time: String(schedule.time).slice(0, 5),
      title: schedule.title,
      days: (schedule.days || '').split(',').map((d) => d.trim()).filter(Boolean),
      tone: schedule.tone || 'Standard Bell',
      is_active: schedule.is_active !== false,
    });
    setShowForm(true);
  };

  const toggleDay = (day) => {
    setForm((f) => ({
      ...f,
      days: f.days.includes(day) ? f.days.filter((d) => d !== day) : [...f.days, day],
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return showToast('Please enter a title for this bell event.', 'error');
    if (form.days.length === 0) return showToast('Select at least one day of the week.', 'error');

    setSaving(true);
    try {
      const payload = { ...form, days: form.days.join(',') };
      const res = await fetch(editingId ? `${API_BASE_URL}/bell/schedules/${editingId}` : `${API_BASE_URL}/bell/schedules`, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save schedule.');
      showToast(editingId ? 'Bell schedule updated.' : 'Bell schedule created.');
      setShowForm(false);
      await fetchData(true);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/bell/schedules/${id}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete schedule.');
      showToast('Bell schedule deleted.');
      setSchedules((list) => list.filter((s) => s.id !== id));
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const toggleActive = async (schedule) => {
    try {
      const res = await fetch(`${API_BASE_URL}/bell/schedules/${schedule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_active: !schedule.is_active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update schedule.');
      setSchedules((list) => list.map((s) => (s.id === schedule.id ? { ...s, is_active: !schedule.is_active } : s)));
      showToast(`Schedule ${!schedule.is_active ? 'activated' : 'paused'}.`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleTrigger = async (preset) => {
    setBusyPreset(preset.key);
    try {
      const res = await fetch(`${API_BASE_URL}/bell/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ preset: preset.key, note: preset.note, duration_seconds: preset.duration }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to trigger the bell.');
      showToast(data.message || 'Bell triggered!', data.hardware_acknowledged === false ? 'warning' : 'success');
      await fetchData(true);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusyPreset(null);
    }
  };

  const handleSosAlert = async () => {
    setBusyPreset('sos');
    try {
      const res = await fetch(`${API_BASE_URL}/bell/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          preset: 'emergency',
          note: `EMERGENCY / INCIDENT ALERT raised by ${user?.full_name || user?.role || 'staff'}`,
          duration_seconds: 60,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to raise the emergency alert.');
      showToast('CAMPUS-WIDE EMERGENCY ALERT SOUNDED.', data.hardware_acknowledged === false ? 'warning' : 'success');
      await fetchData(true);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusyPreset(null);
    }
  };

  const isOnline = !!(device && device.is_online);
  const uptimeLabel = useMemo(() => {
    if (!device || !device.uptime_seconds) return 'Unknown';
    const s = Number(device.uptime_seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }, [device]);

  return (
    <main className="p-6 md:p-10">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Hardware Modules</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">IoT Smart Bell</h1>
          <p className="mt-3 text-slate-600">Automated school bell system with IoT integration and schedule management.</p>
        </div>
        <button
          onClick={() => fetchData()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          disabled={refreshing}
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          <AlertTriangle size={18} /> {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ============ Emergency SOS (non-admin roles) ============ */}
        {!isAdmin && (
          <section className="rounded-2xl border-4 border-rose-500 bg-rose-50 p-6 shadow-lg shadow-rose-500/20 lg:col-span-3">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-lg shadow-rose-600/40">
                <Siren size={30} />
              </div>
              <div>
                <h2 className="text-xl font-extrabold uppercase tracking-wide text-rose-700">Emergency Bell · Incident Alert</h2>
                <p className="text-sm font-semibold text-rose-600">
                  One click sounds the campus-wide emergency siren. Schedule configuration is restricted to administrators.
                </p>
              </div>
            </div>
            <button
              onClick={handleSosAlert}
              disabled={busyPreset !== null}
              className={`flex w-full items-center justify-center gap-3 rounded-2xl bg-rose-600 px-6 py-10 text-2xl font-extrabold uppercase tracking-widest text-white shadow-xl shadow-rose-600/40 transition hover:bg-rose-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 ${busyPreset === 'sos' ? 'animate-pulse' : ''}`}
            >
              {busyPreset === 'sos' ? <Loader2 size={34} className="animate-spin" /> : <Siren size={34} />}
              {busyPreset === 'sos' ? 'Sounding alert…' : 'SOS — Sound Emergency Bell'}
            </button>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs font-semibold text-rose-500">
              <Power size={13} /> 60-second campus-wide siren{isOnline ? ' · bell device online' : ' · bell device currently offline, alert will be queued'}.
            </p>
          </section>
        )}

        {/* ============ Bell Schedule Manager (admin only) ============ */}
        <section className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${isAdmin ? 'lg:col-span-2' : 'hidden'}`}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <Clock size={22} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Bell Schedule Manager</h2>
                <p className="text-sm text-slate-500">{schedules.length} scheduled ring{schedules.length === 1 ? '' : 's'} configured</p>
              </div>
            </div>
            <button
              onClick={openCreate}
              disabled={!isAdmin}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={16} /> Add Schedule
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
              <Loader2 size={18} className="animate-spin" /> Loading schedules...
            </div>
          ) : schedules.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center">
              <Clock size={32} className="mx-auto text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-600">No bell schedules yet</p>
              <p className="mt-1 text-sm text-slate-400">Add your first ring time to automate the school day.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="pb-3 pr-4 font-semibold">Time</th>
                    <th className="pb-3 pr-4 font-semibold">Title</th>
                    <th className="pb-3 pr-4 font-semibold">Days</th>
                    <th className="pb-3 pr-4 font-semibold">Tone</th>
                    <th className="pb-3 pr-4 font-semibold">Status</th>
                    <th className="pb-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {schedules.map((schedule) => (
                    <tr key={schedule.id} className="align-middle">
                      <td className="py-3 pr-4 font-semibold tabular-nums text-slate-900">{formatTime(String(schedule.time).slice(0, 5))}</td>
                      <td className="py-3 pr-4 text-slate-700">{schedule.title}</td>
                      <td className="py-3 pr-4 text-slate-500">{formatDays(schedule.days)}</td>
                      <td className="py-3 pr-4 text-slate-500">{schedule.tone}</td>
                      <td className="py-3 pr-4">
                        <button
                          onClick={() => toggleActive(schedule)}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition ${schedule.is_active !== false
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${schedule.is_active !== false ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          {schedule.is_active !== false ? 'Active' : 'Paused'}
                        </button>
                      </td>
                      <td className="py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => openEdit(schedule)}
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                            title="Edit schedule"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(schedule.id)}
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                            disabled={deletingId === schedule.id}
                            title="Delete schedule"
                          >
                            {deletingId === schedule.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Recent activity */}
          {logs.length > 0 && (
            <div className="mt-6 border-t border-slate-100 pt-5">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Recent Ring Activity</h4>
              <ul className="space-y-2">
                {logs.slice(0, 5).map((log) => (
                  <li key={log.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-slate-600">{log.note || 'Bell ring'}</span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {log.triggered_by_name ? `${log.triggered_by_name} · ` : ''}
                      {relativeTime(log.triggered_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* ============ Device Status ============ */}
        <section className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${isAdmin ? '' : 'lg:col-span-3'}`}>
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 text-slate-600">
              <Cpu size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Device Status</h2>
              <p className="text-sm text-slate-500">Hardware connectivity monitor</p>
            </div>
          </div>

          <div className={`flex items-center gap-3 rounded-xl px-4 py-3 ${isOnline ? 'bg-emerald-50' : 'bg-rose-50'}`}>
            {isOnline ? <Wifi size={20} className="text-emerald-600" /> : <WifiOff size={20} className="text-rose-600" />}
            <div>
              <p className={`text-sm font-bold ${isOnline ? 'text-emerald-700' : 'text-rose-700'}`}>
                {isOnline ? 'Online' : 'Offline'}
              </p>
              <p className="text-xs text-slate-500">Last ping: {device?.last_ping ? relativeTime(device.last_ping) : 'Never'}</p>
            </div>
          </div>

          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Device ID</dt>
              <dd className="font-medium text-slate-900">{device?.device_id || 'Unregistered'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">IP Address</dt>
              <dd className="font-medium tabular-nums text-slate-900">{device?.ip_address || '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Firmware</dt>
              <dd className="font-medium text-slate-900">{device?.firmware_version || '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Uptime</dt>
              <dd className="font-medium text-slate-900">{uptimeLabel}</dd>
            </div>
          </dl>

          <button
            onClick={() => fetchData(true)}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Ping Device
          </button>
        </section>

        {/* ============ Manual Override (admin full control) ============ */}
        <section className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${isAdmin ? 'lg:col-span-2' : 'hidden'}`}>
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <Bell size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Manual Override</h2>
              <p className="text-sm text-slate-500">Trigger the bell instantly for emergencies or special events.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {PRESETS.map((preset) => {
              const Icon = preset.icon;
              return (
                <button
                  key={preset.key}
                  onClick={() => handleTrigger(preset)}
                  disabled={busyPreset !== null}
                  className={`flex flex-col items-center gap-2 rounded-xl px-4 py-5 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${preset.tone}`}
                >
                  {busyPreset === preset.key ? <Loader2 size={22} className="animate-spin" /> : <Icon size={22} />}
                  {preset.label}
                  <span className="text-xs font-normal opacity-80">{preset.duration}s ring</span>
                </button>
              );
            })}
          </div>
          <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
            <Power size={13} /> Requests are dispatched to the bell controller{isOnline ? ' (device online)' : ' — device currently offline, rings will be queued'}.
          </p>
        </section>
      </div>

      {/* ============ Schedule Form Modal (admin only) ============ */}
      {showForm && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => !saving && setShowForm(false)}>
          <form
            onSubmit={handleSave}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">{editingId ? 'Edit Bell Schedule' : 'Add Bell Schedule'}</h3>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <label className="block text-sm font-semibold text-slate-700">
              Title
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Morning Assembly, Period 1 End, Lunch Break"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                required
              />
            </label>

            <label className="mt-4 block text-sm font-semibold text-slate-700">
              Time
              <input
                type="time"
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                required
              />
            </label>

            <div className="mt-4">
              <p className="text-sm font-semibold text-slate-700">Days of the week</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {DAYS.map((day) => (
                  <button
                    type="button"
                    key={day}
                    onClick={() => toggleDay(day)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${form.days.includes(day)
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>

            <label className="mt-4 block text-sm font-semibold text-slate-700">
              Bell Tone
              <select
                value={form.tone}
                onChange={(e) => setForm((f) => ({ ...f, tone: e.target.value }))}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                {TONES.map((tone) => (
                  <option key={tone} value={tone}>{tone}</option>
                ))}
              </select>
            </label>

            <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              Active (bell will ring at this time)
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
                disabled={saving}
              >
                {saving && <Loader2 size={15} className="animate-spin" />}
                {editingId ? 'Save Changes' : 'Add Schedule'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ============ Toast ============ */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[60] flex max-w-sm items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.type === 'error' ? 'bg-rose-600' : toast.type === 'warning' ? 'bg-amber-500' : 'bg-emerald-600'
            }`}
        >
          {toast.type === 'error' ? <AlertTriangle size={18} /> : <Bell size={18} />}
          {toast.message}
        </div>
      )}
    </main>
  );
};

export default SmartBell;
