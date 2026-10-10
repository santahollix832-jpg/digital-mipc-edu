import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, CircleX, Filter, Search, X } from 'lucide-react';
import { apiFetch } from '../api/config';
import { useToast } from './ToastProvider';

const emptyForm = {
  student_name: '',
  class_name: '',
  reason: '',
  start_date: '',
  end_date: '',
  status: 'Pending',
};

const statusStyles = {
  Pending: 'bg-amber-100 text-amber-700 border border-amber-200',
  Approved: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  Rejected: 'bg-rose-100 text-rose-700 border border-rose-200',
};

const PAGE_SIZE = 6;

function Permissions() {
  const { notify } = useToast();
  const [requests, setRequests] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadRequests();
  }, []);

  async function loadRequests() {
    try {
      setLoading(true);
      const response = await apiFetch('/permissions');
      if (!response.ok) {
        throw new Error('Permissions request failed.');
      }
      const payload = await response.json();
      const items = Array.isArray(payload) ? payload : payload.data || [];
      setRequests(items.map((item) => ({
        id: item.id || item._id || `${item.student_name}-${item.start_date || item.created_at}`,
        student_name: item.student_name || item.studentName || 'Unknown student',
        class_name: item.class_name || item.className || 'Unassigned',
        reason: item.reason || 'No reason provided',
        start_date: item.start_date || item.startDate || '',
        end_date: item.end_date || item.endDate || '',
        status: item.status || 'Pending',
      })));
    } catch (error) {
      console.error(error);
      notify('Unable to load permission requests.', 'error');
    } finally {
      setLoading(false);
    }
  }

  const filteredRequests = useMemo(() => {
    const query = search.trim().toLowerCase();
    return requests.filter((request) => {
      const matchesStatus = statusFilter === 'All' || request.status === statusFilter;
      const matchesSearch = !query ||
        request.student_name.toLowerCase().includes(query) ||
        request.class_name.toLowerCase().includes(query) ||
        request.reason.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [requests, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / PAGE_SIZE));
  const currentItems = filteredRequests.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, search]);

  function handleInputChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.student_name || !form.class_name || !form.reason || !form.start_date || !form.end_date) {
      notify('Please complete all permission fields before submitting.', 'warning');
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
    <main className="p-6 md:p-10">
      <header className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">Permission center</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Leave management</h1>
        </div>
      </header>

      <section className="mb-8 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_45px_rgba(15,23,42,0.06)]">
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
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white"
              />
            </label>

            <label className="block md:col-span-1">
              <span className="mb-2 block text-sm font-medium text-slate-700">Class</span>
              <input
                name="class_name"
                value={form.class_name}
                onChange={handleInputChange}
                placeholder="S4A"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white"
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
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Start Date</span>
              <input
                type="date"
                name="start_date"
                value={form.start_date}
                onChange={handleInputChange}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">End Date</span>
              <input
                type="date"
                name="end_date"
                value={form.end_date}
                onChange={handleInputChange}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white"
              />
            </label>

            <label className="block md:col-span-1">
              <span className="mb-2 block text-sm font-medium text-slate-700">Status</span>
              <select
                name="status"
                value={form.status}
                onChange={handleInputChange}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white"
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

        <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-indigo-600 via-violet-600 to-sky-600 p-6 text-white shadow-[0_20px_45px_rgba(67,56,202,0.28)]">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-100">Overview</p>
          <h2 className="mt-3 text-3xl font-bold">{requests.filter((item) => item.status === 'Pending').length}</h2>
          <p className="mt-2 text-indigo-100">Pending requests awaiting review</p>

          <div className="mt-8 space-y-3">
            <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
              <p className="text-sm text-indigo-100">Approved</p>
              <p className="mt-1 text-xl font-semibold">{requests.filter((item) => item.status === 'Approved').length}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
              <p className="text-sm text-indigo-100">Rejected</p>
              <p className="mt-1 text-xl font-semibold">{requests.filter((item) => item.status === 'Rejected').length}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_45px_rgba(15,23,42,0.04)]">
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
                    <th className="px-4 py-3 font-semibold">Dates</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {currentItems.map((request) => (
                    <tr key={request.id} className="align-top transition hover:bg-slate-50">
                      <td className="px-4 py-4">
                        <div className="font-semibold text-slate-900">{request.student_name}</div>
                      </td>
                      <td className="px-4 py-4">{request.class_name}</td>
                      <td className="px-4 py-4 max-w-sm text-slate-600">{request.reason}</td>
                      <td className="px-4 py-4">
                        <div>{request.start_date || '—'}</div>
                        <div className="text-slate-500">to {request.end_date || '—'}</div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[request.status] || statusStyles.Pending}`}>
                          {request.status}
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
                  ))}
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
