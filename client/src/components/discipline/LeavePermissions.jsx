import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Clock, Download, LogOut, PlusCircle, RefreshCw, Undo2, XCircle } from 'lucide-react';
import { apiFetch } from '../../api/config';
import { Badge, cardClasses, formatDateTime, inputClasses, labelClasses, useStudents } from './shared';

function LeavePermissions({ toast }) {
  const { students, studentError } = useStudents();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState('All');
  const [form, setForm] = useState({
    student_id: '',
    reason: '',
    departure_time: '',
    expected_return_time: '',
  });

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await apiFetch('/api/permissions/history');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Failed to load (${response.status}).`);
      setRecords(Array.isArray(payload) ? payload : payload.data || []);
    } catch (err) {
      console.error('Failed to load permissions:', err);
      setLoadError(err.message || 'Unable to load leave permissions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  async function handleIssue(e) {
    e.preventDefault();
    if (!form.student_id || !form.reason.trim() || !form.departure_time || !form.expected_return_time) {
      toast?.('Please complete all fields before issuing the permit.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const response = await apiFetch('/api/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: Number(form.student_id),
          reason: form.reason.trim(),
          departure_time: form.departure_time,
          expected_return_time: form.expected_return_time,
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || 'Failed to issue the permit.');
      }
      toast?.('Leave permit issued — awaiting approval.');
      setForm({ student_id: '', reason: '', departure_time: '', expected_return_time: '' });
      await loadRecords();
    } catch (err) {
      console.error('Failed to issue permit:', err);
      toast?.(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(id, status) {
    setBusyId(id);
    try {
      const response = await apiFetch(`/api/permissions/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json();
      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || 'Status update failed.');
      }
      toast?.(`Permit ${status.toLowerCase()}.`);
      await loadRecords();
    } catch (err) {
      console.error('Failed to update permit:', err);
      toast?.(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function markReturned(id) {
    setBusyId(id);
    try {
      const response = await apiFetch(`/api/permissions/${id}/return`, { method: 'PUT' });
      if (!response.ok) throw new Error('Failed to record the return.');
      toast?.('Student marked as returned.');
      await loadRecords();
    } catch (err) {
      console.error('Failed to mark returned:', err);
      toast?.(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  const visible = filter === 'All' ? records : records.filter((r) => r.status === filter);

  return (
    <div className="space-y-6">
      <section className={cardClasses}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
            <PlusCircle size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Issue Leave Permit</h2>
            <p className="text-sm text-slate-500">Create an exit permit for a student. It starts as Pending until approved.</p>
          </div>
        </div>
        <form onSubmit={handleIssue} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClasses}>Student</label>
            <select
              className={inputClasses}
              value={form.student_id}
              onChange={(e) => setForm({ ...form, student_id: e.target.value })}
              disabled={Boolean(studentError)}
            >
              <option value="">Select student</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name} — {s.class_name || s.class} ({s.reg_number})</option>
              ))}
            </select>
            {studentError && <p className="mt-1 text-sm text-rose-600">{studentError}</p>}
          </div>
          <div>
            <label className={labelClasses}>Reason</label>
            <input
              type="text"
              className={inputClasses}
              placeholder="e.g., Medical appointment, Family visit…"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClasses}>Departure Time</label>
            <input
              type="datetime-local"
              className={inputClasses}
              value={form.departure_time}
              onChange={(e) => setForm({ ...form, departure_time: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClasses}>Expected Return Time</label>
            <input
              type="datetime-local"
              className={inputClasses}
              value={form.expected_return_time}
              onChange={(e) => setForm({ ...form, expected_return_time: e.target.value })}
            />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogOut size={16} />
              {submitting ? 'Issuing…' : 'Issue Permit'}
            </button>
          </div>
        </form>
      </section>

      <section className={cardClasses}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <Clock size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Leave &amp; Permission Tracking Grid</h2>
              <p className="text-sm text-slate-500">Approve, reject, and monitor student exit / entry permits.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <select
              aria-label="Filter permits by status"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            >
              {['All', 'Pending', 'Approved', 'Rejected', 'Returned', 'Overdue'].map((s) => (
                <option key={s} value={s}>{s === 'All' ? 'All statuses' : s}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={loadRecords}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {loadError && (
          <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{loadError}</p>
        )}

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-3 text-left font-semibold">Student</th>
                <th className="px-4 py-3 text-left font-semibold">Class</th>
                <th className="px-4 py-3 text-left font-semibold">Reason</th>
                <th className="px-4 py-3 text-left font-semibold">Departure</th>
                <th className="px-4 py-3 text-left font-semibold">Expected Return</th>
                <th className="px-4 py-3 text-left font-semibold">Actual Return</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="8" className="px-4 py-6 text-center text-slate-500">Loading permits…</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan="8" className="px-4 py-6 text-center text-slate-500">No leave permits found for this filter.</td></tr>
              ) : (
                visible.map((permit) => (
                  <tr key={permit.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{permit.student_name}</td>
                    <td className="px-4 py-3 text-slate-600">{permit.class_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{permit.reason}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDateTime(permit.departure_time)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDateTime(permit.expected_return_time)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDateTime(permit.actual_return_timestamp)}</td>
                    <td className="px-4 py-3"><Badge value={permit.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {permit.status === 'Pending' && (
                          <>
                            <button
                              type="button"
                              disabled={busyId === permit.id}
                              onClick={() => updateStatus(permit.id, 'Approved')}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                            >
                              <BadgeCheck size={14} /> Approve
                            </button>
                            <button
                              type="button"
                              disabled={busyId === permit.id}
                              onClick={() => updateStatus(permit.id, 'Rejected')}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                            >
                              <XCircle size={14} /> Reject
                            </button>
                          </>
                        )}
                        {(permit.status === 'Approved' || permit.status === 'Overdue') && (
                          <button
                            type="button"
                            disabled={busyId === permit.id}
                            onClick={() => markReturned(permit.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
                          >
                            <Undo2 size={14} /> Mark Returned
                          </button>
                        )}
                        {!['Pending', 'Approved', 'Overdue'].includes(permit.status) && (
                          <span className="text-xs text-slate-400">No actions</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default LeavePermissions;
