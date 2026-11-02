import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Download, PieChart, RefreshCw, TrendingDown as TrendingDownIcon, TrendingUp } from 'lucide-react';
import { apiFetch, API_HOST } from '../../api/config';
import { cardClasses } from './shared';

// Lightweight, dependency-free SVG bar chart.
function BarChart({ data, color = '#4f46e5' }) {
  if (!data.length) return <p className="text-sm text-slate-500">No data available yet.</p>;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-2.5">
      {data.map((row) => (
        <div key={row.label} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate text-sm text-slate-600" title={row.label}>{row.label || '—'}</span>
          <div className="h-6 flex-1 overflow-hidden rounded-lg bg-slate-100">
            <div
              className="flex h-full items-center justify-end rounded-lg px-2 text-xs font-bold text-white transition-all"
              style={{ width: `${Math.max((row.count / max) * 100, 12)}%`, backgroundColor: color }}
            >
              {row.count}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Lightweight SVG polyline trend chart.
function TrendChart({ data }) {
  if (data.length < 2) return <p className="text-sm text-slate-500">Not enough history for a trend yet.</p>;
  const width = 560;
  const height = 160;
  const max = Math.max(...data.map((d) => d.count), 1);
  const stepX = width / (data.length - 1);
  const points = data.map((d, i) => `${i * stepX},${height - (d.count / max) * (height - 24) - 8}`).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" role="img" aria-label="Monthly incident trend">
      <polyline points={points} fill="none" stroke="#4f46e5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => (
        <g key={d.label}>
          <circle cx={i * stepX} cy={height - (d.count / max) * (height - 24) - 8} r="4" fill="#4f46e5" />
          <text x={i * stepX} y={height - 2} textAnchor="middle" fontSize="10" fill="#64748b">{d.label}</text>
          <text x={i * stepX} y={height - (d.count / max) * (height - 24) - 16} textAnchor="middle" fontSize="11" fontWeight="700" fill="#312e81">{d.count}</text>
        </g>
      ))}
    </svg>
  );
}

const severityColors = {
  Low: 'bg-emerald-500',
  Medium: 'bg-amber-500',
  High: 'bg-rose-500',
};

function AnalyticsReports({ toast }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await apiFetch('/api/discipline/analytics');
      const payload = await response.json();
      if (!response.ok || payload.success === false) throw new Error(payload.message || `Failed to load (${response.status}).`);
      setAnalytics(payload.data);
    } catch (err) {
      console.error('Failed to load analytics:', err);
      setLoadError(err.message || 'Unable to load discipline analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  if (loading) {
    return <section className={cardClasses}><p className="text-sm text-slate-500">Crunching discipline analytics…</p></section>;
  }
  if (loadError || !analytics) {
    return (
      <section className={cardClasses}>
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{loadError || 'Analytics unavailable.'}</p>
        <button type="button" onClick={loadAnalytics} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
          <RefreshCw size={15} /> Retry
        </button>
      </section>
    );
  }

  const totalIncidents = analytics.incidentsByType.reduce((sum, r) => sum + r.count, 0);
  const { total_merits: totalMerits = 0, total_demerits: totalDemerits = 0 } = analytics.pointStats;

  function downloadCsv() {
    const link = document.createElement('a');
    link.href = `${API_HOST}/api/discipline/reports/summary.csv`;
    link.setAttribute('download', 'discipline-summary.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast?.('Report summary download started.');
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Total incidents', value: totalIncidents, icon: BarChart3, tint: 'bg-indigo-600' },
          { label: 'Merits awarded', value: totalMerits, icon: TrendingUp, tint: 'bg-emerald-600' },
          { label: 'Demerits issued', value: totalDemerits, icon: TrendingDownIcon, tint: 'bg-rose-600' },
          { label: 'Pending approvals', value: analytics.approvalStats.find((a) => a.label === 'pending')?.count ?? 0, icon: PieChart, tint: 'bg-amber-500' },
        ].map(({ label, value, icon: Icon, tint }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_20px_45px_rgba(15,23,42,0.04)]">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-white ${tint}`}>
              <Icon size={20} />
            </div>
            <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
            <p className="text-sm text-slate-500">{label}</p>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className={cardClasses}>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><BarChart3 size={18} className="text-indigo-600" /> Incidents by Type</h2>
          <div className="mt-5"><BarChart data={analytics.incidentsByType} /></div>
        </section>

        <section className={cardClasses}>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><BarChart3 size={18} className="text-indigo-600" /> Top Violating Classes</h2>
          <div className="mt-5"><BarChart data={analytics.incidentsByClass} color="#7c3aed" /></div>
        </section>

        <section className={cardClasses}>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><TrendingUp size={18} className="text-indigo-600" /> Monthly Incident Trend</h2>
          <div className="mt-5"><TrendChart data={analytics.monthlyTrend} /></div>
        </section>

        <section className={cardClasses}>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><PieChart size={18} className="text-indigo-600" /> Severity &amp; Workflow Breakdown</h2>
          <div className="mt-5 space-y-6">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Severity</p>
              {analytics.incidentsBySeverity.length === 0 ? (
                <p className="text-sm text-slate-500">No incidents recorded.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {analytics.incidentsBySeverity.map((row) => (
                    <span key={row.label} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm">
                      <span className={`h-2.5 w-2.5 rounded-full ${severityColors[row.label] || 'bg-slate-400'}`} />
                      {row.label}: <strong>{row.count}</strong>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Approval pipeline</p>
              <div className="flex flex-wrap gap-2">
                {analytics.approvalStats.map((row) => (
                  <span key={row.label} className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm capitalize">
                    {row.label}: <strong className="ml-1">{row.count}</strong>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Corrective actions</p>
              <div className="flex flex-wrap gap-2">
                {analytics.actionStats.length === 0 ? (
                  <p className="text-sm text-slate-500">None assigned yet.</p>
                ) : (
                  analytics.actionStats.map((row) => (
                    <span key={row.status} className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm">
                      {row.status}: <strong className="ml-1">{row.count}</strong>
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className={cardClasses}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><Download size={18} className="text-indigo-600" /> Report Exports</h2>
            <p className="mt-1 text-sm text-slate-500">Download the full incident register with student details, statuses, and approval outcomes.</p>
          </div>
          <button
            type="button"
            onClick={downloadCsv}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700"
          >
            <Download size={16} /> Download CSV Summary
          </button>
        </div>
      </section>
    </div>
  );
}

export default AnalyticsReports;
