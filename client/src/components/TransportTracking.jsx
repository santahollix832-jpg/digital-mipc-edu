import React from 'react';
import { Bus, MapPin, Navigation } from 'lucide-react';

const TransportTracking = () => {
  return (
    <main className="p-6 md:p-10">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Modules</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Transport Tracking</h1>
        <p className="mt-3 text-slate-600">Monitor school vehicles and transport routes in real-time.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Bus size={24} />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Fleet Status</h3>
          <p className="mt-2 text-sm text-slate-600">View active vehicles and their current status on the road.</p>
          <div className="mt-4 flex items-center text-sm font-medium text-indigo-600">
            Coming Soon
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <MapPin size={24} />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Route Management</h3>
          <p className="mt-2 text-sm text-slate-600">Manage school bus routes and student pickup points.</p>
          <div className="mt-4 flex items-center text-sm font-medium text-emerald-600">
            Coming Soon
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Navigation size={24} />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Live Tracking</h3>
          <p className="mt-2 text-sm text-slate-600">Real-time GPS tracking for parents and administrators.</p>
          <div className="mt-4 flex items-center text-sm font-medium text-amber-600">
            Coming Soon
          </div>
        </div>
      </div>
    </main>
  );
};

export default TransportTracking;
