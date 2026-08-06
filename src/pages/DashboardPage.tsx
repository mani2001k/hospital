import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { PageHeader, Card, LoadingSpinner, Badge, EmptyState } from '@/components/ui';
import { LineChart, type SeriesPoint } from '@/components/Charts';
import { useAuth } from '@/context/AuthContext';
import { roleLabel } from '@/lib/permissions';
import {
  BedDouble, Clock, RefreshCw, CalendarClock, Users, AlertTriangle,
  Activity, TrendingUp, TrendingDown, AlertCircle, ArrowRight,
} from 'lucide-react';

interface KpiSeries {
  metric: string;
  unit: string;
  points: SeriesPoint[];
  latest: number;
  previous: number;
}

interface AlertRow {
  id: string;
  title: string;
  severity: string;
  status: string;
  metric: string;
  metric_value: number;
  threshold_value: number;
  ward_name: string;
  created_at: string;
}

interface WardOption {
  id: string;
  name: string;
  code: string;
}

const METRIC_CONFIG: Record<string, { label: string; icon: typeof BedDouble; color: string; format: (v: number) => string }> = {
  occupancy: { label: 'Occupancy', icon: BedDouble, color: '#38bdf8', format: (v) => `${v.toFixed(1)}%` },
  emergency_wait_minutes: { label: 'ER Wait Time', icon: Clock, color: '#f59e0b', format: (v) => `${v.toFixed(0)} min` },
  bed_turnover_hours: { label: 'Bed Turnover', icon: RefreshCw, color: '#a78bfa', format: (v) => `${v.toFixed(1)}h` },
  length_of_stay_hours: { label: 'Length of Stay', icon: CalendarClock, color: '#34d399', format: (v) => `${(v / 24).toFixed(1)}d` },
  staffing_ratio: { label: 'Staffing Ratio', icon: Users, color: '#fb923c', format: (v) => `1:${v.toFixed(1)}` },
  readmission_risk: { label: 'Readmission Risk', icon: AlertTriangle, color: '#f43f5e', format: (v) => `${v.toFixed(1)}%` },
};

const METRIC_ORDER = ['occupancy', 'emergency_wait_minutes', 'bed_turnover_hours', 'length_of_stay_hours', 'staffing_ratio', 'readmission_risk'];

