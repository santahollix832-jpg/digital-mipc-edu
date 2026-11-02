import React, { useState } from 'react';
import { AlertOctagon, Award, BarChart3, CheckCircle2, FileText, Gavel, LayoutDashboard, QrCode, Settings, ShieldAlert } from 'lucide-react';
import IncidentForm from './IncidentForm';
import PendingApprovals from './PendingApprovals';
import LeavePermissions from './LeavePermissions';
import CorrectiveActions from './CorrectiveActions';
import MeritDemerit from './MeritDemerit';
import SmartCardScanner from './SmartCardScanner';
import AnalyticsReports from './AnalyticsReports';
import RulesSettings from './RulesSettings';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../ToastProvider';

const tabDetails = {
  dashboard: {
    title: 'Dashboard Overview',
    description: 'Monitor student conduct and access the discipline tools.',
  },
  incidents: {
    title: 'Incident Reporting',
    description: 'Record and report a student discipline incident.',
  },
  approvals: {
    title: 'Approval Management',
    description: 'Review, approve, or reject pending discipline incidents.',
  },
  passes: {
    title: 'Leave Permissions',
    description: 'Issue, approve, and monitor student exit / entry permits.',
  },
  punishments: {
    title: 'Corrective Actions',
    description: 'Assign and track detentions, suspensions, service, and counseling.',
  },
  merits: {
    title: 'Merit & Demerit',
    description: 'Point ledger driving each student\u2019s disciplinary score.',
  },
  scanner: {
    title: 'Smart Card Scanner',
    description: 'Log gate movements and run instant disciplinary checks.',
  },
  reports: {
    title: 'Analytics & Reports',
    description: 'Trends, top classes, and downloadable summaries.',
  },
  settings: {
    title: 'Rules & Settings',
    description: 'Point thresholds, penalty triggers, and category definitions.',
  },
};

const tabs = [
  { id: 'dashboard', label: 'Dashboard Overview', icon: LayoutDashboard },
  { id: 'incidents', label: 'Incident Reporting', icon: AlertOctagon },
  { id: 'approvals', label: 'Approval Management', icon: CheckCircle2, approverOnly: true },
  { id: 'passes', label: 'Leave Permissions', icon: FileText },
  { id: 'punishments', label: 'Corrective Actions', icon: Gavel },
  { id: 'merits', label: 'Merit & Demerit', icon: Award },
  { id: 'scanner', label: 'Smart Card Scanner', icon: QrCode },
  { id: 'reports', label: 'Analytics & Reports', icon: BarChart3 },
  { id: 'settings', label: 'Rules & Settings', icon: Settings },
];

function DisciplineDashboard() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [activeTab, setActiveTab] = useState('dashboard');
  const isApprover = user?.role === 'ADMIN' || user?.role === 'DOD';
  const visibleTabs = tabs.filter((tab) => !tab.approverOnly || isApprover);
  const activeDetails = tabDetails[activeTab] ?? tabDetails.dashboard;
  const toast = notify;

  return (
    <main className="min-w-0 flex-1 p-6 md:p-10">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
          <ShieldAlert size={24} />
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Discipline</p>
          <h1 className="text-2xl font-bold text-slate-900">{activeDetails.title}</h1>
        </div>
      </header>

      <nav className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {visibleTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
              activeTab === id
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {activeTab === 'incidents' ? (
        <IncidentForm />
      ) : activeTab === 'approvals' && isApprover ? (
        <PendingApprovals />
      ) : activeTab === 'passes' ? (
        <LeavePermissions toast={toast} />
      ) : activeTab === 'punishments' ? (
        <CorrectiveActions toast={toast} />
      ) : activeTab === 'merits' ? (
        <MeritDemerit toast={toast} />
      ) : activeTab === 'scanner' ? (
        <SmartCardScanner toast={toast} />
      ) : activeTab === 'reports' ? (
        <AnalyticsReports toast={toast} />
      ) : activeTab === 'settings' ? (
        <RulesSettings toast={toast} canManage={isApprover} />
      ) : activeTab === 'dashboard' && isApprover ? (
        <div className="space-y-6">
          <PendingApprovals />
          <AnalyticsReports toast={toast} />
        </div>
      ) : (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_45px_rgba(15,23,42,0.04)]">
          <h2 className="text-lg font-semibold text-slate-900">{activeDetails.title}</h2>
          <p className="mt-2 text-slate-600">{activeDetails.description}</p>
        </section>
      )}
    </main>
  );
}

export default DisciplineDashboard;
