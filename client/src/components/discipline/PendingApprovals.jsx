import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, Gavel, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { apiFetch } from '../../api/config';

const severityStyles = {
  Low: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Medium: 'bg-amber-100 text-amber-700 border-amber-200',
  High: 'bg-rose-100 text-rose-700 border-rose-200',
};

function PendingApprovals({ onChanged }) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState('');

  const loadPending = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await apiFetch('/api/discipline/incidents/pending');
      const payload = await response.json();
      if (!response.ok || payload.success === false) {
        throw new Error(payload.message || `Failed to load the approval queue (${response.status}).`);
      }
      setIncidents(Array.isArray(payload.data) ? payload.data : []);
    } catch (error) {
      console.error('Failed to load pending incidents:', error);
      setLoadError(error.message || 'Unable to load the approval queue. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  async function review(incidentId, decision) {
    setBusyId(incidentId);
    setNotice('');
    try {
      const response = await apiFetch(`/api/discipline/incidents/${incidentId}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const payload = await response.json();
      if (!response.ok || payload.success === false) {
        throw new Error(payload.message || 'Review action failed.');
      }
      setNotice(decision === 'approve'
        ? 'Incident approved — it is now part of the student record.'
        : 'Incident rejected — it will not appear on the student record.');
      await loadPending();
      onChanged?.();
    } catch (error) {
      console.error('Failed to review incident:', error);
      setNotice(error.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_45px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Pending Incident Approvals</h2>
            <p className="text-sm text-slate-500">Reports submitted by Patrons &amp; Matrons awaiting your decision.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadPending}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {notice && (
        <p role="status" className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          {notice}
        </p>
      )}
      {loadError && (
        <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {loadError}
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-slate-500">Loading approval queue…</p>
      ) : incidents.length === 0 ? (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
          <CheckCircle2 size={18} />
          No pending incidents. All reports have been reviewed.
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {incidents.map((incident) => (
            <li key={incident.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{incident.student_name}</p>
                    <span className="text-xs font-medium text-slate-500">{incident.class_name || '—'} · {incident.student_custom_id || '—'}</span>
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${severityStyles[incident.severity] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {incident.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-indigo-700">{incident.incident_type}</p>
                  <p className="mt-1 text-sm text-slate-600">{incident.description}</p>
                  <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <Clock size={13} />
                    {incident.incident_date} at {String(incident.incident_time).slice(0, 5)}
                    {incident.location ? ` · ${incident.location}` : ''} · Reported by {incident.reported_by}
                  </p>
                  {incident.action_taken && (
                    <p className="mt-1 text-xs text-slate-500">Immediate action: {incident.action_taken}</p>
                  )}
                </div>

                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busyId === incident.id}
                    onClick={() => review(incident.id, 'approve')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <CheckCircle2 size={16} />
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyId === incident.id}
                    onClick={() => review(incident.id, 'reject')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <XCircle size={16} />
                    Reject
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 flex items-center gap-2 text-xs text-slate-400">
        <Gavel size={13} />
        Approved incidents are immediately recorded on the student's active discipline record.
      </p>
    </section>
  );
}

export default PendingApprovals;
