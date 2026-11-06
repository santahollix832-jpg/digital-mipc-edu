import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck, Banknote, Building2, CalendarDays, CircleDollarSign, Download, History, Loader2,
  PencilLine, Percent, Plus, Printer, Receipt, RefreshCw, Search, Users, Wallet, X,
} from 'lucide-react';
import { apiFetch, safeJsonResponse } from '../api/config';
import { useToast } from './ToastProvider';

// ── School Fees Management ────────────────────────────────────────────────────
// Access: ADMIN and BURSAR only (route is also role-gated in App.jsx and the
// API layer in server.js, so this component can assume both roles).

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Mobile Money', 'Cheque', 'Card'];

const fmtRWF = (value) =>
  `RWF ${Number(value || 0).toLocaleString('en-RW', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const STATUS_META = {
  COMPLETED: { label: 'Fully Paid', chip: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30', dot: 'bg-emerald-400' },
  PARTIALLY_PAID: { label: 'Partial', chip: 'bg-amber-500/15 text-amber-300 ring-amber-400/30', dot: 'bg-amber-400' },
  UNPAID: { label: 'Unpaid', chip: 'bg-rose-500/15 text-rose-300 ring-rose-400/30', dot: 'bg-rose-400' },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.UNPAID;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${meta.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function Modal({ title, icon: Icon, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close dialog" onClick={onClose} className="absolute inset-0 cursor-default bg-slate-950/70 backdrop-blur-sm animate-in" />
      <div className={`relative max-h-[90vh] w-full overflow-y-auto rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-indigo-950/50 animate-fade-up ${wide ? 'max-w-2xl' : 'max-w-lg'}`}>
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
                <Icon size={20} />
              </div>
            )}
            <h2 className="text-lg font-bold text-white">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/10 hover:text-white">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-indigo-400/60 focus:bg-white/10';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:from-indigo-500 hover:to-indigo-400 disabled:cursor-not-allowed disabled:opacity-50';
const ghostButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-50';

/* ────────────────────────── Payment modal + receipt ────────────────────────── */

function PaymentModal({ student, onClose, onRecorded }) {
  const { notify } = useToast();
  const [form, setForm] = useState({ amount: '', payment_method: 'Cash', reference_no: '', payment_date: new Date().toISOString().slice(0, 10) });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);

  const remaining = Math.max((student?.balance ?? 0), 0);

  async function submit(e) {
    e.preventDefault();
    setError('');
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a payment amount greater than zero.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await apiFetch('/fees/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: student.student_id,
          amount_paid: amount,
          payment_method: form.payment_method,
          reference_no: form.reference_no || null,
          payment_date: form.payment_date,
        }),
      });
      const payload = await safeJsonResponse(response) || {};
      if (!response.ok || payload.success === false) throw new Error(payload.error || 'Failed to record the payment.');
      setReceipt(payload.receipt);
      onRecorded();
      notify(`Payment recorded for ${student.student_name}.`, 'success');
    } catch (err) {
      setError(err.message || 'Failed to record the payment.');
    } finally {
      setSubmitting(false);
    }
  }

  function printReceipt() {
    window.print();
  }

  return (
    <Modal title={receipt ? 'Payment Receipt' : `Record Payment — ${student.student_name}`} icon={receipt ? Receipt : Banknote} onClose={onClose} wide={Boolean(receipt)}>
      {receipt ? (
        <div>
          <div id="fee-receipt-print" className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm">
            <div className="mb-4 flex items-start justify-between border-b border-white/10 pb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-indigo-300">Digital MIPC EDU</p>
                <p className="text-lg font-bold text-white">Official Fee Receipt</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-bold text-emerald-300">{receipt.receipt_no}</p>
                <p className="text-xs text-slate-400">{receipt.payment_date}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <div><p className="text-xs text-slate-400">Student</p><p className="font-semibold text-white">{receipt.student_name}</p></div>
              <div><p className="text-xs text-slate-400">Reg Number</p><p className="font-semibold text-white">{receipt.reg_number || '—'}</p></div>
              <div><p className="text-xs text-slate-400">Class</p><p className="font-semibold text-white">{receipt.class}</p></div>
              <div><p className="text-xs text-slate-400">Payment Method</p><p className="font-semibold text-white">{receipt.payment_method}</p></div>
              {receipt.reference_no && (
                <div><p className="text-xs text-slate-400">Reference</p><p className="font-semibold text-white">{receipt.reference_no}</p></div>
              )}
              <div><p className="text-xs text-slate-400">Recorded By</p><p className="font-semibold text-white">{receipt.recorded_by}</p></div>
            </div>
            <div className="mt-5 space-y-2 rounded-xl bg-slate-950/40 p-4">
              <div className="flex justify-between text-slate-300"><span>Amount paid</span><span className="font-bold text-emerald-300">{fmtRWF(receipt.amount_paid)}</span></div>
              <div className="flex justify-between text-slate-300"><span>Total required</span><span>{fmtRWF(receipt.total_required)}</span></div>
              <div className="flex justify-between text-slate-300"><span>Total paid to date</span><span>{fmtRWF(receipt.total_paid)}</span></div>
              <div className="flex justify-between border-t border-white/10 pt-2 text-white"><span>Balance due</span><span className="font-bold">{fmtRWF(receipt.balance)}</span></div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-400">Status</span>
                <StatusBadge status={receipt.status} />
              </div>
            </div>
          </div>
          <div className="mt-5 flex gap-3 no-print">
            <button type="button" onClick={printReceipt} className={`${ghostButtonClass} flex-1 no-print`}>
              <Printer size={16} /> Print Receipt
            </button>
            <button type="button" onClick={onClose} className={`${primaryButtonClass} flex-1`}>Done</button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
            <p className="font-semibold text-white">{student.student_name}</p>
            <p className="text-xs text-slate-400">{student.class} · {student.reg_number || 'No reg number'}</p>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center text-xs">
              <div><p className="text-slate-400">Required</p><p className="font-bold text-white">{fmtRWF(student.total_required)}</p></div>
              <div><p className="text-slate-400">Paid</p><p className="font-bold text-emerald-300">{fmtRWF(student.total_paid)}</p></div>
              <div><p className="text-slate-400">Balance</p><p className="font-bold text-amber-300">{fmtRWF(remaining)}</p></div>
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="fee-amount">Amount Paid (RWF)</label>
            <input id="fee-amount" type="number" min="1" step="1" required value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder={String(remaining || '')} className={inputClass} />
            {remaining > 0 && (
              <button type="button" onClick={() => setForm((f) => ({ ...f, amount: String(remaining) }))}
                className="mt-1.5 text-xs font-semibold text-indigo-300 hover:text-indigo-200">
                Pay full balance ({fmtRWF(remaining)})
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="fee-method">Payment Method</label>
              <select id="fee-method" value={form.payment_method}
                onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))} className={inputClass}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m} className="bg-slate-900">{m}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="fee-date">Payment Date</label>
              <input id="fee-date" type="date" value={form.payment_date} required
                onChange={(e) => setForm((f) => ({ ...f, payment_date: e.target.value }))} className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="fee-ref">Reference No. (optional)</label>
            <input id="fee-ref" type="text" value={form.reference_no}
              onChange={(e) => setForm((f) => ({ ...f, reference_no: e.target.value }))}
              placeholder="Bank slip / MoMo txn id" className={inputClass} />
          </div>
          {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200" role="alert">{error}</p>}
          <button type="submit" disabled={submitting} className={`${primaryButtonClass} w-full`}>
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Receipt size={16} />}
            {submitting ? 'Recording…' : 'Record Payment & Generate Receipt'}
          </button>
        </form>
      )}
    </Modal>
  );
}

/* ──────────────────── Edit payment modal ─────────────────────────── */

function EditPaymentModal({ payment, onClose, onSaved }) {
  const { notify } = useToast();
  const [form, setForm] = useState({
    amount_paid: String(payment.amount_paid ?? ''),
    payment_method: payment.payment_method || 'Cash',
    reference_no: payment.reference_no || '',
    payment_date: (payment.payment_date || new Date().toISOString().slice(0, 10)).slice(0, 10),
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    const amount = Number(form.amount_paid);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a payment amount greater than zero.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await apiFetch(`/fees/payments/${payment.payment_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_paid: amount,
          payment_method: form.payment_method,
          reference_no: form.reference_no || null,
          payment_date: form.payment_date,
        }),
      });
      const payload = await safeJsonResponse(response) || {};
      if (!response.ok || payload.success === false) throw new Error(payload.error || 'Failed to update the payment.');
      notify(`Payment ${payload.payment?.receipt_no || ''} updated — balance recalculated.`, 'success');
      onSaved(payload.ledger);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update the payment.');
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Edit Payment — ${payment.receipt_no}`} icon={PencilLine} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="edit-amount">Amount Paid (RWF)</label>
          <input id="edit-amount" type="number" min="1" step="1" required value={form.amount_paid}
            onChange={(e) => setForm((f) => ({ ...f, amount_paid: e.target.value }))} className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="edit-method">Payment Method</label>
            <select id="edit-method" value={form.payment_method}
              onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))} className={inputClass}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m} className="bg-slate-900">{m}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="edit-date">Payment Date</label>
            <input id="edit-date" type="date" required value={form.payment_date}
              onChange={(e) => setForm((f) => ({ ...f, payment_date: e.target.value }))} className={inputClass} />
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="edit-ref">Reference No.</label>
          <input id="edit-ref" type="text" value={form.reference_no}
            onChange={(e) => setForm((f) => ({ ...f, reference_no: e.target.value }))}
            placeholder="Bank slip / MoMo txn id" className={inputClass} />
        </div>
        {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200" role="alert">{error}</p>}
        <button type="submit" disabled={submitting} className={`${primaryButtonClass} w-full`}>
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <BadgeCheck size={16} />}
          {submitting ? 'Saving…' : 'Save Changes & Recalculate'}
        </button>
      </form>
    </Modal>
  );
}

/* ──────────────────── Payment history modal ─────────────────────── */

function PaymentHistoryModal({ student, onEdit, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await apiFetch(`/fees/payments/${student.student_id}`);
        const payload = await safeJsonResponse(response) || {};
        if (!response.ok || payload.success === false) throw new Error(payload.error || 'Failed to load payment history.');
        if (!cancelled) setPayments(payload.payments || []);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load payment history.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [student.student_id]);

  return (
    <Modal title={`Payment History — ${student.student_name}`} icon={History} onClose={onClose} wide>
      {loading ? (
        <div className="flex items-center justify-center gap-3 py-12 text-slate-400">
          <Loader2 size={18} className="animate-spin" /> Loading history…
        </div>
      ) : error ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200" role="alert">{error}</p>
      ) : !payments.length ? (
        <div className="py-10 text-center text-slate-400">
          <Receipt size={28} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm font-semibold text-slate-300">No payments recorded yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2 font-semibold">Receipt</th>
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 text-right font-semibold">Amount</th>
                <th className="px-3 py-2 font-semibold">Method</th>
                <th className="px-3 py-2 font-semibold">Reference</th>
                <th className="px-3 py-2 font-semibold">Recorded By</th>
                <th className="px-3 py-2 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {payments.map((p) => (
                <tr key={p.payment_id ?? p.id} className="transition hover:bg-white/[0.04]">
                  <td className="px-3 py-2.5 font-mono text-xs font-semibold text-emerald-300">{p.receipt_no}</td>
                  <td className="px-3 py-2.5 text-slate-300">{p.payment_date ? String(p.payment_date).slice(0, 10) : '—'}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-white">{fmtRWF(p.amount_paid)}</td>
                  <td className="px-3 py-2.5 text-slate-300">{p.payment_method}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-400">{p.reference_no || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-400">{p.recorded_by || '—'}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button type="button" onClick={() => onEdit(p)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10">
                      <PencilLine size={13} /> Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/* ────────────────────────── Bulk assign modal ──────────────────────────────── */

function BulkAssignModal({ classes, structures, onClose, onAssigned }) {
  const { notify } = useToast();
  const [form, setForm] = useState({ class_name: (classes.find((c) => (c.student_count || 0) > 0)?.class_name) || classes[0]?.class_name || '', fee_structure_id: '', discount_amount: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const selectedStructure = structures.find((s) => String(s.id) === String(form.fee_structure_id));

  // Live recount: the currently selected class's student count, re-derived from
  // the classes list every time the class_name selection changes.
  const selectedClass = classes.find((c) => String(c.class_name).trim().toLowerCase() === String(form.class_name).trim().toLowerCase());
  const selectedClassCount = selectedClass?.student_count ?? 0;

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.class_name || !form.fee_structure_id) {
      setError('Select both a class and a fee structure.');
      return;
    }
    if (!selectedClassCount) {
      setError(`No students found in ${form.class_name}. Select a class with enrolled students.`);
      return;
    }
    setSubmitting(true);
    try {
      const response = await apiFetch('/fees/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_name: form.class_name,
          fee_structure_id: Number(form.fee_structure_id),
          discount_amount: Number(form.discount_amount) || 0,
        }),
      });
      const payload = await safeJsonResponse(response) || {};
      if (!response.ok || payload.success === false) throw new Error(payload.error || 'Failed to assign fees.');
      notify(`Fee structure assigned to ${payload.assigned} student(s) in ${payload.class_name}.`, 'success');
      onAssigned();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to assign fees.');
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Bulk Assign Fees per Class" icon={Users} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-400">
          Applies the selected fee structure to <span className="font-semibold text-white">every student</span> in the
          chosen class. Existing accounts for the same structure are updated.
        </p>
        <div>
          <label className={labelClass} htmlFor="assign-class">Class</label>
          <select id="assign-class" value={form.class_name}
            onChange={(e) => setForm((f) => ({ ...f, class_name: e.target.value }))} className={inputClass}>
            <option value="" disabled className="bg-slate-900">Select a class…</option>
            {classes.map((c) => <option key={c.class_name} value={c.class_name} className="bg-slate-900">{c.class_name} ({c.student_count} students)</option>)}
          </select>
          {form.class_name && (
            <p className="mt-1.5 text-xs text-indigo-300">
              {selectedClassCount > 0
                ? `${selectedClassCount} student${selectedClassCount === 1 ? '' : 's'} will receive this fee in ${selectedClass?.class_name || form.class_name}.`
                : `No students found in ${form.class_name} — pick another class or enrol students first.`}
            </p>
          )}
        </div>
        <div>
          <label className={labelClass} htmlFor="assign-structure">Fee Structure</label>
          <select id="assign-structure" value={form.fee_structure_id}
            onChange={(e) => setForm((f) => ({ ...f, fee_structure_id: e.target.value }))} className={inputClass}>
            <option value="" className="bg-slate-900">Select a fee structure…</option>
            {structures.map((s) => (
              <option key={s.id} value={s.id} className="bg-slate-900">
                {s.class_name} · {s.academic_year} · {s.term} — {fmtRWF(s.total_amount)}
              </option>
            ))}
          </select>
          {selectedStructure && (
            <p className="mt-1.5 text-xs text-indigo-300">Structure total: {fmtRWF(selectedStructure.total_amount)}</p>
          )}
        </div>
        <div>
          <label className={labelClass} htmlFor="assign-discount">Discount per Student (optional, RWF)</label>
          <input id="assign-discount" type="number" min="0" step="1" value={form.discount_amount}
            onChange={(e) => setForm((f) => ({ ...f, discount_amount: e.target.value }))} placeholder="0" className={inputClass} />
        </div>
        {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200" role="alert">{error}</p>}
        <button type="submit" disabled={submitting} className={`${primaryButtonClass} w-full`}>
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {submitting ? 'Assigning…' : 'Assign to Class'}
        </button>
      </form>
    </Modal>
  );
}

/* ────────────────────────── New structure modal ────────────────────────────── */

function StructureModal({ classes, onClose, onSaved }) {
  const { notify } = useToast();
  const [form, setForm] = useState({ class_name: classes[0]?.class_name || '', academic_year: String(new Date().getFullYear()), term: 'Term 1', total_amount: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    const amount = Number(form.total_amount);
    if (!form.class_name) { setError('Choose a class.'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a valid total amount.'); return; }
    setSubmitting(true);
    try {
      const response = await apiFetch('/fees/structures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, total_amount: amount }),
      });
      const payload = await safeJsonResponse(response) || {};
      if (!response.ok || payload.success === false) throw new Error(payload.error || 'Failed to save the fee structure.');
      notify(`Fee structure saved for ${form.class_name} — ${form.academic_year} ${form.term}.`, 'success');
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save the fee structure.');
      setSubmitting(false);
    }
  }

  return (
    <Modal title="New / Update Fee Structure" icon={CircleDollarSign} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="fs-class">Class</label>
          <select id="fs-class" value={form.class_name}
            onChange={(e) => setForm((f) => ({ ...f, class_name: e.target.value }))} className={inputClass}>
            {classes.map((c) => <option key={c.class_name} value={c.class_name} className="bg-slate-900">{c.class_name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="fs-year">Academic Year</label>
            <input id="fs-year" type="text" value={form.academic_year} required
              onChange={(e) => setForm((f) => ({ ...f, academic_year: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="fs-term">Term</label>
            <select id="fs-term" value={form.term}
              onChange={(e) => setForm((f) => ({ ...f, term: e.target.value }))} className={inputClass}>
              {['Term 1', 'Term 2', 'Term 3'].map((t) => <option key={t} value={t} className="bg-slate-900">{t}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="fs-amount">Total Amount (RWF)</label>
          <input id="fs-amount" type="number" min="1" step="1" required value={form.total_amount}
            onChange={(e) => setForm((f) => ({ ...f, total_amount: e.target.value }))} placeholder="e.g. 250000" className={inputClass} />
        </div>
        {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200" role="alert">{error}</p>}
        <button type="submit" disabled={submitting} className={`${primaryButtonClass} w-full`}>
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <BadgeCheck size={16} />}
          {submitting ? 'Saving…' : 'Save Fee Structure'}
        </button>
      </form>
    </Modal>
  );
}

/* ────────────────────────── Main dashboard ─────────────────────────────────── */

export default function SchoolFees() {
  const { notify } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState(null);
  const [structures, setStructures] = useState([]);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [expanded, setExpanded] = useState({});
  const [payFor, setPayFor] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const [editPayment, setEditPayment] = useState(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [structureOpen, setStructureOpen] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      const response = await apiFetch(`/fees/overview${params.toString() ? `?${params}` : ''}`);
      const payload = await safeJsonResponse(response) || {};
      if (!response.ok || payload.success === false) throw new Error(payload.error || 'Failed to load fees data.');
      setOverview(payload);
    } catch (err) {
      setError(err.message || 'Failed to load fees data.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  const loadStructures = useCallback(async () => {
    try {
      const response = await apiFetch('/fees/structures');
      const payload = await safeJsonResponse(response) || {};
      if (response.ok && payload.success !== false) setStructures(payload.structures || []);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadStructures(); }, [loadStructures]);

  // Debounced re-query when the search term changes.
  useEffect(() => {
    const t = setTimeout(() => load(true), 350);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const classes = overview?.classes || [];

  const visibleClasses = useMemo(() => {
    if (classFilter === 'All' && statusFilter === 'All') return classes;
    return classes
      .map((c) => {
        let students = c.students;
        if (classFilter !== 'All' && c.class_name !== classFilter) return null;
        if (statusFilter !== 'All') students = students.filter((s) => s.status === statusFilter);
        if (!students.length) return null;
        const total_required = students.reduce((a, s) => a + s.total_required, 0);
        const total_paid = students.reduce((a, s) => a + s.total_paid, 0);
        return {
          ...c,
          students,
          total_required,
          total_paid,
          balance: Math.max(total_required - total_paid, 0),
          student_count: students.length,
          collection_rate: total_required > 0 ? Math.round((total_paid / total_required) * 100) : 0,
        };
      })
      .filter(Boolean);
  }, [classes, classFilter, statusFilter]);

  const totals = overview?.totals || { total_required: 0, total_paid: 0, balance: 0, student_count: 0 };
  const classOptions = ['All', ...classes.map((c) => c.class_name)];

  function exportCsv() {
    const rows = [['Student', 'Reg Number', 'Class', 'Total Required', 'Total Paid', 'Balance', 'Status']];
    for (const c of visibleClasses) {
      for (const s of c.students) {
        rows.push([s.student_name, s.reg_number || '', s.class, s.total_required, s.total_paid, s.balance, s.status]);
      }
    }
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fees-overview-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Fees overview exported as CSV.', 'success');
  }

  return (
    <main className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">School Fees</h1>
          <p className="mt-1 text-sm text-slate-400">Fee structures, collections and balances — grouped by class.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { load(); loadStructures(); }} className={ghostButtonClass} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button type="button" onClick={exportCsv} className={ghostButtonClass} disabled={!visibleClasses.length}>
            <Download size={16} /> Export CSV
          </button>
          <button type="button" onClick={() => setStructureOpen(true)} className={ghostButtonClass}>
            <CircleDollarSign size={16} /> New Fee Structure
          </button>
          <button type="button" onClick={() => setAssignOpen(true)} disabled={!classes.length} className={primaryButtonClass}>
            <Users size={16} /> Bulk Assign Fees
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Total Required', value: totals.total_required, icon: CircleDollarSign, tone: 'from-indigo-500/20 to-indigo-500/5 text-indigo-300' },
          { label: 'Total Collected', value: totals.total_paid, icon: Wallet, tone: 'from-emerald-500/20 to-emerald-500/5 text-emerald-300' },
          { label: 'Balance Due', value: totals.balance, icon: Banknote, tone: 'from-amber-500/20 to-amber-500/5 text-amber-300' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className={`rounded-2xl border border-white/10 bg-gradient-to-br p-5 ${tone}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider">{label}</p>
              <Icon size={18} />
            </div>
            <p className="mt-2 text-xl font-bold text-white md:text-2xl">{fmtRWF(value)}</p>
          </div>
        ))}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-sky-500/20 to-sky-500/5 p-5 text-sky-300">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider">Students</p>
            <Users size={18} />
          </div>
          <p className="mt-2 text-xl font-bold text-white md:text-2xl">{totals.student_count}</p>
          {totals.total_required > 0 && (
            <p className="mt-1 text-xs text-slate-400">
              {Math.round((totals.total_paid / totals.total_required) * 100)}% collection rate
            </p>
          )}
        </div>
      </div>

      {/* Search + filters */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by student name or reg number…"
            aria-label="Search students"
            className={`${inputClass} pl-10`} />
        </div>
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} aria-label="Filter by class" className={`${inputClass} w-auto`}>
          {classOptions.map((c) => <option key={c} value={c} className="bg-slate-900">{c === 'All' ? 'All Classes' : c}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by payment status" className={`${inputClass} w-auto`}>
          <option value="All" className="bg-slate-900">All Statuses</option>
          <option value="COMPLETED" className="bg-slate-900">Fully Paid</option>
          <option value="PARTIALLY_PAID" className="bg-slate-900">Partial</option>
          <option value="UNPAID" className="bg-slate-900">Unpaid</option>
        </select>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center gap-3 rounded-3xl border border-white/10 bg-white/5 p-16 text-slate-400">
          <Loader2 size={20} className="animate-spin" /> Loading fees overview…
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-8 text-center">
          <p className="font-semibold text-rose-200">{error}</p>
          <button type="button" onClick={() => load()} className={`${primaryButtonClass} mt-4`}>
            <RefreshCw size={16} /> Try Again
          </button>
        </div>
      ) : !visibleClasses.length ? (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-16 text-center text-slate-400">
          <Wallet size={32} className="mx-auto mb-3 opacity-40" />
          <p className="font-semibold text-slate-300">No students match the current filters.</p>
          <p className="mt-1 text-sm">Create a fee structure and assign it to a class to get started.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {visibleClasses.map((c) => (
            <section key={c.class_name} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
              {/* Class header */}
              <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-white/[0.03] px-5 py-4">
                <button type="button" onClick={() => setExpanded((e) => ({ ...e, [c.class_name]: !e[c.class_name] }))}
                  className="flex items-center gap-3 text-left" aria-expanded={Boolean(expanded[c.class_name])}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
                    <Building2 size={18} />
                  </div>
                  <div>
                    <p className="font-bold text-white">{c.class_name}</p>
                    <p className="text-xs text-slate-400">{c.student_count} student{c.student_count === 1 ? '' : 's'} · {c.collection_rate}% collected</p>
                  </div>
                </button>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <div className="text-right"><p className="text-[10px] uppercase tracking-wider text-slate-400">Required</p><p className="font-bold text-white">{fmtRWF(c.total_required)}</p></div>
                  <div className="text-right"><p className="text-[10px] uppercase tracking-wider text-slate-400">Paid</p><p className="font-bold text-emerald-300">{fmtRWF(c.total_paid)}</p></div>
                  <div className="text-right"><p className="text-[10px] uppercase tracking-wider text-slate-400">Balance</p><p className="font-bold text-amber-300">{fmtRWF(c.balance)}</p></div>
                  <button type="button" onClick={() => setAssignOpen(true)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10">
                    <Plus size={14} className="mr-1 inline" /> Assign Fee
                  </button>
                </div>
              </header>
              {/* Student table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
                      <th className="px-5 py-3 font-semibold">Student</th>
                      <th className="px-5 py-3 font-semibold">Reg Number</th>
                      <th className="px-5 py-3 text-right font-semibold">Required</th>
                      <th className="px-5 py-3 text-right font-semibold">Paid</th>
                      <th className="px-5 py-3 text-right font-semibold">Balance</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {(expanded[c.class_name] ? c.students : c.students.slice(0, 5)).map((s) => (
                      <tr key={s.student_id} className="transition hover:bg-white/[0.04]">
                        <td className="px-5 py-3 font-medium text-white">{s.student_name}</td>
                        <td className="px-5 py-3 font-mono text-xs text-slate-400">{s.reg_number || '—'}</td>
                        <td className="px-5 py-3 text-right text-slate-300">{fmtRWF(s.total_required)}</td>
                        <td className="px-5 py-3 text-right font-semibold text-emerald-300">{fmtRWF(s.total_paid)}</td>
                        <td className="px-5 py-3 text-right font-semibold text-amber-300">{fmtRWF(s.balance)}</td>
                        <td className="px-5 py-3"><StatusBadge status={s.status} /></td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button type="button" onClick={() => setHistoryFor(s)}
                              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                              title="View & edit payment history">
                              <History size={13} />
                            </button>
                            <button type="button" onClick={() => setPayFor(s)}
                              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 transition hover:bg-indigo-500">
                              Record Payment
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {c.students.length > 5 && (
                <button type="button" onClick={() => setExpanded((e) => ({ ...e, [c.class_name]: !e[c.class_name] }))}
                  className="w-full border-t border-white/10 py-2.5 text-xs font-semibold text-indigo-300 transition hover:bg-white/5 hover:text-indigo-200">
                  {expanded[c.class_name] ? 'Show fewer' : `Show all ${c.students.length} students`}
                </button>
              )}
            </section>
          ))}
        </div>
      )}

      {/* Modals */}
      {payFor && (
        <PaymentModal
          student={payFor}
          onClose={() => setPayFor(null)}
          onRecorded={() => { load(true); }}
        />
      )}
      {historyFor && !editPayment && (
        <PaymentHistoryModal
          student={historyFor}
          onEdit={(p) => setEditPayment(p)}
          onClose={() => setHistoryFor(null)}
        />
      )}
      {editPayment && (
        <EditPaymentModal
          payment={editPayment}
          onClose={() => setEditPayment(null)}
          onSaved={() => { load(true); }}
        />
      )}
      {assignOpen && (
        <BulkAssignModal
          classes={classes}
          structures={structures}
          onClose={() => setAssignOpen(false)}
          onAssigned={() => { load(true); loadStructures(); }}
        />
      )}
      {structureOpen && (
        <StructureModal
          classes={classes}
          onClose={() => setStructureOpen(false)}
          onSaved={() => { load(true); loadStructures(); }}
        />
      )}
    </main>
  );
}
