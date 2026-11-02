import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/config';

// Shared hook: loads the student directory once for discipline sub-modules.
export function useStudents() {
  const [students, setStudents] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await apiFetch('/api/students');
        if (!response.ok) throw new Error(`Student list request failed (${response.status})`);
        const records = await response.json();
        if (!Array.isArray(records)) throw new Error('Student list response was not a valid list.');
        if (active) setStudents(records);
      } catch (err) {
        console.error('Failed to load students:', err);
        if (active) setError('Unable to load students. Please try again later.');
      }
    })();
    return () => { active = false; };
  }, []);

  return { students, studentError: error };
}

export const inputClasses = "w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none";
export const labelClasses = "block text-sm font-semibold text-slate-700 mb-1.5";
export const cardClasses = "rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_45px_rgba(15,23,42,0.04)]";

export const statusBadge = {
  Pending: 'bg-amber-100 text-amber-700 border-amber-200',
  Approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Rejected: 'bg-rose-100 text-rose-700 border-rose-200',
  Returned: 'bg-sky-100 text-sky-700 border-sky-200',
  Overdue: 'bg-rose-100 text-rose-700 border-rose-200',
  'In Progress': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  Completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-100 text-rose-700 border-rose-200',
};

export function Badge({ value }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadge[value] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {value || '—'}
    </span>
  );
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}
