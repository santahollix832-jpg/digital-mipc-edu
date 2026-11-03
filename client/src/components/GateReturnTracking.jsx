import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Clock3, FileWarning, RefreshCw, Search } from 'lucide-react';
import { apiFetch } from '../api/config';
import { useToast } from './ToastProvider';

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function formatOverdue(seconds) {
  if (!seconds || seconds <= 0) return 'On time';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min overdue`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m overdue` : `${hours}h overdue`;
}

function GateReturnTracking() {
  const { notify } = useToast();
  const [activeLeaves, setActiveLeaves] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('outside');

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [activeResponse, reportsResponse] = await Promise.all([
        apiFetch('/permissions/gate/active'),
        apiFetch('/permissions/gate/reported'),
      ]);
      if (!activeResponse.ok) throw new Error('Unable to load students currently outside the school.');
      if (!reportsResponse.ok) throw new Error('Unable to load filed overdue reports.');
      const activePayload = await activeResponse.json();
      const reportsPayload = await reportsResponse.json();
      setActiveLeaves(Array.isArray(activePayload) ? activePayload : activePayload.data || []);
      setReports(Array.isArray(reportsPayload) ? reportsPayload : reportsPayload.data || []);
    } catch (error) {
      console.error(error);
      if (!silent) notify(error.message || 'Unable to load gate data.', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 60000);
    return () => clearInterval(interval);
  }, [load]);

  async function markReturned(request) {
    setBusyId(request.id);
    try {
      const response = await apiFetch(`/permissions/gate/${request.id}/return`, { method: 'POST' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to record the return.');
      notify(`Return recorded for ${request.student_name}.`, 'success');
      await load(true);
    } catch (error) {
      console.error(error);
      notify(error.message || 'Unable to record the return.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function reportOverdue(request) {
    if (!window.confirm(
      `File a formal overdue report for ${request.student_name}?\n\n` +
      `This notifies Admin, DOD, Patron and Matron and automatically deducts discipline points.`
    )) return;
    setBusyId(request.id);
    try {
      const response = await apiFetch(`/permissions/gate/${request.id}/report-overdue`, { method: 'POST' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to file the overdue report.');
      notify(result.message || 'Overdue report filed.', 'success');
      await load(true);
    } catch (error) {
      console.error(error);
      notify(error.message || 'Unable to file the overdue report.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return activeLeaves;
    return activeLeaves.filter((item) =>
      item.student_name?.toLowerCase().includes(query) ||
      item.class_name?.toLowerCase().includes(query) ||
      item.reason?.toLowerCase().includes(query)
    );
  }, [activeLeaves, search]);

  const overdueCount = activeLeaves.filter((item) => item.status === 'Overdue').length;

  return (
    <main className="p-4 md:p-8 xl:p-10">
      <header className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">Security gate</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Gate return tracking</h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Monitor students currently outside the school on approved leave, record on-time returns,
            and file formal overdue reports for late returns.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {overdueCount > 0 && (
            <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 shadow-sm">
              <AlertTriangle size={16} className="text-red-600" />
              {overdueCount} overdue return{overdueCount > 1 ? 's' : ''}
            </div>
          )}
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-indigo-200 hover:text-indigo-600"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </header>

      <section className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_15px_35px_rgba(15,23,42,0.05)]">
          <p className="text-sm text-slate-500">Currently outside</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{activeLeaves.length}</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-[0_15px_35px_rgba(15,23,42,0.05)]">
          <p className="text-sm text-red-600">Overdue</p>
          <p className="mt-1 text-3xl font-bold text-red-700">{overdueCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_15px_35px_rgba(15,23,42,0.05)]">
          <p className="text-sm text-slate-500">Reports filed</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{reports.length}</p>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_45px_rgba(15,23,42,0.04)] md:p-6">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex gap-2">
            {[
              { id: 'outside', label: 'Students outside' },
              { id: 'reports', label: 'Filed overdue reports' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === item.id
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {tab === 'outside' && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search student, class or reason"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-400 focus:bg-white xl:w-72"
              />
            </div>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-2xl bg-slate-200" />
            ))}
          </div>
        ) : tab === 'outside' ? (
          filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-slate-600">
              No students are currently outside the school on leave.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm text-slate-700">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Student</th>
                      <th className="px-4 py-3 font-semibold">Class</th>
                      <th className="px-4 py-3 font-semibold">Leave reason</th>
                      <th className="px-4 py-3 font-semibold">Departure</th>
                      <th className="px-4 py-3 font-semibold">Expected return</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold text-right">Gate actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filtered.map((item) => {
                      const isOverdue = item.status === 'Overdue' || item.seconds_overdue > 0;
                      return (
                        <tr key={item.id} className="align-top transition hover:bg-slate-50">
                          <td className="px-4 py-4 font-semibold text-slate-900">{item.student_name}</td>
                          <td className="px-4 py-4">{item.class_name}</td>
                          <td className="px-4 py-4 max-w-sm text-slate-600">{item.reason}</td>
                          <td className="px-4 py-4">{formatDateTime(item.departure_time)}</td>
                          <td className="px-4 py-4">
                            <div className={`inline-flex items-center gap-1 font-medium ${isOverdue ? 'text-red-600' : 'text-slate-600'}`}>
                              <Clock3 size={14} />
                              {formatDateTime(item.expected_return_time)}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${isOverdue
                                ? 'bg-red-100 text-red-700 border border-red-200'
                                : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              }`}>
                              {isOverdue ? `Overdue · ${formatOverdue(item.seconds_overdue)}` : 'On time'}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                disabled={busyId === item.id}
                                onClick={() => markReturned(item)}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <Check size={12} />
                                Returned
                              </button>
                              {isOverdue && (
                                <button
                                  type="button"
                                  disabled={busyId === item.id}
                                  onClick={() => reportOverdue(item)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <FileWarning size={12} />
                                  Report overdue
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : reports.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-slate-600">
            No overdue reports have been filed yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Student</th>
                    <th className="px-4 py-3 font-semibold">Class</th>
                    <th className="px-4 py-3 font-semibold">Leave reason</th>
                    <th className="px-4 py-3 font-semibold">Exact overdue duration</th>
                    <th className="px-4 py-3 font-semibold">Points deducted</th>
                    <th className="px-4 py-3 font-semibold">Notified</th>
                    <th className="px-4 py-3 font-semibold">Filed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {reports.map((report) => (
                    <tr key={report.id} className="align-top transition hover:bg-slate-50">
                      <td className="px-4 py-4 font-semibold text-slate-900">{report.student_name}</td>
                      <td className="px-4 py-4">{report.class_name}</td>
                      <td className="px-4 py-4 max-w-sm text-slate-600">{report.leave_reason || '—'}</td>
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center gap-1 font-semibold text-red-600">
                          <Clock3 size={14} />
                          {formatOverdue((report.overdue_minutes || 0) * 60)}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-semibold text-red-600">−{report.points_deducted}</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1">
                          {(Array.isArray(report.report_recipients)
                            ? report.report_recipients
                            : (() => { try { return JSON.parse(report.report_recipients || '[]'); } catch { return []; } })()
                          ).map((role) => (
                            <span key={role} className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">{role}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {formatDateTime(report.created_at)}
                        <div className="text-xs text-slate-500">by {report.created_by || 'Security'}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

export default GateReturnTracking;
