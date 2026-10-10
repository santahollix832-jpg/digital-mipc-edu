import React, { useState } from 'react';
import { AlertOctagon, Award, BarChart3, FileText, Gavel, LayoutDashboard, QrCode, Settings, ShieldAlert } from 'lucide-react';
import IncidentForm from './IncidentForm';

const tabDetails = {
  dashboard: {
    title: 'Dashboard Overview',
    description: 'Monitor student conduct and access the discipline tools.',
  },
  incidents: {
    title: 'Incident Reporting',
    description: 'Record and report a student discipline incident.',
  },
  passes: {
    title: 'Leave Permissions',
    description: 'Manage student leave and permission requests.',
  },
  punishments: {
    title: 'Corrective Actions',
    description: 'Review and manage corrective actions.',
  },
  merits: {
    title: 'Merit & Demerit',
    description: 'Review student merits and demerits.',
  },
  scanner: {
    title: 'Smart Card Scanner',
    description: 'Access discipline tools for student smart cards.',
  },
  reports: {
    title: 'Analytics & Reports',
    description: 'Review discipline analytics and reports.',
  },
  settings: {
    title: 'Rules & Settings',
    description: 'Manage discipline rules and settings.',
  },
};

const tabs = [
  { id: 'dashboard', label: 'Dashboard Overview', icon: LayoutDashboard },
  { id: 'incidents', label: 'Incident Reporting', icon: AlertOctagon },
  { id: 'passes', label: 'Leave Permissions', icon: FileText },
  { id: 'punishments', label: 'Corrective Actions', icon: Gavel },
  { id: 'merits', label: 'Merit & Demerit', icon: Award },
  { id: 'scanner', label: 'Smart Card Scanner', icon: QrCode },
  { id: 'reports', label: 'Analytics & Reports', icon: BarChart3 },
  { id: 'settings', label: 'Rules & Settings', icon: Settings },
];

function DisciplineDashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const activeDetails = tabDetails[activeTab] ?? tabDetails.dashboard;

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
        {tabs.map(({ id, label, icon: Icon }) => (
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
