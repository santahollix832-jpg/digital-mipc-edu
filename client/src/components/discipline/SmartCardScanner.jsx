import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Camera, KeyRound, Nfc, QrCode, RefreshCw, ScanLine } from 'lucide-react';
import { apiFetch } from '../../api/config';
import { cardClasses, formatDateTime } from './shared';

function ScanResultCard({ result }) {
  return (
    <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Scan verified</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{result.student.name}</p>
          <p className="text-sm text-slate-600">{result.student.class_name} · {result.student.reg_number}</p>
        </div>
        <div className="text-right">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${result.direction === 'IN' ? 'bg-sky-100 text-sky-800' : 'bg-indigo-100 text-indigo-800'}`}>
            {result.direction === 'IN' ? <ArrowDownToLine size={14} /> : <ArrowUpFromLine size={14} />}
            {result.direction} · {result.gate}
          </span>
          <p className="mt-1 text-xs text-slate-500">{formatDateTime(result.scanned_at)} · {result.scan_type.toUpperCase()} scan</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white bg-white/70 px-3 py-2">
          <p className="text-xs font-semibold text-slate-500">Point balance</p>
          <p className={`text-lg font-bold ${result.point_balance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {result.point_balance >= 0 ? '+' : ''}{result.point_balance}
          </p>
        </div>
        <div className="rounded-xl border border-white bg-white/70 px-3 py-2">
          <p className="text-xs font-semibold text-slate-500">Recent incidents</p>
          <p className="text-sm font-medium text-slate-800">{result.recent_incidents.length || 'None on file'}</p>
        </div>
        <div className="rounded-xl border border-white bg-white/70 px-3 py-2">
          <p className="text-xs font-semibold text-slate-500">Open corrective actions</p>
          <p className="text-sm font-medium text-slate-800">{result.open_actions.length || 'None'}</p>
        </div>
      </div>
      {result.open_actions.length > 0 && (
        <p className="mt-3 text-xs font-medium text-amber-800">
          ⚠ Disciplinary check: this student has open actions — {result.open_actions.map((a) => `${a.action_type} (${a.status})`).join(', ')}.
        </p>
      )}
    </div>
  );
}

function SmartCardScanner({ toast }) {
  const [scanValue, setScanValue] = useState('');
  const [scanType, setScanType] = useState('qr');
  const [direction, setDirection] = useState('IN');
  const [gate, setGate] = useState('Main Gate');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [scanError, setScanError] = useState('');
  const [recent, setRecent] = useState([]);
  const [cameraOn, setCameraOn] = useState(false);
  const inputRef = useRef(null);

  const loadRecent = useCallback(async () => {
    try {
      const response = await apiFetch('/api/discipline/scans');
      const payload = await response.json();
      if (response.ok && payload.success) setRecent(Array.isArray(payload.data) ? payload.data : []);
    } catch (err) {
      console.error('Failed to load recent scans:', err);
    }
  }, []);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  async function submitScan(e) {
    e.preventDefault();
    if (!scanValue.trim()) {
      setScanError('Enter or scan a card value first.');
      return;
    }
    setBusy(true);
    setScanError('');
    setResult(null);
    try {
      const response = await apiFetch('/api/discipline/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scan_value: scanValue.trim(), scan_type: scanType, direction, gate }),
      });
      const payload = await response.json();
      if (!response.ok || payload.success === false) throw new Error(payload.message || 'Scan failed.');
      setResult(payload);
      toast?.(`${payload.student.name} logged ${payload.direction} at ${payload.gate}.`);
      setScanValue('');
      inputRef.current?.focus();
      await loadRecent();
    } catch (err) {
      console.error('Scan failed:', err);
      setScanError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const scanModes = [
    { value: 'qr', label: 'QR Code', icon: QrCode },
    { value: 'nfc', label: 'NFC Card', icon: Nfc },
    { value: 'manual', label: 'Manual Entry', icon: KeyRound },
  ];

  return (
    <div className="space-y-6">
      <section className={cardClasses}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
            <ScanLine size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Smart Card Scanner</h2>
            <p className="text-sm text-slate-500">Scan a QR/NFC smartcard or type a registration number to log gate movement and run an instant disciplinary check.</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {scanModes.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => { setScanType(value); if (value !== 'manual') setCameraOn(value === 'qr'); }}
              className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${scanType === value
                  ? 'border-indigo-600 bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700'
                }`}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        {cameraOn && scanType === 'qr' && (
          <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-indigo-300 bg-indigo-50 px-4 py-6">
            <Camera size={32} className="text-indigo-500" />
            <p className="text-sm font-medium text-indigo-800">Camera scanner simulated — point the card at the reader or type its payload below.</p>
            <button type="button" onClick={() => setCameraOn(false)} className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700">
              Close scanner view
            </button>
          </div>
        )}

        <form onSubmit={submitScan} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Scan Value / Registration Number</label>
              <input
                ref={inputRef}
                type="text"
                autoFocus
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none"
                placeholder="e.g., SCH-2026-0001 or card payload…"
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Gate</label>
              <select
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                value={gate}
                onChange={(e) => setGate(e.target.value)}
              >
                {['Main Gate', 'Dormitory Gate', 'Classroom Block', 'Staff Gate'].map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              {['IN', 'OUT'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDirection(d)}
                  className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${direction === d ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-indigo-700'}`}
                >
                  {d === 'IN' ? 'Entry (IN)' : 'Exit (OUT)'}
                </button>
              ))}
            </div>
            <button
              type="submit"
              disabled={busy}
              className="ml-auto inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ScanLine size={16} />
              {busy ? 'Processing…' : 'Log Scan'}
            </button>
          </div>
          {scanError && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{scanError}</p>
          )}
        </form>

        {result && <ScanResultCard result={result} />}
      </section>

      <section className={cardClasses}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Recent Gate Movements</h2>
          <button type="button" onClick={loadRecent} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-3 text-left font-semibold">Student</th>
                <th className="px-4 py-3 text-left font-semibold">Class</th>
                <th className="px-4 py-3 text-left font-semibold">Direction</th>
                <th className="px-4 py-3 text-left font-semibold">Gate</th>
                <th className="px-4 py-3 text-left font-semibold">Method</th>
                <th className="px-4 py-3 text-left font-semibold">Time</th>
                <th className="px-4 py-3 text-left font-semibold">Scanned By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recent.length === 0 ? (
                <tr><td colSpan="7" className="px-4 py-6 text-center text-slate-500">No scans logged yet.</td></tr>
              ) : (
                recent.map((scan) => (
                  <tr key={scan.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{scan.student_name}</td>
                    <td className="px-4 py-3 text-slate-600">{scan.class_name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${scan.direction === 'IN' ? 'bg-sky-100 text-sky-800' : 'bg-indigo-100 text-indigo-800'}`}>
                        {scan.direction === 'IN' ? <ArrowDownToLine size={12} /> : <ArrowUpFromLine size={12} />}
                        {scan.direction}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{scan.gate}</td>
                    <td className="px-4 py-3 text-xs font-semibold uppercase text-slate-500">{scan.scan_type}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDateTime(scan.scanned_at)}</td>
                    <td className="px-4 py-3 text-slate-600">{scan.scanned_by || '—'}</td>
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

export default SmartCardScanner;
