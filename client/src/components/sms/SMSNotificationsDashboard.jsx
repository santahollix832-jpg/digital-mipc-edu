import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BellRing, Bus, CheckCircle2, ClipboardList, Clock, Filter, Loader2, Megaphone,
  MessageSquare, RefreshCw, Search, Send, Smartphone, Trash2, Users, X,
} from 'lucide-react';
import { apiFetch } from '../../api/config';
import { useToast } from '../ToastProvider';

const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'visite_day', label: 'Visite Day' },
  { value: 'gate_pass', label: 'Gate Pass / Permission' },
  { value: 'check_in', label: 'Check-In' },
  { value: 'check_out', label: 'Check-Out' },
  { value: 'announcement', label: 'Parent Announcement' },
  { value: 'staff_broadcast', label: 'Staff Broadcast' },
];

const STAFF_ROLES = ['ADMIN', 'DOD', 'PATRON', 'MATRON', 'TEACHER', 'BURSAR', 'SECURITY'];

const CATEGORY_BADGE = {
  visite_day: 'bg-violet-50 text-violet-700 border-violet-200',
  gate_pass: 'bg-sky-50 text-sky-700 border-sky-200',
  check_in: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  check_out: 'bg-amber-50 text-amber-700 border-amber-200',
  announcement: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  staff_broadcast: 'bg-rose-50 text-rose-700 border-rose-200',
};

const CATEGORY_LABEL = {
  visite_day: 'Visite Day',
  gate_pass: 'Gate Pass',
  check_in: 'Check-In',
  check_out: 'Check-Out',
  announcement: 'Announcement',
  staff_broadcast: 'Staff Broadcast',
};

