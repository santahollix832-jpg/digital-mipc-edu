import { useCallback, useEffect, useState } from 'react';
import { Award, MinusCircle, PlusCircle, RefreshCw, Sparkles, TrendingDown } from 'lucide-react';
import { apiFetch } from '../../api/config';
import { cardClasses, formatDateTime, inputClasses, labelClasses, useStudents } from './shared';

function MeritDemerit({ toast }) {
  const { students, studentError } = useStudents();
  const [ledger, setLedger] = useState([]);
  const [totals, setTotals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ student_id: '', entry_type: 'merit', points: '5', reason: '' });

  const loadLedger = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await apiFetch('/api/discipline/points');
      const payload = await response.json();
      if (!response.ok || payload.success === false) throw new Error(payload.message || `Failed to load (${response.status}).`);
      setLedger(Array.isArray(payload.ledger) ? payload.ledger : []);
      setTotals(Array.isArray(payload.totals) ? payload.totals : []);
    } catch (err) {
      console.error('Failed to load points ledger:', err);
      setLoadError(err.message || 'Unable to load the merit & demerit ledger.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLedger(); }, [loadLedger]);

  async function handleAward(e) {
    e.preventDefault();
    const points = Number(form.points);
    if (!form.student_id || !['merit', 'demerit'].includes(form.entry_type) || !Number.isInteger(points) || points <= 0 || !form.reason.trim()) {
      toast?.('Student, entry type, points (1–100), and reason are required.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const response = await apiFetch('/api/discipline/points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: Number(form.student_id),
          entry_type: form.entry_type,
          points,
          reason: form.reason.trim(),
          awarded_by: undefined, // server falls back to the signed-in staff member
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.success === false) throw new Error(payload.message || 'Failed to record the entry.');
      toast?.(`${form.entry_type === 'merit' ? 'Merit' : 'Demerit'} of ${points} point${points === 1 ? '' : 's'} recorded — totals updated.`);
      setForm({ ...form, points: '5', reason: '' });
      await loadLedger();
    } catch (err) {
      console.error('Failed to record points:', err);
      toast?.(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const visibleLedger = ledger.filter((entry) => {
    const typeMatch = filter === 'All' || entry.entry_type === filter;
    const term = search.trim().toLowerCase();
    const searchMatch = !term || [entry.student_name, entry.class_name, entry.reason].some((v) => String(v || '').toLowerCase().includes(term));
    return typeMatch && searchMatch;
  });

  return (
    <div className="space-y-6">
      <section className={cardClasses}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
            <Sparkles size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Award Merit / Demerit</h2>
            <p className="text-sm text-slate-500">Demerits deduct from the student's 40-point Conduit balance; merits restore it, capped at the 40-point base.</p>
          </div>
        </div>
        <form onSubmit={handleAward} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className={labelClasses}>Student</label>
            <select className={inputClasses} value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })} disabled={Boolean(studentError)}>
              <option value="">Select student</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name} — {s.class_name || s.class} ({s.reg_number})</option>
              ))}
            </select>
            {studentError && <p className="mt-1 text-sm text-rose-600">{studentError}</p>}
          </div>
          <div>
            <label className={labelClasses}>Entry Type</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'merit', label: 'Merit', icon: Award, active: 'bg-emerald-50 border-emerald-500 text-emerald-700 ring-1 ring-emerald-500' },
                { value: 'demerit', label: 'Demerit', icon: MinusCircle, active: 'bg-rose-50 border-rose-500 text-rose-700 ring-1 ring-rose-500' },
              ].map(({ value, label, icon: Icon, active }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm({ ...form, entry_type: value })}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-semibold transition-all ${form.entry_type === value ? active : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                >
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelClasses}>Points (1–100)</label>
            <input type="number" min="1" max="100" className={inputClasses} value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} />
          </div>
          <div className="md:col-span-3">
            <label className={labelClasses}>Reason</label>
            <input type="text" className={inputClasses} placeholder={form.entry_type === 'merit' ? 'e.g., Helped a classmate, excellent conduct…' : 'e.g., Disrespect, truancy…'} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <PlusCircle size={16} />
              {submitting ? 'Recording…' : 'Record Entry'}
            </button>
          </div>
        </form>
      </section>

      <section className={cardClasses}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <TrendingDown size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Conduit Scoreboard</h2>
              <p className="text-sm text-slate-500">Live 40-point Conduit meters per student — demerits deduct, merits restore (capped at the base).</p>
            </div>
          </div>
          <button type="button" onClick={loadLedger} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            <p className="text-sm text-slate-500">Loading scoreboard…</p>
          ) : totals.length === 0 ? (
            <p className="text-sm text-slate-500">No points recorded yet. Award the first merit or demerit above.</p>
          ) : (
            totals.map((student) => (
              <div key={student.student_id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-semibold text-slate-900">{student.student_name}</p>
                <p className="text-xs text-slate-500">{student.class_name || '—'} · {student.student_custom_id || '—'}</p>
                {typeof student.conduit_points === 'number' && (
                 <div className="mt-3">
                   <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                     <span>Conduit meter</span>
                     <span>{student.conduit_points} / {student.base_points}</span>
                   </div>
                   <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                     <div
                       className={`h-full rounded-full transition-all ${
                         student.conduit_points / (student.base_points || 40) >= 0.75
                           ? 'bg-emerald-500'
                           : student.conduit_points / (student.base_points || 40) >= 0.4
                             ? 'bg-amber-500'
                             : 'bg-rose-500'
                       }`}
                       style={{ width: `${Math.round((student.conduit_points / (student.base_points || 40)) * 100)}%` }}
                     />
                   </div>
                 </div>
                )}
                <div className="mt-3 flex items-end gap-4 text-sm">
                  <span className="text-emerald-700 font-semibold">+{student.merits} merits</span>
                  <span className="text-rose-700 font-semibold">−{student.demerits} demerits</span>
                  <span className={`ml-auto rounded-full px-3 py-1 text-xs font-bold ${student.balance >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                    Balance {student.balance >= 0 ? '+' : ''}{student.balance}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className={cardClasses}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Points Ledger</h2>
          <div className="flex gap-2">
            <input
              type="search"
              aria-label="Search ledger"
              placeholder="Search student or reason…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
            <select
              aria-label="Filter ledger by type"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            >
              {['All', 'merit', 'demerit'].map((t) => <option key={t} value={t}>{t === 'All' ? 'All entries' : t}</option>)}
            </select>
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
                <th className="px-4 py-3 text-left font-semibold">Type</th>
                <th className="px-4 py-3 text-left font-semibold">Points</th>
                <th className="px-4 py-3 text-left font-semibold">Reason</th>
                <th className="px-4 py-3 text-left font-semibold">Awarded By</th>
                <th className="px-4 py-3 text-left font-semibold">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleLedger.length === 0 ? (
                <tr><td colSpan="6" className="px-4 py-6 text-center text-slate-500">No ledger entries to show.</td></tr>
              ) : (
                visibleLedger.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{entry.student_name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${entry.entry_type === 'merit' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-rose-100 text-rose-700 border-rose-200'}`}>
                        {entry.entry_type === 'merit' ? 'Merit' : 'Demerit'}
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-bold ${entry.entry_type === 'merit' ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {entry.entry_type === 'merit' ? '+' : '−'}{entry.points}
                    </td>
                    <td className="px-4 py-3 max-w-[280px] truncate text-slate-600" title={entry.reason}>{entry.reason}</td>
                    <td className="px-4 py-3 text-slate-600">{entry.awarded_by || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDateTime(entry.awarded_at)}</td>
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

export default MeritDemerit;
