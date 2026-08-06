import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, LayoutDashboard, ListChecks, TrendingUp, ClipboardList,
  Brain, AlertTriangle, ShieldCheck, BarChart3, Bell, Users,
  ScrollText, Settings, LogOut, Menu, X, Search, ChevronDown,
  UserRound, Briefcase, Building2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { hasPermission, roleLabel, type Permission } from '@/lib/permissions';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  permission: Permission;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={18} />, permission: 'view_dashboard' },
  { to: '/patients', label: 'Patients', icon: <UserRound size={18} />, permission: 'view_patients' },
  { to: '/staff', label: 'Staff', icon: <Briefcase size={18} />, permission: 'view_staff' },
  { to: '/wards', label: 'Wards', icon: <Building2 size={18} />, permission: 'view_wards' },
  { to: '/queues', label: 'Workflow Queues', icon: <ListChecks size={18} />, permission: 'view_queues' },
  { to: '/forecasts', label: 'Forecast & Capacity', icon: <TrendingUp size={18} />, permission: 'view_forecasts' },
  { to: '/tasks', label: 'Tasks & Escalation', icon: <ClipboardList size={18} />, permission: 'view_tasks' },
  { to: '/predictions', label: 'Demand Predictions', icon: <Brain size={18} />, permission: 'view_predictions' },
  { to: '/anomalies', label: 'Anomaly Explanations', icon: <AlertTriangle size={18} />, permission: 'review_anomalies' },
  { to: '/preventive', label: 'Preventive Actions', icon: <ShieldCheck size={18} />, permission: 'view_preventive_actions' },
  { to: '/reports', label: 'Reports & Analytics', icon: <BarChart3 size={18} />, permission: 'view_reports' },
  { to: '/notifications', label: 'Notifications', icon: <Bell size={18} />, permission: 'view_notifications' },
  { to: '/users', label: 'User & Role Management', icon: <Users size={18} />, permission: 'manage_users' },
  { to: '/audit', label: 'Audit & Settings', icon: <ScrollText size={18} />, permission: 'view_audit' },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);

  const visibleItems = NAV_ITEMS.filter((item) => hasPermission(profile?.role, item.permission));
  const initials = profile?.full_name
    ?.split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('') ?? '?';

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform border-r border-slate-700/50 bg-slate-900/95 backdrop-blur transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-700/50 px-4">
          <Link to="/" className="flex items-center gap-2.5" onClick={() => setSidebarOpen(false)}>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/20 ring-1 ring-sky-500/30">
              <Activity className="text-sky-400" size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-100">Command Center</p>
              <p className="text-[10px] text-slate-500">Predictive Operations</p>
            </div>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="text-slate-500 hover:text-slate-300 lg:hidden">
            <X size={18} />
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3" style={{ maxHeight: 'calc(100vh - 4rem - 64px)' }}>
          {visibleItems.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-sky-500/10 text-sky-400 ring-1 ring-inset ring-sky-500/20'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-700/50 p-3">
          <Link
            to="/audit"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
          >
            <Settings size={18} />
            <span>System Settings</span>
          </Link>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-700/50 bg-slate-900/80 px-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-slate-400 hover:text-slate-200 lg:hidden"
            >
              <Menu size={20} />
            </button>
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                type="search"
                placeholder="Search patients, tasks, alerts…"
                className="w-64 rounded-lg border border-slate-700 bg-slate-800/60 py-2 pl-10 pr-3 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500/50 focus:outline-none focus:ring-1 focus:ring-sky-500/30"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              aria-label="Notifications"
            >
              <Bell size={18} />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-400 ring-2 ring-slate-900" />
            </Link>

            <div className="relative">
              <button
                onClick={() => setUserMenu((v) => !v)}
                className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-slate-800/60"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-500/20 text-xs font-semibold text-sky-300 ring-1 ring-sky-500/30">
                  {initials}
                </div>
                <div className="hidden text-left sm:block">
                  <p className="text-xs font-medium text-slate-200">{profile?.full_name}</p>
                  <p className="text-[10px] text-slate-500">{profile ? roleLabel(profile.role) : ''}</p>
                </div>
                <ChevronDown size={14} className="text-slate-500" />
              </button>
              {userMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenu(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-xl">
                    <div className="border-b border-slate-700/50 px-3 py-2">
                      <p className="text-xs font-medium text-slate-200">{profile?.full_name}</p>
                      <p className="text-[10px] text-slate-500">{profile?.email}</p>
                    </div>
                    <button
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700/50"
                    >
                      <LogOut size={15} /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-4rem)] p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
