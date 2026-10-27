import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, CheckCircle2, Download, Printer, QrCode, ScanLine, Users, X } from 'lucide-react';
import { apiFetch } from '../api/config';
import { useToast } from './ToastProvider';

const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const statuses = ['present', 'late', 'absent', 'permission'];
const statusLabels = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  permission: 'On Permission',
  unmarked: 'Not Marked',
};
const statusStyles = {
  present: 'border-emerald-200 bg-emerald-100 text-emerald-700',
  late: 'border-amber-200 bg-amber-100 text-amber-700',
  absent: 'border-rose-200 bg-rose-100 text-rose-700',
  permission: 'border-sky-200 bg-sky-100 text-sky-700',
  unmarked: 'border-slate-200 bg-slate-100 text-slate-600',
};
const statCards = [
  { key: 'present', label: 'Present', color: 'emerald' },
  { key: 'absent', label: 'Absent', color: 'rose' },
  { key: 'late', label: 'Late', color: 'amber' },
  { key: 'permission', label: 'On Permission', color: 'sky' },
];

function percent(count, total) {
  return total ? Math.round((count / total) * 100) : 0;
}

function Attendance() {
  const { notify } = useToast();
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedClass, setSelectedClass] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [classes, setClasses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [classesError, setClassesError] = useState('');
  const [saving, setSaving] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanValue, setScanValue] = useState('');
  const [scanMessage, setScanMessage] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [draft, setDraft] = useState({});
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const cameraFrameRef = useRef(null);
  const nfcAbortControllerRef = useRef(null);
  const scannerActiveRef = useRef(false);
  const scanBusyRef = useRef(false);
  const recentScansRef = useRef(new Map());

  useEffect(() => {
    loadClasses();
  }, []);

  useEffect(() => {
    loadSummary();
  }, [selectedDate]);

  useEffect(() => {
    if (!scanOpen) stopCameraScanner();
    return () => stopCameraScanner();
  }, [scanOpen]);

  async function loadClasses() {
    try {
      const response = await apiFetch('/attendance/classes');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load classes.');
      setClasses(payload.classes || []);
      setClassesError('');
    } catch (error) {
      console.error('Attendance class load failed:', error);
      setClassesError(error.message || 'Unable to load classes.');
    }
  }

  async function loadSummary() {
    setLoading(true);
    try {
      const response = await apiFetch(`/attendance/summary?date=${encodeURIComponent(selectedDate)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load attendance.');
      setSummary({
        date: payload.date || selectedDate,
        statistics: {
          total_enrolled: Number(payload.statistics?.total_enrolled ?? payload.statistics?.total_students ?? 0),
          present: Number(payload.statistics?.present || 0),
          absent: Number(payload.statistics?.absent || 0),
          late: Number(payload.statistics?.late || 0),
          permission: Number(payload.statistics?.permission || 0),
          unmarked: Number(payload.statistics?.unmarked || 0),
        },
        weekly: {
          present: Number(payload.weekly?.present || 0),
          absent: Number(payload.weekly?.absent || 0),
          late: Number(payload.weekly?.late || 0),
          permission: Number(payload.weekly?.permission || 0),
        },
        classes: Array.isArray(payload.classes) ? payload.classes : [],
        details: Array.isArray(payload.details) ? payload.details : [],
        attendance_started: Boolean(payload.attendance_started),
      });
      setLoadError('');
    } catch (error) {
      console.error('Attendance summary load failed:', error);
      setSummary(null);
      setLoadError(error.message || 'Unable to load attendance.');
    } finally {
      setLoading(false);
    }
  }

  const stats = summary?.statistics || {
    total_enrolled: 0,
    present: 0,
    absent: 0,
    late: 0,
    permission: 0,
    unmarked: 0,
  };
  const canScanLive = selectedDate === today;

  const classRows = useMemo(() => {
    return (summary?.classes || []).filter((row) => {
      const classMatches = selectedClass === 'All' || row.class_name === selectedClass;
      const statusMatches = selectedStatus === 'All' || row[selectedStatus] > 0;
      return classMatches && statusMatches;
    });
  }, [summary, selectedClass, selectedStatus]);

  const filteredStudents = useMemo(() => {
    return (summary?.details || []).filter((student) => {
      const classMatches = selectedClass === 'All' || student.class_name === selectedClass;
      const statusMatches = selectedStatus === 'All' || student.status === selectedStatus;
      return classMatches && statusMatches;
    });
  }, [summary, selectedClass, selectedStatus]);

  function openTakeAttendance() {
    setDraft(Object.fromEntries(
      (summary?.details || []).map((student) => [
        student.id,
        student.status === 'unmarked' ? '' : student.status,
      ])
    ));
    setScanOpen(true);
  }

  async function saveAttendance() {
    const records = Object.entries(draft).filter(([, status]) => statuses.includes(status)).map(([studentId, status]) => ({
      student_id: Number(studentId),
      status,
    }));
    if (!records.length) {
      notify('There are no students to mark for this date.', 'warning');
      return;
    }

    setSaving(true);
    try {
      const response = await apiFetch('/attendance/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, records }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to save attendance.');
      setSummary(payload.summary);
      setScanOpen(false);
      notify(`Attendance saved for ${payload.saved_count} students.`, 'success');
    } catch (error) {
      console.error('Attendance save failed:', error);
      notify(error.message || 'Unable to save attendance.', 'error');
    } finally {
      setSaving(false);
    }
  }

  function stopCameraScanner() {
    scannerActiveRef.current = false;
    if (cameraFrameRef.current) cancelAnimationFrame(cameraFrameRef.current);
    cameraFrameRef.current = null;
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    nfcAbortControllerRef.current?.abort();
    nfcAbortControllerRef.current = null;
    setCameraActive(false);
  }

  function normalizeScanValue(rawValue) {
    const value = String(rawValue || '').trim();
    if (!value) return '';
    try {
      const parsed = JSON.parse(value);
      return String(parsed.student_id || parsed.reg_number || parsed.card_uid || parsed.id || '').trim();
    } catch {
      return value;
    }
  }

  async function recordScan(rawValue, method) {
    const studentIdentifier = normalizeScanValue(rawValue);
    const lastScanAt = recentScansRef.current.get(studentIdentifier) || 0;
    if (!studentIdentifier || scanBusyRef.current || Date.now() - lastScanAt < 2000) return;
    if (recentScansRef.current.size > 100) {
      for (const [identifier, scannedAt] of recentScansRef.current) {
        if (Date.now() - scannedAt > 10000) recentScansRef.current.delete(identifier);
      }
    }
    scanBusyRef.current = true;
    recentScansRef.current.set(studentIdentifier, Date.now());
    try {
      const response = await apiFetch('/attendance/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_identifier: studentIdentifier,
          check_in_method: method,
          device_id: `MIPC-${method}-SCANNER`,
          date: selectedDate,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || payload.message || 'Attendance scan failed.');
      await loadSummary();
      const actionLabel = payload.data?.action === 'exit' ? 'exit' : 'entry';
      const recordedAt = actionLabel === 'exit' ? payload.data?.check_out_time : payload.data?.check_in_time;
      const recordedTime = recordedAt
        ? new Date(recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : 'now';
      setScanMessage(`${payload.data?.student_name || studentIdentifier}: ${actionLabel} recorded at ${recordedTime}.`);
      setScanValue('');
      notify(`${payload.data?.student_name || 'Student'} ${actionLabel} recorded.`, 'success');
    } catch (error) {
      console.error('Attendance scan failed:', error);
      setScanMessage(error.message || 'Attendance scan failed.');
      notify(error.message || 'Attendance scan failed.', 'error');
    } finally {
      scanBusyRef.current = false;
    }
  }

  async function startCameraScanner() {
    if (!navigator.mediaDevices?.getUserMedia || !('BarcodeDetector' in window)) {
      notify('QR camera scanning is unavailable in this browser. Enter the student registration number instead.', 'warning');
      return;
    }
    try {
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      cameraStreamRef.current = stream;
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        await cameraVideoRef.current.play();
      }
      scannerActiveRef.current = true;
      setCameraActive(true);
      const scanFrame = async () => {
        if (!scannerActiveRef.current || !cameraVideoRef.current) return;
        try {
          const codes = await detector.detect(cameraVideoRef.current);
          if (codes.length && codes[0].rawValue) {
            await recordScan(codes[0].rawValue, 'QR');
          }
        } catch (error) {
          console.error('QR detection failed:', error);
          stopCameraScanner();
          setScanMessage('Could not read a QR code from the camera stream.');
          return;
        }
        cameraFrameRef.current = requestAnimationFrame(scanFrame);
      };
      cameraFrameRef.current = requestAnimationFrame(scanFrame);
    } catch (error) {
      stopCameraScanner();
      console.error('QR camera access failed:', error);
      notify(error.message || 'Unable to start the QR camera scanner.', 'error');
    }
  }

  async function startNfcScanner() {
    if (!('NDEFReader' in window)) {
      notify('Web NFC is not supported here. Use QR scanning or enter the student registration number.', 'warning');
      return;
    }
    try {
      const reader = new window.NDEFReader();
      const abortController = new AbortController();
      nfcAbortControllerRef.current = abortController;
      reader.addEventListener('reading', async (event) => {
        abortController.abort();
        nfcAbortControllerRef.current = null;
        const record = event.message.records.find((item) => item.recordType === 'text');
        if (!record) {
          setScanMessage('The NFC tag has no text identifier. Store the student ID or registration number on it.');
          return;
        }
        const decoder = new TextDecoder(record.encoding || 'utf-8');
        await recordScan(decoder.decode(record.data), 'NFC');
      }, { once: true });
      await reader.scan({ signal: abortController.signal });
      setScanMessage('NFC reader ready. Tap a student tag to record entry or exit.');
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('NFC scan could not start:', error);
      notify(error.message || 'Unable to start NFC scanning. Check browser support and permissions.', 'error');
    }
  }

  function submitManualScan(event) {
    event.preventDefault();
    recordScan(scanValue, 'QR');
  }

  function exportCsv() {
    const rows = [
      ['Student', 'Registration Number', 'Class', 'Status', 'Check-in Time', 'Check-out Time', 'Method'],
      ...filteredStudents.map((student) => [
        student.name,
        student.reg_number || '',
        student.class_name || '',
        statusLabels[student.status] || student.status,
        student.check_in_time ? new Date(student.check_in_time).toLocaleTimeString() : '',
        student.check_out_time ? new Date(student.check_out_time).toLocaleTimeString() : '',
        student.check_in_method || '',
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `mipc-attendance-${selectedDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="attendance-page min-w-0 flex-1 p-6 md:p-10">
      <header className="attendance-actions mb-8 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">Attendance</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">MIPC EDU attendance</h1>
          <p className="mt-2 text-sm text-slate-500">Database-backed daily and weekly attendance overview.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700">
            <CalendarDays size={16} />
            <input aria-label="Attendance date" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="bg-transparent outline-none" />
          </label>
          <button type="button" onClick={openTakeAttendance} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-500">
            <ScanLine size={16} /> Take Attendance
          </button>
          <button type="button" onClick={exportCsv} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300">
            <Download size={16} /> Export Report
          </button>
          <button type="button" onClick={() => window.print()} className="print-hide inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-indigo-200 hover:text-indigo-600">
            <Printer size={16} /> Print Report
          </button>
        </div>
      </header>

      <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Daily attendance sheet</p>
          <p className="mt-1 text-lg font-bold text-slate-900">MIPC EDU · {new Date(`${selectedDate}T00:00:00`).toLocaleDateString()}</p>
        </div>
        <div className="flex gap-6 text-sm">
          <div><p className="text-slate-500">Total enrolled</p><p className="font-bold text-slate-900">{stats.total_enrolled}</p></div>
          <div><p className="text-slate-500">Marked</p><p className="font-bold text-slate-900">{stats.present + stats.absent + stats.late + stats.permission}</p></div>
        </div>
      </section>

      {(loadError || classesError) && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          {loadError && <p>Attendance data is currently unavailable: {loadError}</p>}
          {classesError && <p>Class filters are unavailable: {classesError}</p>}
        </div>
      )}

      <section className="mb-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_45px_rgba(15,23,42,0.04)]">
          <p className="text-sm font-medium text-slate-500">Total Enrolled</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{stats.total_enrolled}</p>
          <p className="mt-3 text-xs text-slate-500">Active students in database</p>
        </div>
        {statCards.map((stat) => {
          const count = stats[stat.key] || 0;
          const rate = percent(count, stats.total_enrolled);
          return (
            <div key={stat.key} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_45px_rgba(15,23,42,0.04)]">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900">{count}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${stat.color === 'emerald' ? 'bg-emerald-100 text-emerald-700' : stat.color === 'rose' ? 'bg-rose-100 text-rose-700' : stat.color === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>{rate}%</span>
              </div>
              <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${stat.color === 'emerald' ? 'bg-emerald-500' : stat.color === 'rose' ? 'bg-rose-500' : stat.color === 'amber' ? 'bg-amber-500' : 'bg-sky-500'}`} style={{ width: `${rate}%` }} />
              </div>
              <p className="mt-3 text-xs text-slate-500">Selected date · {rate}% of enrolled</p>
            </div>
          );
        })}
      </section>

      <section className="mb-8 rounded-3xl border border-indigo-100 bg-indigo-50/60 p-5">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Weekly statistics</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">Week to date · latest recorded status</h2>
          </div>
          <p className="text-xs text-slate-500">Students without a weekly record are not included.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map((stat) => {
            const count = summary?.weekly?.[stat.key] || 0;
            return (
              <div key={stat.key} className="rounded-2xl border border-white bg-white px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-slate-500">{stat.label}</p>
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">{percent(count, stats.total_enrolled)}%</span>
                </div>
                <p className="mt-1 text-2xl font-bold text-slate-900">{count}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_45px_rgba(15,23,42,0.04)]">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Class tracker</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Class-wise attendance</h2>
          </div>
          <div className="attendance-filters flex flex-wrap gap-3">
            <select aria-label="Filter by class" value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400">
              <option value="All">All classes</option>
              {classes.map((className) => <option key={className} value={className}>{className}</option>)}
            </select>
            <select aria-label="Filter by status" value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400">
              {['All', ...statuses, 'unmarked'].map((status) => <option key={status} value={status}>{status === 'All' ? 'All statuses' : statusLabels[status]}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">{[...Array(4)].map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}</div>
        ) : classRows.length === 0 ? (
          <p className="rounded-2xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">No active student classes were found.</p>
        ) : (
          <div className="space-y-4">
            {classRows.map((row) => {
              const presentRate = percent(row.present, row.total_enrolled);
              const marked = row.present + row.absent + row.late + row.permission;
              return (
                <article key={row.class_name} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700"><Users size={18} /></div>
                      <div>
                        <h3 className="font-bold text-slate-900">{row.class_name}</h3>
                        <p className="text-xs text-slate-500">{row.total_enrolled} enrolled · {marked} marked</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.unmarked === row.total_enrolled ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>
                        {row.unmarked === row.total_enrolled ? 'Take Attendance' : `${presentRate}% Present`}
                      </span>
                      {row.unmarked > 0 && row.unmarked < row.total_enrolled && <span className="text-xs text-slate-500">{row.unmarked} unmarked</span>}
                    </div>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${presentRate}%` }} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {statCards.map((stat) => (
                      <div key={stat.key} className="rounded-xl bg-white px-3 py-2">
                        <p className="text-xs text-slate-500">{stat.label}</p>
                        <p className="mt-1 font-bold text-slate-900">{row[stat.key] || 0}</p>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="attendance-roster rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_45px_rgba(15,23,42,0.04)]">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Daily register</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Student attendance feed</h2>
          </div>
          {summary?.attendance_started && <div className="print-hide inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 size={14} /> Attendance in progress</div>}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-700">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr><th className="px-4 py-3 font-semibold">Student</th><th className="px-4 py-3 font-semibold">Reg Number</th><th className="px-4 py-3 font-semibold">Class</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Check-in</th><th className="px-4 py-3 font-semibold">Check-out</th><th className="px-4 py-3 font-semibold">Method</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredStudents.map((student) => (
                <tr key={student.id} className="transition hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{student.name}</td>
                  <td className="px-4 py-3">{student.reg_number || '—'}</td>
                  <td className="px-4 py-3">{student.class_name}</td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[student.status] || statusStyles.unmarked}`}>{statusLabels[student.status] || student.status}</span></td>
                  <td className="px-4 py-3">{student.check_in_time ? new Date(student.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td className="px-4 py-3">{student.check_out_time ? new Date(student.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td className="px-4 py-3">{student.check_in_method || '—'}</td>
                </tr>
              ))}
              {!loading && filteredStudents.length === 0 && <tr><td colSpan="7" className="px-4 py-10 text-center text-slate-500">No attendance records match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {scanOpen && (
        <div className="print-hide fixed inset-0 z-40 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">Quick action · {selectedDate}</p><h2 className="mt-1 text-2xl font-bold text-slate-900">Take attendance</h2></div>
              <button type="button" onClick={() => setScanOpen(false)} aria-label="Close attendance modal" className="rounded-full bg-slate-100 p-2 text-slate-600"><X size={18} /></button>
            </div>
            <section className="mb-5 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
              <div className="mb-3 flex items-center gap-2">
                <QrCode size={17} className="text-indigo-600" />
                <h3 className="font-semibold text-slate-900">QR / NFC attendance scanner</h3>
              </div>
              <form onSubmit={submitManualScan} className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={scanValue}
                  onChange={(event) => setScanValue(event.target.value)}
                  placeholder="Scan or enter student ID / registration number"
                  aria-label="Student QR or NFC identifier"
                          disabled={!canScanLive}
                          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                        />
                        <button type="submit" disabled={!canScanLive || !scanValue.trim()} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                          Record scan
                        </button>
                        <button type="button" disabled={!canScanLive} onClick={cameraActive ? stopCameraScanner : startCameraScanner} className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 disabled:opacity-50">
                          <QrCode size={15} /> {cameraActive ? 'Stop camera' : 'Use camera'}
                        </button>
                        <button type="button" disabled={!canScanLive} onClick={startNfcScanner} className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 disabled:opacity-50">
                          <ScanLine size={15} /> Read NFC
                        </button>
              </form>
              <video ref={cameraVideoRef} className={`${cameraActive ? 'mt-3 block' : 'hidden'} max-h-64 w-full rounded-xl bg-slate-950 object-cover`} muted playsInline />
              {scanMessage && <p role="status" className="mt-2 text-sm text-slate-600">{scanMessage}</p>}
              {!canScanLive && <p className="mt-2 text-sm font-medium text-amber-700">Live QR/NFC scans are available only for today. Historical dates can still be updated using the attendance form below.</p>}
              <p className="mt-2 text-xs text-slate-500">Each scan records a server-timestamped entry, then exit. QR codes and NFC text tags should contain a student ID or registration number. External readers can submit an assigned smart-card UID.</p>
            </section>
            <div className="space-y-3">
              {(summary?.details || []).map((student) => (
                <div key={student.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="font-semibold text-slate-900">{student.name}</p><p className="text-xs text-slate-500">{student.reg_number || 'No registration number'} · {student.class_name}</p></div>
                  <div className="flex flex-wrap gap-2">
                    {statuses.map((status) => (
                      <button key={status} type="button" onClick={() => setDraft((current) => ({ ...current, [student.id]: status }))} className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${draft[student.id] === status ? statusStyles[status] : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{statusLabels[status]}</button>
                    ))}
                  </div>
                </div>
              ))}
              {!summary?.details?.length && <p className="py-8 text-center text-sm text-slate-500">No students are available to mark.</p>}
            </div>
            <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setScanOpen(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-semibold text-slate-700">Cancel</button>
                <button type="button" onClick={saveAttendance} disabled={saving} className="rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save attendance'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default Attendance;
