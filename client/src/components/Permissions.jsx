import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, CircleX, Clock3, Filter, Search } from 'lucide-react';
import { apiFetch } from '../api/config';
import { useToast } from './ToastProvider';

const emptyForm = {
  student_name: '',
  class_name: '',
  reason: '',
  start_date: '',
  end_date: '',
  departure_time: '',
  expected_return_time: '',
  status: 'Pending',
};

const statusStyles = {
  Pending: 'bg-amber-100 text-amber-700 border border-amber-200',
  Approved: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  Overdue: 'bg-red-100 text-red-700 border border-red-200',
  Rejected: 'bg-rose-100 text-rose-700 border border-rose-200',
  Returned: 'bg-sky-100 text-sky-700 border border-sky-200',
};

const PAGE_SIZE = 6;

function isOverdueRequest(request) {
  const rawStatus = String(request.status || '').toLowerCase();
  if (rawStatus === 'rejected' || rawStatus === 'returned') return false;
  if (rawStatus === 'overdue') return true;

  const timeoutValue = request.expected_return_time || request.return_timestamp || request.end_date || request.expectedReturnTime || request.returnTimestamp;
  if (!timeoutValue) return false;

  const deadline = new Date(timeoutValue).getTime();
  if (Number.isNaN(deadline)) return false;

  return deadline < Date.now() && rawStatus !== 'pending';
}

