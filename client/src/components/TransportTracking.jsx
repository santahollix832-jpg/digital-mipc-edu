import React, { useState } from 'react';
import { 
  Bus, 
  MapPin, 
  Navigation, 
  Users, 
  Clock, 
  Plus, 
  Search, 
  Phone, 
  Eye, 
  MoreVertical,
  CheckCircle2,
  AlertCircle,
  TrendingUp
} from 'lucide-react';

const TransportTracking = () => {
  const [activeTab, setActiveTab] = useState('fleet');
  const [searchQuery, setSearchQuery] = useState('');

  const stats = [
    { label: 'Active Buses', value: '12', icon: Bus, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Students in Transit', value: '482', icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'On-Time Rate', value: '94.2%', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Routes Covered', value: '8/8', icon: Navigation, color: 'text-rose-600', bg: 'bg-rose-50' },
  ];

  const fleet = [
    { id: 'BUS-001', driver: 'Jean Damascene', route: 'Kicukiro - Gikondo', status: 'In Transit', speed: '35 km/h', capacity: '45/50', phone: '+250 788 000 111' },
    { id: 'BUS-002', driver: 'Marie Claire', route: 'Remera - Kimironko', status: 'Delayed', speed: '12 km/h', capacity: '32/50', phone: '+250 788 000 222' },
    { id: 'BUS-003', driver: 'Emmanuel K.', route: 'Nyabugogo - Town', status: 'In Transit', speed: '42 km/h', capacity: '48/50', phone: '+250 788 000 333' },
    { id: 'BUS-004', driver: 'Alice Umutoni', route: 'Kacyiru - Kibagabaga', status: 'Completed', speed: '0 km/h', capacity: '0/50', phone: '+250 788 000 444' },
    { id: 'BUS-005', driver: 'Justin B.', route: 'Kanombe - Masaka', status: 'In Transit', speed: '38 km/h', capacity: '28/50', phone: '+250 788 000 555' },
  ];

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      {/* Header Section */}
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">Transport Management</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Fleet Dashboard</h1>
          <p className="text-slate-500">Real-time monitoring and logistics for school transport.</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">
            <MapPin size={18} />
            Route Map
          </button>
          <button className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700">
            <Plus size={18} />
            Assign Student
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <div key={i} className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.bg} ${stat.color}`}>
              <stat.icon size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">{stat.label}</p>
              <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Card */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Table Controls */}
        <div className="flex flex-col border-b border-slate-100 p-6 md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            <button 
              onClick={() => setActiveTab('fleet')}
              className={`px-4 py-2 text-sm font-semibold transition-all rounded-lg ${activeTab === 'fleet' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Active Fleet
            </button>
            <button 
              onClick={() => setActiveTab('routes')}
              className={`px-4 py-2 text-sm font-semibold transition-all rounded-lg ${activeTab === 'routes' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Route Schedule
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search bus or driver..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all md:w-64"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Table Section */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-xs font-bold uppercase tracking-wider text-slate-500">
                <th className="px-6 py-4">Bus Details</th>
                <th className="px-6 py-4">Current Route</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Metrics</th>
                <th className="px-6 py-4">Passengers</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fleet.map((bus) => (
                <tr key={bus.id} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                        <Bus size={20} />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{bus.id}</p>
                        <p className="text-xs text-slate-500">{bus.driver}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <MapPin size={14} className="text-slate-400" />
                      {bus.route}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      bus.status === 'In Transit' ? 'bg-indigo-50 text-indigo-700' :
                      bus.status === 'Delayed' ? 'bg-amber-50 text-amber-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        bus.status === 'In Transit' ? 'bg-indigo-500 animate-pulse' :
                        bus.status === 'Delayed' ? 'bg-amber-500' :
                        'bg-slate-400'
                      }`} />
                      {bus.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={14} className="text-emerald-500" />
                      {bus.speed}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="w-24">
                      <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                        <span>{bus.capacity}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div 
                          className="h-full bg-indigo-500 rounded-full" 
                          style={{ width: `${(parseInt(bus.capacity.split('/')[0])/50)*100}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button title="Call Driver" className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                        <Phone size={18} />
                      </button>
                      <button title="View Live" className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                        <Eye size={18} />
                      </button>
                      <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                        <MoreVertical size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="border-t border-slate-100 bg-slate-50/30 p-4 px-6">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <AlertCircle size={14} />
            Data refreshes automatically every 30 seconds. System time: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>
    </main>
  );
};

export default TransportTracking;
