import { useCallback, useEffect, useState } from 'react';
import { Gavel, PlusCircle, RefreshCw } from 'lucide-react';
import { apiFetch } from '../../api/config';
import StudentSearchInput from '../StudentSearchInput';
import { Badge, cardClasses, formatDateTime, inputClasses, labelClasses, useStudents } from './shared';

const ACTION_TYPES = ['Detention', 'Community Service', 'Suspension', 'Counseling Session', 'Written Warning', 'Other'];
const STATUSES = ['Pending', 'In Progress', 'Completed'];

const statusBadge = {
  Pending: 'bg-amber-100 text-amber-700 border-amber-200',
  'In Progress': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  Completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

function CorrectiveActions({ toast }) {
  const { students, studentError } = useStudents();
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState('All');
  const [form, setForm] = useState({ student_id: '', action_type: 'Detention', reason: '', due_date: '', incident_id: '' });

  const loadActions = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await apiFetch('/api/discipline/actions');
      const payload = await response.json();
      if (!response.ok || payload.success === false) throw new Error(payload.message || `Failed to load (${response.status}).`);
      setActions(Array.isArray(payload.data) ? payload.data : []);
    } catch (err) {
      console.error('Failed to load corrective actions:', err);
      setLoadError(err.message || 'Unable to load corrective actions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadActions(); }, [loadActions]);

  async function handleAssign(e) {
    e.preventDefault();
    if (!form.student_id || !form.action_type || !form.reason.trim()) {
      toast?.('Student, action type, and reason are required.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const response = await apiFetch('/api/discipline/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: Number(form.student_id),
          action_type: form.action_type,
          reason: form.reason.trim(),
          due_date: form.due_date || null,
          incident_id: form.incident_id ? Number(form.incident_id) : null,
          assigned_by: undefined, // server falls back to the signed-in staff member
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.success === false) throw new Error(payload.message || 'Failed to assign action.');
      toast?.(`${form.action_type} assigned successfully.`);
      setForm({ student_id: '', action_type: 'Detention', reason: '', due_date: '', incident_id: '' });
      await loadActions();
    } catch (err) {
      console.error('Failed to assign action:', err);
      toast?.(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function setActionStatus(id, status) {
    setBusyId(id);
    try {
      const response = await apiFetch(`/api/discipline/actions/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json();
      if (!response.ok || payload.success === false) throw new Error(payload.message || 'Status update failed.');
      toast?.(`Action marked ${status}.`);
      await loadActions();
    } catch (err) {
      console.error('Failed to update action:', err);
      toast?.(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  const visible = filter === 'All' ? actions : actions.filter((a) => a.status === filter);
  const counts = STATUSES.reduce((acc, s) => ({ ...acc, [s]: actions.filter((a) => a.status === s).length }), {});

  return (
    <div className="space-y-6">
      <section className={cardClasses}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
            <PlusCircle size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Assign Corrective Action</h2>
            <p className="text-sm text-slate-500">Detentions, community service, suspensions, or counseling tied to student conduct.</p>
          </div>
        </div>
        <form onSubmit={handleAssign} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClasses}>Student</label>
            <StudentSearchInput
              students={students}
              value={form.student_id}
              onChange={(studentId) => setForm({ ...form, student_id: studentId })}
              disabled={Boolean(studentError)}
              inputClassName="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-4 font-bold text-slate-900 shadow-sm outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            {studentError && <p className="mt-1 text-sm text-rose-600">{studentError}</p>}
          </div>
          <div>
            <label className={labelClasses}>Action Type</label>
            <select className={inputClasses} value={form.action_type} onChange={(e) => setForm({ ...form, action_type: e.target.value })}>
              {ACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClasses}>Reason / Details</label>
            <input type="text" className={inputClasses} placeholder="Explain what prompted this action…" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClasses}>Due Date</label>
              <input type="date" className={inputClasses} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div>
              <label className={labelClasses}>Linked Incident ID (optional)</label>
              <input type="number" min="1" className={inputClasses} placeholder="e.g., 12" value={form.incident_id} onChange={(e) => setForm({ ...form, incident_id: e.target.value })} />
            </div>
          </div>
          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Gavel size={16} />
              {submitting ? 'Assigning…' : 'Assign Action'}
            </button>
          </div>
        </form>
      </section>

      <section className={cardClasses}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <Gavel size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Corrective Actions Register</h2>
              <p className="text-sm text-slate-500">
                {counts.Pending} pending · {counts['In Progress']} in progress · {counts.Completed} completed
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <select
              aria-label="Filter actions by status"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            >
              {['All', ...STATUSES].map((s) => <option key={s} value={s}>{s === 'All' ? 'All statuses' : s}</option>)}
            </select>
            <button type="button" onClick={loadActions} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
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
                <th className="px-4 py-3 text-left font-semibold">Action</th>
                <th className="px-4 py-3 text-left font-semibold">Reason</th>
                <th className="px-4 py-3 text-left font-semibold">Assigned By</th>
                <th className="px-4 py-3 text-left font-semibold">Due</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="8" className="px-4 py-6 text-center text-slate-500">Loading actions…</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan="8" className="px-4 py-6 text-center text-slate-500">No corrective actions found for this filter.</td></tr>
              ) : (
                visible.map((action) => (
                  <tr key={action.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{action.student_name}</td>
                    <td className="px-4 py-3 text-slate-600">{action.class_name || '—'}</td>
                    <td className="px-4 py-3"><span className="font-medium text-indigo-700">{action.action_type}</span></td>
                    <td className="px-4 py-3 max-w-[240px] truncate text-slate-600" title={action.reason}>{action.reason}</td>
                    <td className="px-4 py-3 text-slate-600">{action.assigned_by || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{action.due_date || '—'}{action.completed_at ? ` · done ${formatDateTime(action.completed_at)}` : ''}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadge[action.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {action.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        {STATUSES.filter((s) => s !== action.status).map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={busyId === action.id}
                            onClick={() => setActionStatus(action.id, s)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 disabled:opacity-60"
                          >
                            {s === 'In Progress' ? 'Start' : s === 'Completed' ? 'Complete' : 'Reopen'}
                          </button>
                        ))}
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

export default CorrectiveActions;