function formatValue(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function Permissions() {
  const { notify } = useToast();
  const [requests, setRequests] = useState([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [overviewTab, setOverviewTab] = useState('all');

  useEffect(() => {
    loadRequests();
    const interval = setInterval(() => loadRequests(true), 60000);
    return () => clearInterval(interval);
  }, []);

  async function loadRequests(silent = false) {
    try {
      if (!silent) setLoading(true);
      const [permissionResponse, overdueResponse] = await Promise.all([
        apiFetch('/permissions'),
        apiFetch('/permissions/overdue'),
      ]);

      if (!permissionResponse.ok) throw new Error('Permissions request failed.');
      const payload = await permissionResponse.json();
      const items = Array.isArray(payload) ? payload : payload.data || [];
      const normalized = items.map((item) => ({
        id: item.id || item._id || `${item.student_name}-${item.start_date || item.created_at}`,
        student_name: item.student_name || item.studentName || 'Unknown student',
        class_name: item.class_name || item.className || 'Unassigned',
        reason: item.reason || 'No reason provided',
        start_date: item.start_date || item.startDate || item.leave_timestamp || '',
        end_date: item.end_date || item.endDate || item.expected_return_time || item.return_timestamp || '',
        departure_time: item.departure_time || item.departureTime || item.leave_timestamp || '',
        expected_return_time: item.expected_return_time || item.expectedReturnTime || item.return_timestamp || '',
        status: item.status || 'Pending',
      }));

      setRequests(normalized);

      const overduePayload = await overdueResponse.json().catch(() => []);
      const overdueItems = Array.isArray(overduePayload) ? overduePayload : overduePayload.data || [];
      setOverdueCount(Array.isArray(overdueItems) ? overdueItems.length : overduePayload?.length || 0);
    } catch (error) {
      console.error(error);
      if (!silent) notify('Unable to load permission requests.', 'error');
    } finally {
      setLoading(false);
    }
  }

  const filteredRequests = useMemo(() => {
    const query = search.trim().toLowerCase();
    return requests.filter((request) => {
      const matchesStatus = statusFilter === 'All'
        ? true
        : statusFilter === 'Overdue'
          ? request.status === 'Overdue' || isOverdueRequest(request)
          : request.status === statusFilter;

      const matchesSearch = !query ||
        request.student_name.toLowerCase().includes(query) ||
        request.class_name.toLowerCase().includes(query) ||
        request.reason.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [requests, statusFilter, search]);

  const onTimeRequests = useMemo(
    () => requests.filter((request) => !isOverdueRequest(request) && request.status !== 'Rejected' && request.status !== 'Pending'),
    [requests]
  );

  const overdueRequests = useMemo(
    () => requests.filter((request) => isOverdueRequest(request) || request.status === 'Overdue'),
    [requests]
  );

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / PAGE_SIZE));
  const currentItems = filteredRequests.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const overviewItems = useMemo(() => {
    if (overviewTab === 'on_time') return onTimeRequests;
    if (overviewTab === 'overdue') return overdueRequests;
    return requests;
  }, [overviewTab, onTimeRequests, overdueRequests, requests]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, search]);

  function handleInputChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.student_name || !form.class_name || !form.reason || !form.start_date || !form.end_date || !form.departure_time || !form.expected_return_time) {
      notify('Please complete departure and expected return times before submitting.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        student_name: form.student_name,
        class_name: form.class_name,
        reason: form.reason,
        start_date: form.start_date,
        end_date: form.end_date,
        departure_time: form.departure_time,
        expected_return_time: form.expected_return_time,
        status: form.status,
      };

      const response = await apiFetch('/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Failed to create permission request.');
      }

      setRequests((current) => [{
        id: result.permission?.id || Date.now(),
        student_name: payload.student_name,
        class_name: payload.class_name,
        reason: payload.reason,
        start_date: payload.start_date,
        end_date: payload.end_date,
        departure_time: payload.departure_time,
        expected_return_time: payload.expected_return_time,
        status: payload.status,
      }, ...current]);
      setForm(emptyForm);
      notify('Permission request submitted successfully.', 'success');
    } catch (error) {
      console.error(error);
      notify(error.message || 'Could not submit permission request.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(id, nextStatus) {
    try {
      const response = await apiFetch(`/permissions/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Status update failed.');
      }

      setRequests((current) =>
        current.map((request) => (request.id === id ? { ...request, status: nextStatus } : request))
      );
      notify(`Permission request marked as ${nextStatus}.`, 'success');
    } catch (error) {
      console.error(error);
      notify(error.message || 'Unable to update permission status.', 'error');
    }
  }

  return (
    <main className="p-4 md:p-8 xl:p-10">
      <header className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">Permission center</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Leave management</h1>
        </div>

        {overdueCount > 0 && (
          <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 shadow-sm">
            <AlertTriangle size={16} className="text-red-600" />
            {overdueCount} Overdue student{overdueCount > 1 ? 's' : ''}
          </div>
        )}
      </header>

      <section className="mb-8 grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_45px_rgba(15,23,42,0.06)] md:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Request form</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">New leave permission</h2>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
            <label className="block md:col-span-1">
              <span className="mb-2 block text-sm font-medium text-slate-700">Student Name</span>
              <input
                name="student_name"
                value={form.student_name}
                onChange={handleInputChange}
                placeholder="Aisha Mutesa"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white"
              />
            </label>

            <label className="block md:col-span-1">
              <span className="mb-2 block text-sm font-medium text-slate-700">Class</span>
              <input
                name="class_name"
                value={form.class_name}
                onChange={handleInputChange}
                placeholder="S4A"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-medium text-slate-700">Reason</span>
              <textarea
                name="reason"
                value={form.reason}
                onChange={handleInputChange}
                rows="3"
                placeholder="Provide a short explanation for the leave request"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Departure Time</span>
              <input
                type="datetime-local"
                name="departure_time"
                value={form.departure_time}
                onChange={handleInputChange}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Expected Return Time</span>
              <input
                type="datetime-local"
                name="expected_return_time"
                value={form.expected_return_time}
                onChange={handleInputChange}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Start Date</span>
              <input
                type="date"
                name="start_date"
                value={form.start_date}
                onChange={handleInputChange}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">End Date</span>
              <input
                type="date"
                name="end_date"
                value={form.end_date}
                onChange={handleInputChange}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white"
              />
            </label>

            <label className="block md:col-span-1">
              <span className="mb-2 block text-sm font-medium text-slate-700">Status</span>
              <select
                name="status"
                value={form.status}
                onChange={handleInputChange}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white"
              >
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>
            </label>

            <div className="flex items-end md:col-span-1">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Submitting…' : 'Submit request'}
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-indigo-600 via-violet-600 to-sky-600 p-5 text-white shadow-[0_20px_45px_rgba(67,56,202,0.28)] md:p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-100">Overview</p>

          <div className="mt-5 flex flex-wrap gap-2">
            {[
              { id: 'all', label: 'All' },
              { id: 'on_time', label: 'On Time' },
              { id: 'overdue', label: 'Late Return' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setOverviewTab(tab.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  overviewTab === tab.id
                    ? 'bg-white text-indigo-700 shadow-md'
                    : 'bg-white/10 text-indigo-50 hover:bg-white/15'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-3">
            <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm text-indigo-100">On Time</span>
                <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-xs font-semibold text-emerald-50">{onTimeRequests.length}</span>
              </div>
            </div>
            <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm text-indigo-100">Overdue</span>
                <span className="rounded-full bg-red-400/20 px-2 py-0.5 text-xs font-semibold text-red-50">{overdueRequests.length}</span>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {overviewItems.slice(0, 3).map((item) => (
              <div key={item.id} className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{item.student_name}</p>
                    <p className="text-xs text-indigo-100">{item.class_name}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isOverdueRequest(item) ? 'bg-red-400/20 text-red-50' : 'bg-emerald-400/20 text-emerald-50'}`}>
                    {isOverdueRequest(item) ? 'Late Return' : 'On Time'}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-indigo-100">
                  <Clock3 size={12} />
                  {formatValue(item.expected_return_time || item.end_date)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_45px_rgba(15,23,42,0.04)] md:p-6">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Records</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Permission requests</h2>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search student or reason"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-400 focus:bg-white sm:w-64"
              />
            </div>
            <div className="relative">
              <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-8 text-sm outline-none transition focus:border-indigo-400 focus:bg-white"
              >
                <option value="All">All status</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Overdue">Overdue</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-2xl bg-slate-200" />
            ))}
          </div>
        ) : currentItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-slate-600">
            No permission requests match the current filters.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Student</th>
                    <th className="px-4 py-3 font-semibold">Class</th>
                    <th className="px-4 py-3 font-semibold">Reason</th>
                    <th className="px-4 py-3 font-semibold">Departure / Return</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {currentItems.map((request) => {
                    const isLate = isOverdueRequest(request);
                    return (
                      <tr key={request.id} className="align-top transition hover:bg-slate-50">
                        <td className="px-4 py-4">
                          <div className="font-semibold text-slate-900">{request.student_name}</div>
                        </td>
                        <td className="px-4 py-4">{request.class_name}</td>
                        <td className="px-4 py-4 max-w-sm text-slate-600">{request.reason}</td>
                        <td className="px-4 py-4">
                          <div>{formatValue(request.departure_time || request.start_date)}</div>
                          <div className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${isLate ? 'text-red-600' : 'text-slate-500'}`}>
                            <Clock3 size={12} />
                            {formatValue(request.expected_return_time || request.end_date)}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[request.status] || statusStyles.Pending}`}>
                            {request.status === 'Approved' && isLate ? 'Overdue' : request.status}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-2">
                            {request.status !== 'Approved' && (
                              <button
                                type="button"
                                onClick={() => updateStatus(request.id, 'Approved')}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
                              >
                                <Check size={12} />
                                Approve
                              </button>
                            )}
                            {request.status !== 'Rejected' && (
                              <button
                                type="button"
                                onClick={() => updateStatus(request.id, 'Rejected')}
                                className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-500"
                              >
                                <CircleX size={12} />
                                Reject
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
        )}

        <div className="mt-5 flex items-center justify-between gap-3 text-sm text-slate-600">
          <p>
            Showing {filteredRequests.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filteredRequests.length)} of {filteredRequests.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={16} />
              Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page === totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

export default Permissions;
