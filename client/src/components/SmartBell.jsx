import React from 'react';
import { Bell, Clock, Cpu, Settings } from 'lucide-react';

const SmartBell = () => {
  return (
    <main className="p-6 md:p-10">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Hardware Modules</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">IoT Smart Bell</h1>
        <p className="mt-3 text-slate-600">Automated school bell system with IoT integration and schedule management.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Clock size={24} />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Bell Schedule</h3>
          <p className="mt-2 text-sm text-slate-600">Configure automatic ring times for periods and breaks.</p>
          <div className="mt-4 flex items-center text-sm font-medium text-indigo-600">
            Coming Soon
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
            <Bell size={24} />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Manual Override</h3>
          <p className="mt-2 text-sm text-slate-600">Trigger the school bell manually for emergencies or special events.</p>
          <div className="mt-4 flex items-center text-sm font-medium text-rose-600">
            Coming Soon
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 text-slate-600">
            <Cpu size={24} />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Device Status</h3>
          <p className="mt-2 text-sm text-slate-600">Monitor the connectivity and health of the physical bell hardware.</p>
          <div className="mt-4 flex items-center text-sm font-medium text-slate-600">
            Offline
          </div>
        </div>
      </div>
    </main>
  );
};

export default SmartBell;
