import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api/config';

/**
 * Shared dashboard data service.
 * Every metric is fetched live from the backend database — no hardcoded numbers.
 */

function jsonOr(value, fallback) {
  return Array.isArray(value) ? value : fallback;
}

function readNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Small hook: wraps one async fetch with loading/error state + optional polling.
function useEndpoint(fetcher, deps = [], { pollMs = 0 } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const result = await fetcher();
      setData(result);
      setError('');
    } catch (err) {
      console.error('Dashboard fetch failed:', err);
      setError(err.message || 'Unable to reach the server.');
    } finally {
      if (!quiet) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!pollMs) return undefined;
    const timer = window.setInterval(() => load(true), pollMs);
    return () => window.clearInterval(timer);
  }, [load, pollMs]);

  return { data, loading, error, reload: load };
}

/**
 * Total students — from GET /api/students (the live students table).
 * The returned count is the exact number of rows in the database.
 */
export function useStudentCount() {
  return useEndpoint(async () => {
    const response = await apiFetch('/students');
    if (!response.ok) throw new Error(`Student list request failed (${response.status}).`);
    const records = await response.json();
    if (!Array.isArray(records)) throw new Error('Student list response was not a valid list.');
    return {
      total: records.length,
      boarding: records.filter((s) => String(s.status || '').toLowerCase() === 'boarding').length,
      dayScholar: records.filter((s) => String(s.status || '').toLowerCase() === 'day scholar').length,
    };
  }, [], { pollMs: 30000 });
}

/**
 * Leave permissions — from GET /api/permissions/history (live permissions table).
 */
export function useLeavePermissions() {
  return useEndpoint(async () => {
    const response = await apiFetch('/permissions/history');
    if (!response.ok) throw new Error(`Leave permissions request failed (${response.status}).`);
    const records = await response.json();
    const list = jsonOr(records, []);
    return {
      total: list.length,
      pending: list.filter((p) => p.status === 'Pending').length,
      approved: list.filter((p) => p.status === 'Approved').length,
      rejected: list.filter((p) => p.status === 'Rejected').length,
      overdue: list.filter((p) => p.status === 'Overdue').length,
      active: list.filter((p) => p.status === 'Approved' || p.status === 'Overdue').length,
      returned: list.filter((p) => Boolean(p.actual_return_timestamp)).length,
      pendingList: list.filter((p) => p.status === 'Pending').slice(0, 5),
    };
  }, [], { pollMs: 30000 });
}

/**
 * Discipline incidents — from GET /api/discipline/analytics (live discipline_incidents table).
 */
export function useDisciplineMetrics() {
  return useEndpoint(async () => {
    const response = await apiFetch('/discipline/analytics');
    if (!response.ok) throw new Error(`Discipline analytics request failed (${response.status}).`);
    const payload = await response.json();
    const data = payload?.data || {};
    const approvalStats = jsonOr(data.approvalStats, []);
    const byStatus = Object.fromEntries(approvalStats.map((row) => [row.label, readNumber(row.count)]));
    const totalIncidents = approvalStats.reduce((sum, row) => sum + readNumber(row.count), 0);
    const actionStats = jsonOr(data.actionStats, []);
    const actionByStatus = Object.fromEntries(actionStats.map((row) => [row.label, readNumber(row.count)]));
    return {
      totalIncidents,
      pending: byStatus.pending || byStatus.Pending || 0,
      approved: byStatus.approved || byStatus.Approved || 0,
      rejected: byStatus.rejected || byStatus.Rejected || 0,
      totalMerits: readNumber(data.pointStats?.total_merits),
      totalDemerits: readNumber(data.pointStats?.total_demerits),
      pendingActions: actionByStatus.Pending || 0,
      inProgressActions: actionByStatus['In Progress'] || 0,
      completedActions: actionByStatus.Completed || 0,
      incidentsByType: jsonOr(data.incidentsByType, []),
      incidentsByClass: jsonOr(data.incidentsByClass, []),
      monthlyTrend: jsonOr(data.monthlyTrend, []),
    };
  }, [], { pollMs: 30000 });
}

/**
 * Attendance records — from GET /api/attendance/summary (live attendance_records table).
 */
export function useAttendanceSummary(date) {
  return useEndpoint(async () => {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    const response = await apiFetch(`/attendance/summary${query}`);
    if (!response.ok) throw new Error(`Attendance summary request failed (${response.status}).`);
    const payload = await response.json();
    return {
      date: payload.date || date,
      totalEnrolled: readNumber(payload.statistics?.total_enrolled ?? payload.statistics?.total_students),
      present: readNumber(payload.statistics?.present),
      absent: readNumber(payload.statistics?.absent),
      late: readNumber(payload.statistics?.late),
      permission: readNumber(payload.statistics?.permission),
      unmarked: readNumber(payload.statistics?.unmarked),
      attendanceStarted: Boolean(payload.attendance_started),
      classes: jsonOr(payload.classes, []),
      details: jsonOr(payload.details, []),
      weekly: {
        present: readNumber(payload.weekly?.present),
        absent: readNumber(payload.weekly?.absent),
        late: readNumber(payload.weekly?.late),
        permission: readNumber(payload.weekly?.permission),
      },
    };
  }, [date], { pollMs: 30000 });
}

/**
 * Transport — from GET /api/transport/buses (live buses table).
 */
export function useTransportStats() {
  return useEndpoint(async () => {
    const response = await apiFetch('/transport/buses');
    if (!response.ok) throw new Error(`Transport request failed (${response.status}).`);
    const payload = await response.json();
    return {
      activeBuses: readNumber(payload.stats?.active_buses),
      studentsInTransit: readNumber(payload.stats?.students_in_transit),
      delayed: readNumber(payload.stats?.delayed),
      completed: readNumber(payload.stats?.completed),
      totalBuses: readNumber(payload.stats?.total_buses),
      onTimeRate: payload.stats?.on_time_rate || '0%',
      buses: jsonOr(payload.buses, []),
    };
  }, [], { pollMs: 30000 });
}

/**
 * Gate status — from GET /api/permissions/gate/active (live permissions table,
 * students currently outside school, with overdue detection done server-side).
 */
export function useGateStatus() {
  return useEndpoint(async () => {
    const response = await apiFetch('/permissions/gate/active');
    if (!response.ok) throw new Error(`Gate status request failed (${response.status}).`);
    const records = await response.json();
    const list = jsonOr(records, []);
    return {
      outsideNow: list.filter((r) => r.status === 'Approved').length,
      overdue: list.filter((r) => r.status === 'Overdue').length,
      active: list,
    };
  }, [], { pollMs: 30000 });
}
