import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  AlertOctagon, 
  FileText, 
  Gavel, 
  Award, 
  QrCode, 
  BarChart3, 
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut
} from 'lucide-react';

const DisciplineSidebar = ({ activeTab, setActiveTab }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard Overview', icon: LayoutDashboard },
    { id: 'incidents', label: 'Incident Reporting', icon: AlertOctagon, badge: 3 },
    { id: 'passes', label: 'Leave Permissions', icon: FileText },
    { id: 'punishments', label: 'Corrective Actions', icon: Gavel },
    { id: 'merits', label: 'Merit & Demerit', icon: Award },
    { id: 'scanner', label: 'Smart Card Scanner', icon: QrCode },
    { id: 'reports', label: 'Analytics & Reports', icon: BarChart3 },
    { id: 'settings', label: 'Rules & Settings', icon: Settings },
  ];

  return (
    <aside 
      className={`bg-slate-900 text-slate-300 h-screen transition-all duration-300 flex flex-col border-r border-slate-800 ${
        isCollapsed ? 'w-20' : 'w-72'
      }`}
    >
      {/* Header */}
      <div className="p-6 flex items-center justify-between">
        {!isCollapsed && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-white">
              D
            </div>
            <span className="font-bold text-white text-lg tracking-tight">Digital MIPC</span>
          </div>
        )}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors"
        >
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1 mt-4">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all group relative ${
              activeTab === item.id 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
                : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <item.icon size={22} className={`${activeTab === item.id ? 'text-white' : 'text-slate-400 group-hover:text-indigo-400'}`} />
            
            {!isCollapsed && (
              <span className="font-medium flex-1 text-left">{item.label}</span>
            )}

            {item.badge && !isCollapsed && (
              <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {item.badge}
              </span>
            )}

            {/* Tooltip for collapsed state */}
            {isCollapsed && (
              <div className="absolute left-full ml-4 px-3 py-2 bg-slate-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-xl border border-slate-700">
                {item.label}
              </div>
            )}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-800">
        <button className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-rose-500/10 hover:text-rose-400 transition-all text-slate-400 group">
          <LogOut size={22} />
          {!isCollapsed && <span className="font-medium">Sign Out</span>}
        </button>
      </div>
    </aside>
  );
};

export default DisciplineSidebar;