export default function DashboardPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [kpiSeries, setKpiSeries] = useState<KpiSeries[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [wards, setWards] = useState<WardOption[]>([]);
  const [selectedWard, setSelectedWard] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('14');

  useEffect(() => {
    (async () => {
      const { data: wardData } = await supabase
        .from('wards')
        .select('id, name, code')
        .eq('org_id', profile?.org_id)
        .order('name');
      setWards(wardData as WardOption[] ?? []);
    })();
  }, [profile?.org_id]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const days = parseInt(dateRange);
      const since = new Date(Date.now() - days * 86400000).toISOString();

      let wardFilter = supabase
        .from('kpi_snapshots')
        .select('metric, value, unit, recorded_at, ward_id')
        .eq('org_id', profile?.org_id)
        .gte('recorded_at', since)
        .order('recorded_at', { ascending: true });

      if (selectedWard !== 'all') {
        wardFilter = wardFilter.eq('ward_id', selectedWard);
      }
      const { data: kpiData } = await wardFilter;

      const grouped: Record<string, KpiSeries> = {};
      (kpiData ?? []).forEach((row) => {
        const m = row.metric as string;
        if (!grouped[m]) {
          grouped[m] = { metric: m, unit: row.unit, points: [], latest: 0, previous: 0 };
        }
        grouped[m].points.push({
          time: row.recorded_at,
          value: Number(row.value),
        });
      });

      const series = METRIC_ORDER.map((m) => {
        const s = grouped[m];
        if (!s) return { metric: m, unit: METRIC_CONFIG[m]?.color ?? '', points: [], latest: 0, previous: 0 };
        if (s.points.length > 0) {
          s.latest = s.points[s.points.length - 1].value;
          s.previous = s.points.length > 1 ? s.points[s.points.length - 2].value : s.latest;
        }
        return s;
      }).filter(Boolean);

      setKpiSeries(series);

      let alertQuery = supabase
        .from('alerts')
        .select(`
          id, title, severity, status, metric, metric_value, threshold_value, created_at,
          ward:wards(name, code)
        `)
        .eq('org_id', profile?.org_id)
        .order('created_at', { ascending: false })
        .limit(6);

      if (selectedWard !== 'all') {
        alertQuery = alertQuery.eq('ward_id', selectedWard);
      }
      const { data: alertData } = await alertQuery;

      setAlerts((alertData ?? []).map((a: any) => ({
        id: a.id,
        title: a.title,
        severity: a.severity,
        status: a.status,
        metric: a.metric,
        metric_value: Number(a.metric_value),
        threshold_value: Number(a.threshold_value),
        ward_name: a.ward ? `${Array.isArray(a.ward) ? a.ward[0]?.name : a.ward?.name}` : '—',
        created_at: a.created_at,
      })));

      setLoading(false);
    })();
  }, [profile?.org_id, selectedWard, dateRange]);

  const stats = useMemo(() => {
    const total = alerts.length;
    const critical = alerts.filter((a) => a.severity === 'critical').length;
    const active = alerts.filter((a) => a.status === 'active').length;
    return { total, critical, active };
  }, [alerts]);

  return (
    <div>
      <PageHeader
        title="Operations Dashboard"
        subtitle={`Welcome back, ${profile?.full_name}. Here's the current state of your hospital network.`}
        breadcrumbs={[{ label: 'Home' }, { label: 'Dashboard' }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedWard}
              onChange={(e) => setSelectedWard(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 focus:border-sky-500/50 focus:outline-none"
            >
              <option value="all">All Wards</option>
              {wards.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 focus:border-sky-500/50 focus:outline-none"
            >
              <option value="7">Last 7 days</option>
              <option value="14">Last 14 days</option>
              <option value="30">Last 30 days</option>
            </select>
          </div>
        }
      />

      {loading ? (
        <LoadingSpinner label="Loading dashboard…" />
      ) : (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {kpiSeries.map((s) => {
              const cfg = METRIC_CONFIG[s.metric];
              if (!cfg || s.points.length === 0) return null;
              const Icon = cfg.icon;
              const change = s.latest - s.previous;
              const changePct = s.previous ? (change / s.previous) * 100 : 0;
              const isUp = change > 0;
              const isGoodDirection = s.metric === 'occupancy' ? !isUp : !isUp;
              return (
                <Card key={s.metric} className="group p-5 transition-shadow hover:shadow-lg hover:shadow-slate-900/50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: `${cfg.color}1a` }}>
                        <Icon size={18} style={{ color: cfg.color }} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-300">{cfg.label}</p>
                        <p className="text-[10px] text-slate-500">{selectedWard === 'all' ? 'Network avg' : 'Ward view'}</p>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1 text-xs ${isGoodDirection ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      <span>{Math.abs(changePct).toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="mt-4 flex items-end justify-between">
                    <p className="text-3xl font-bold text-slate-50">{cfg.format(s.latest)}</p>
                    <span className="text-[10px] text-slate-500">vs {cfg.format(s.previous)}</span>
                  </div>
                  <div className="mt-3 -mx-1">
                    <LineChart data={s.points.slice(-14)} height={80} color={cfg.color} unit={s.unit === '%' ? '%' : ''} />
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Alert summary + role-aware action panel */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle size={18} className="text-amber-400" />
                  <h3 className="text-sm font-semibold text-slate-200">Active Alerts</h3>
                </div>
                <div className="flex gap-2">
                  <Badge variant="critical">{stats.critical} critical</Badge>
                  <Badge variant="warning">{stats.active} active</Badge>
                </div>
              </div>
              {alerts.length === 0 ? (
                <EmptyState icon={<AlertCircle size={32} />} title="No active alerts" description="All metrics within threshold." />
              ) : (
                <div className="space-y-2">
                  {alerts.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between rounded-lg border border-slate-700/40 bg-slate-800/30 px-4 py-3 transition-colors hover:border-slate-600/50"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`h-2 w-2 rounded-full ${a.severity === 'critical' ? 'bg-rose-400' : 'bg-amber-400'}`} />
                        <div>
                          <p className="text-sm font-medium text-slate-200">{a.title}</p>
                          <p className="text-[11px] text-slate-500">
                            {a.ward_name} · {a.metric.replace(/_/g, ' ')} · {a.metric_value.toFixed(1)} / threshold {a.threshold_value.toFixed(1)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={a.status === 'acknowledged' ? 'neutral' : a.severity === 'critical' ? 'critical' : 'warning'}>
                          {a.status}
                        </Badge>
                        <Link to="/forecasts" className="text-slate-500 hover:text-sky-400">
                          <ArrowRight size={14} />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <Activity size={18} className="text-sky-400" />
                <h3 className="text-sm font-semibold text-slate-200">Your Role</h3>
              </div>
              <div className="space-y-3">
                <div className="rounded-lg bg-slate-800/40 p-3">
                  <p className="text-xs text-slate-500">Signed in as</p>
                  <p className="text-sm font-medium text-slate-200">{profile?.full_name}</p>
                  <p className="text-xs text-sky-400">{profile ? roleLabel(profile.role) : ''}</p>
                </div>
                <Link to="/queues" className="block rounded-lg border border-slate-700/40 bg-slate-800/30 px-4 py-3 text-sm text-slate-300 transition-colors hover:border-sky-500/30 hover:text-sky-400">
                  View workflow queues →
                </Link>
                <Link to="/predictions" className="block rounded-lg border border-slate-700/40 bg-slate-800/30 px-4 py-3 text-sm text-slate-300 transition-colors hover:border-sky-500/30 hover:text-sky-400">
                  View AI predictions →
                </Link>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