const AUDIENCE_BADGE = {
  staff: 'bg-rose-50 text-rose-700 border-rose-200',
  parents: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  all: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
          <Icon size={18} />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="text-xl font-bold text-slate-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

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

function SMSNotificationsDashboard({ user }) {
  const { notify } = useToast();
  const [tab, setTab] = useState('logs');
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ total: 0, sent: 0, pending: 0, today: 0 });
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState(null);

  // Compose modal state
  const [showCompose, setShowCompose] = useState(false);
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [showGatePass, setShowGatePass] = useState(false);
  const [showCheck, setShowCheck] = useState(false);

  const [composeForm, setComposeForm] = useState({ recipient_name: '', phone: '', message: '', student_id: '' });
  const [announceForm, setAnnounceForm] = useState({ title: '', body: '', audience: 'all', send_sms: true });
  const [broadcastForm, setBroadcastForm] = useState({ title: '', body: '', target_roles: [] });
  const [gatePassForm, setGatePassForm] = useState({ student_name: '', destination: '', expected_return: '' });
  const [checkForm, setCheckForm] = useState({ student_name: '', direction: 'in', method: 'qr' });
  const [students, setStudents] = useState([]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (search.trim()) params.set('search', search.trim());
      const response = await apiFetch(`/sms/logs${params.toString() ? `?${params}` : ''}`);
      if (!response.ok) throw new Error('Unable to load SMS logs.');
      const payload = await response.json();
      setLogs(payload.data || []);
      if (payload.stats) setStats(payload.stats);
    } catch (err) {
      notify(err.message || 'Failed to load SMS logs.', 'error');
    } finally {
      setLoading(false);
    }
  }, [category, search, notify]);

  const loadAnnouncements = useCallback(async () => {
    try {
      const response = await apiFetch('/sms/announcements');
      if (!response.ok) throw new Error('Unable to load announcements.');
      const payload = await response.json();
      setAnnouncements(payload.data || []);
    } catch (err) {
      notify(err.message || 'Failed to load announcements.', 'error');
    }
  }, [notify]);

  const loadStudents = useCallback(async () => {
    try {
      const response = await apiFetch('/students');
      if (!response.ok) return;
      setStudents(await response.json());
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { loadStudents(); }, [loadStudents]);
  useEffect(() => {
    loadLogs();
    loadAnnouncements();
  }, [loadLogs, loadAnnouncements]);

  const foundStudent = (name) => students.find((s) => s.name.toLowerCase() === String(name || '').toLowerCase());

  async function post(path, body) {
    const response = await apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Request failed.');
    return payload;
  }

  const handleCompose = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      await post('/sms/send', composeForm);
      notify('SMS sent and logged.', 'success');
      setShowCompose(false);
      setComposeForm({ recipient_name: '', phone: '', message: '', student_id: '' });
      loadLogs();
    } catch (err) {
      notify(err.message, 'error');
    } finally { setSending(false); }
  };

  const handleAnnouncement = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const result = await post('/sms/announcements', announceForm);
      notify(`Announcement published to ${result.recipients} recipient(s), ${result.sms_sent} message(s).`, 'success');
      setShowAnnouncement(false);
      setAnnounceForm({ title: '', body: '', audience: 'all', send_sms: true });
      loadAnnouncements();
      loadLogs();
    } catch (err) {
      notify(err.message, 'error');
    } finally { setSending(false); }
  };

  const handleBroadcast = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const result = await post('/sms/broadcast', broadcastForm);
      notify(`Staff broadcast delivered to ${result.delivered_to} role group(s).`, 'success');
      setShowBroadcast(false);
      setBroadcastForm({ title: '', body: '', target_roles: [] });
      loadAnnouncements();
      loadLogs();
    } catch (err) {
      notify(err.message, 'error');
    } finally { setSending(false); }
  };

  const handleGatePass = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const student = foundStudent(gatePassForm.student_name);
      const result = await post('/sms/trigger/gate-pass', {
        student_id: student?.id,
        destination: gatePassForm.destination,
        expected_return: gatePassForm.expected_return || null,
      });
      notify(`Gate pass notification sent to ${result.sms.recipient_name}.`, 'success');
      setShowGatePass(false);
      setGatePassForm({ student_name: '', destination: '', expected_return: '' });
      loadLogs();
    } catch (err) {
      notify(err.message, 'error');
    } finally { setSending(false); }
  };

  const handleCheck = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const student = foundStudent(checkForm.student_name);
      const result = await post('/sms/trigger/check', {
        student_id: student?.id,
        direction: checkForm.direction,
        method: checkForm.method,
      });
      notify(`Check-${checkForm.direction} notification triggered (${result.student_type.replace('_', ' ')}).`, 'success');
      setShowCheck(false);
      setCheckForm({ student_name: '', direction: 'in', method: 'qr' });
      loadLogs();
    } catch (err) {
      notify(err.message, 'error');
    } finally { setSending(false); }
  };

  const retractAnnouncement = async (id) => {
    setBusyId(id);
    try {
      const response = await apiFetch(`/sms/announcements/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Unable to retract announcement.');
      notify('Announcement retracted.', 'success');
      loadAnnouncements();
    } catch (err) {
      notify(err.message, 'error');
    } finally { setBusyId(null); }
  };

  const roleLabel = user?.role || 'STAFF';

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <BellRing size={26} className="text-indigo-600" /> SMS &amp; Notifications Center
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Automated parent alerts, visite-day gate passes, check-in/out confirmations and staff broadcasts — signed in as <span className="font-semibold">{roleLabel}</span>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowCompose(true)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-700">
            <Send size={16} /> Send SMS
          </button>
          <button type="button" onClick={() => setShowAnnouncement(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            <Megaphone size={16} /> Announcement
          </button>
          <button type="button" onClick={() => setShowBroadcast(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            <Users size={16} /> Staff Broadcast
          </button>
          <button type="button" onClick={() => setShowGatePass(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            <ClipboardList size={16} /> Gate Pass Alert
          </button>
          <button type="button" onClick={() => setShowCheck(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            <Smartphone size={16} /> Check In/Out
          </button>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={MessageSquare} label="Total Messages" value={stats.total} tone="bg-indigo-50 text-indigo-600" />
        <StatCard icon={CheckCircle2} label="Sent" value={stats.sent} tone="bg-emerald-50 text-emerald-600" />
        <StatCard icon={Clock} label="Pending" value={stats.pending} tone="bg-amber-50 text-amber-600" />
        <StatCard icon={Bus} label="Sent Today" value={stats.today} tone="bg-sky-50 text-sky-600" />
      </section>

      <div className="mb-6 flex gap-2">
        {[
          { id: 'logs', label: 'Message Log' },
          { id: 'announcements', label: 'Announcements' },
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

      {tab === 'logs' && (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between">
            <div className="relative md:w-72">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search recipient or message…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:bg-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-slate-400" />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:bg-white"
              >
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <button type="button" onClick={loadLogs} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {loading && logs.length === 0 && (
              <p className="flex items-center gap-2 p-8 text-center text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading messages…</p>
            )}
            {!loading && logs.length === 0 && (
              <p className="p-8 text-center text-sm text-slate-500">No SMS messages logged yet.</p>
            )}
            {logs.map((log) => (
              <article key={log.id} className="flex flex-col gap-2 p-4 transition hover:bg-slate-50 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${CATEGORY_BADGE[log.category] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                      {CATEGORY_LABEL[log.category] || log.category}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${log.status === 'sent' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                      {log.status === 'sent' ? <CheckCircle2 size={11} /> : <Clock size={11} />} {log.status}
                    </span>
                    <span className="text-xs font-medium text-slate-500">To: {log.recipient_name} ({log.recipient_role}){log.phone ? ` · ${log.phone}` : ''}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-sm text-slate-800">{log.message}</p>
                  {log.student_name && <p className="mt-1 text-xs text-slate-400">Student: {log.student_name} ({log.reg_number})</p>}
                </div>
                <div className="text-right text-xs text-slate-400 md:w-44">
                  <p>{new Date(log.sent_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
                  <p className="mt-0.5">by {log.sender_name} · {log.sender_role}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === 'announcements' && (
        <section className="grid gap-4 md:grid-cols-2">
          {announcements.length === 0 && (
            <p className="col-span-full rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">No announcements published yet.</p>
          )}
          {announcements.map((a) => (
            <article key={a.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${AUDIENCE_BADGE[a.audience] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                    {a.audience === 'staff' ? 'Staff Only' : a.audience === 'parents' ? 'Parents' : 'Everyone'}
                  </span>
                  <h3 className="mt-2 font-bold text-slate-900">{a.title}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => retractAnnouncement(a.id)}
                  disabled={busyId === a.id}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                  aria-label="Retract announcement"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <p className="mt-2 text-sm text-slate-600">{a.body}</p>
              <p className="mt-3 text-xs text-slate-400">
                {new Date(a.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · by {a.created_by} ({a.created_by_role})
              </p>
            </article>
          ))}
        </section>
      )}

      {/* Send SMS */}
      <Modal open={showCompose} title="Send SMS" icon={Send} onClose={() => setShowCompose(false)}>
        <form onSubmit={handleCompose} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Recipient name</label>
            <input required value={composeForm.recipient_name} onChange={(e) => setComposeForm({ ...composeForm, recipient_name: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Phone (optional)</label>
            <input value={composeForm.phone} onChange={(e) => setComposeForm({ ...composeForm, phone: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Message</label>
            <textarea required rows={4} value={composeForm.message} onChange={(e) => setComposeForm({ ...composeForm, message: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white" />
          </div>
          <button type="submit" disabled={sending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-700 disabled:opacity-60">
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {sending ? 'Sending…' : 'Send & Log'}
          </button>
        </form>
      </Modal>

      {/* Announcement */}
      <Modal open={showAnnouncement} title="Publish Announcement" icon={Megaphone} onClose={() => setShowAnnouncement(false)} wide>
        <form onSubmit={handleAnnouncement} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Title</label>
            <input required value={announceForm.title} onChange={(e) => setAnnounceForm({ ...announceForm, title: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Message body</label>
            <textarea required rows={4} value={announceForm.body} onChange={(e) => setAnnounceForm({ ...announceForm, body: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white" />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Audience</label>
              <select value={announceForm.audience} onChange={(e) => setAnnounceForm({ ...announceForm, audience: e.target.value })} className="mt-1 block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white">
                <option value="all">Everyone (staff + parents)</option>
                <option value="parents">Parents only (SMS)</option>
                <option value="staff">Staff only (internal)</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={announceForm.send_sms} onChange={(e) => setAnnounceForm({ ...announceForm, send_sms: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
              Dispatch SMS
            </label>
          </div>
          <button type="submit" disabled={sending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-700 disabled:opacity-60">
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Megaphone size={16} />} {sending ? 'Publishing…' : 'Publish & Broadcast'}
          </button>
        </form>
      </Modal>

      {/* Staff broadcast */}
      <Modal open={showBroadcast} title="Staff Broadcast (Internal)" icon={Users} onClose={() => setShowBroadcast(false)} wide>
        <form onSubmit={handleBroadcast} className="space-y-4">
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">Internal memo — delivered strictly among staff members, never to parents.</p>
          <div>
            <label className="text-sm font-medium text-slate-700">Title</label>
            <input required value={broadcastForm.title} onChange={(e) => setBroadcastForm({ ...broadcastForm, title: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Message</label>
            <textarea required rows={4} value={broadcastForm.body} onChange={(e) => setBroadcastForm({ ...broadcastForm, body: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700">Target roles (none selected = all staff)</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {STAFF_ROLES.map((role) => {
                const active = broadcastForm.target_roles.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setBroadcastForm({
                      ...broadcastForm,
                      target_roles: active ? broadcastForm.target_roles.filter((r) => r !== role) : [...broadcastForm.target_roles, role],
                    })}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${active ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}`}
                  >
                    {role}
                  </button>
                );
              })}
            </div>
          </div>
          <button type="submit" disabled={sending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Users size={16} />} {sending ? 'Broadcasting…' : 'Broadcast to Staff'}
          </button>
        </form>
      </Modal>

      {/* Gate pass trigger */}
      <Modal open={showGatePass} title="Visite Day / Gate Pass Notification" icon={ClipboardList} onClose={() => setShowGatePass(false)}>
        <form onSubmit={handleGatePass} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Student name</label>
            <input required list="sms-students" value={gatePassForm.student_name} onChange={(e) => setGatePassForm({ ...gatePassForm, student_name: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white" />
            <datalist id="sms-students">{students.map((s) => <option key={s.id} value={s.name} />)}</datalist>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Destination</label>
            <input required value={gatePassForm.destination} onChange={(e) => setGatePassForm({ ...gatePassForm, destination: e.target.value })} placeholder="e.g. Musanze town, Kigali home visit" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Expected return</label>
            <input type="datetime-local" value={gatePassForm.expected_return} onChange={(e) => setGatePassForm({ ...gatePassForm, expected_return: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white" />
          </div>
          <p className="text-xs text-slate-500">An SMS including destination and return details is sent to the guardian on file.</p>
          <button type="submit" disabled={sending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-700 disabled:opacity-60">
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {sending ? 'Notifying…' : 'Notify Guardian'}
          </button>
        </form>
      </Modal>

      {/* Check-in / out trigger */}
      <Modal open={showCheck} title="Check-In / Check-Out Notification" icon={Smartphone} onClose={() => setShowCheck(false)}>
        <form onSubmit={handleCheck} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Student name</label>
            <input required list="sms-students" value={checkForm.student_name} onChange={(e) => setCheckForm({ ...checkForm, student_name: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700">Direction</label>
              <select value={checkForm.direction} onChange={(e) => setCheckForm({ ...checkForm, direction: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white">
                <option value="in">Check-In</option>
                <option value="out">Check-Out</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Scan method</label>
              <select value={checkForm.method} onChange={(e) => setCheckForm({ ...checkForm, method: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white">
                <option value="qr">QR scan</option>
                <option value="nfc">NFC scan</option>
                <option value="manual">Manual / attendance update</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-500">Works for both day scholars and boarders; works alongside gate scans or attendance updates.</p>
          <button type="submit" disabled={sending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-700 disabled:opacity-60">
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {sending ? 'Triggering…' : 'Trigger Notification'}
          </button>
        </form>
      </Modal>
    </div>
  );
}

export default SMSNotificationsDashboard;
