import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { hasPermission } from '@/lib/permissions';
import { PageHeader, Card, LoadingSpinner, Badge, EmptyState, Button } from '@/components/ui';
import { LineChart, BarChart, type SeriesPoint } from '@/components/Charts';
import { Pagination } from '@/components/TableControls';
import {
  BarChart3, Download, FileText, Save, Clock, CheckCircle2, Filter,
  TrendingUp, Users, BedDouble, AlertTriangle, X,
} from 'lucide-react';

interface ReportRow {
  id: string;
  name: string;
  report_type: string;
  status: string;
  format: string;
  date_from: string;
  date_to: string;
  created_at: string;
  completed_at: string | null;
  generated_by: { full_name: string } | { full_name: string }[] | null;
}

const REPORT_TYPES = [
  { id: 'operational', label: 'Operational Command Centre', desc: 'Occupancy, ER wait, bed turnover, LOS, staffing, readmission' },
  { id: 'demand_forecast', label: 'Demand & Workload Forecasts', desc: 'Forecasts with confidence ranges' },
  { id: 'anomaly_sla', label: 'Anomaly & SLA Risk Alerts', desc: 'Alerts with explanations' },
  { id: 'resource_task', label: 'Resource & Task Assignment', desc: 'Escalation and approval tracking' },
  { id: 'outcome', label: 'Prediction vs Actual Outcomes', desc: 'Historical comparison of predictions and actions' },
];

const METRICS = ['occupancy', 'emergency_wait_minutes', 'bed_turnover_hours', 'length_of_stay_hours', 'staffing_ratio', 'readmission_risk'];

export default function ReportsPage() {
  const { profile } = useAuth();
  const canExport = hasPermission(profile?.role, 'export_reports');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate');
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(8);

  // Report config
  const [reportType, setReportType] = useState('operational');
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [compareFrom, setCompareFrom] = useState(new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10));
  const [compareTo, setCompareTo] = useState(new Date(Date.now() - 15 * 86400000).toISOString().slice(0, 10));
  const [selectedMetric, setSelectedMetric] = useState('occupancy');
  const [wardFilter, setWardFilter] = useState('all');
  const [wards, setWards] = useState<{ id: string; name: string }[]>([]);

  // Chart data
  const [currentPeriod, setCurrentPeriod] = useState<SeriesPoint[]>([]);
  const [comparePeriod, setComparePeriod] = useState<SeriesPoint[]>([]);
  const [summaryStats, setSummaryStats] = useState<{ label: string; current: number; previous: number; change: number }[]>([]);

  useEffect(() => {
    (async () => {
      const { data: w } = await supabase.from('wards').select('id, name').eq('org_id', profile?.org_id).order('name');
      setWards(w ?? []);
    })();
  }, [profile?.org_id]);

  useEffect(() => {
    if (activeTab === 'history') loadReports();
  }, [activeTab, profile?.org_id, page]);

  const loadReports = async () => {
    setLoading(true);
    const from = (page - 1) * pageSize;
    const { data } = await supabase
      .from('reports')
      .select(`id, name, report_type, status, format, date_from, date_to, created_at, completed_at,
        generated_by:profiles(full_name)`)
      .eq('org_id', profile?.org_id)
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    setReports((data ?? []) as unknown as ReportRow[]);
    setLoading(false);
  };

  const generatePreview = async () => {
    setLoading(true);
    let q = supabase
      .from('kpi_snapshots')
      .select('metric, value, recorded_at, ward_id')
      .eq('org_id', profile?.org_id)
      .eq('metric', selectedMetric)
      .gte('recorded_at', new Date(dateFrom).toISOString())
      .lte('recorded_at', new Date(dateTo).toISOString() + 'T23:59:59')
      .order('recorded_at', { ascending: true });
    if (wardFilter !== 'all') q = q.eq('ward_id', wardFilter);
    const { data: current } = await q;

    let q2 = supabase
      .from('kpi_snapshots')
      .select('metric, value, recorded_at, ward_id')
      .eq('org_id', profile?.org_id)
      .eq('metric', selectedMetric)
      .gte('recorded_at', new Date(compareFrom).toISOString())
      .lte('recorded_at', new Date(compareTo).toISOString() + 'T23:59:59')
      .order('recorded_at', { ascending: true });
    if (wardFilter !== 'all') q2 = q2.eq('ward_id', wardFilter);
    const { data: compare } = await q2;

    const currentData: SeriesPoint[] = (current ?? []).map((r: any) => ({ time: r.recorded_at, value: Number(r.value) }));
    const compareData: SeriesPoint[] = (compare ?? []).map((r: any) => ({ time: r.recorded_at, value: Number(r.value) }));
    setCurrentPeriod(currentData);
    setComparePeriod(compareData);

    // Build summary stats across all metrics
    const { data: allCurrent } = await supabase
      .from('kpi_snapshots')
      .select('metric, value')
      .eq('org_id', profile?.org_id)
      .gte('recorded_at', new Date(dateFrom).toISOString())
      .lte('recorded_at', new Date(dateTo).toISOString() + 'T23:59:59');
    const { data: allPrev } = await supabase
      .from('kpi_snapshots')
      .select('metric, value')
      .eq('org_id', profile?.org_id)
      .gte('recorded_at', new Date(compareFrom).toISOString())
      .lte('recorded_at', new Date(compareTo).toISOString() + 'T23:59:59');

    const stats = METRICS.map((m) => {
      const cur = (allCurrent ?? []).filter((r: any) => r.metric === m);
      const prev = (allPrev ?? []).filter((r: any) => r.metric === m);
      const curAvg = cur.length ? cur.reduce((s: number, r: any) => s + Number(r.value), 0) / cur.length : 0;
      const prevAvg = prev.length ? prev.reduce((s: number, r: any) => s + Number(r.value), 0) / prev.length : 0;
      const change = prevAvg ? ((curAvg - prevAvg) / prevAvg) * 100 : 0;
      return { label: m.replace(/_/g, ' '), current: curAvg, previous: prevAvg, change };
    });
    setSummaryStats(stats);
    setLoading(false);
  };

  const exportCSV = () => {
    const rows = currentPeriod.map((p) => ({ time: p.time, value: p.value.toFixed(2) }));
    const csv = ['time,value', ...rows.map((r) => `${r.time},${r.value}`)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_${reportType}_${dateFrom}_to_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const generateReport = async () => {
    if (!canExport) return;
    const typeName = REPORT_TYPES.find((r) => r.id === reportType)?.label ?? reportType;
    await supabase.from('reports').insert({
      org_id: profile?.org_id,
      name: `${typeName} — ${dateFrom} to ${dateTo}`,
      report_type: reportType,
      config: { metric: selectedMetric, ward: wardFilter, compareFrom, compareTo },
      date_from: new Date(dateFrom).toISOString(),
      date_to: new Date(dateTo).toISOString(),
      status: 'completed',
      format: 'csv',
      generated_by: profile?.id,
      completed_at: new Date().toISOString(),
    });
    exportCSV();
    setActiveTab('history');
  };

  const totalPages = Math.ceil(100 / pageSize);

  return (
    <div>
      <PageHeader
        title="Reports & Analytics"
        subtitle="Generate filtered reports with comparison periods, drill-downs, and export capabilities."
        breadcrumbs={[{ label: 'Home' }, { label: 'Reports & Analytics' }]}
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {[
          { id: 'generate', label: 'Generate Report', icon: <BarChart3 size={14} /> },
          { id: 'history', label: 'Report History', icon: <Clock size={14} /> },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.id ? 'bg-sky-500/15 text-sky-400 ring-1 ring-inset ring-sky-500/30' : 'bg-slate-800/40 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'generate' && (
        <div className="space-y-4">
          {/* Report type selection */}
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-200">Report Type</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {REPORT_TYPES.map((rt) => (
                <button key={rt.id} onClick={() => setReportType(rt.id)}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    reportType === rt.id ? 'border-sky-500/40 bg-sky-500/5' : 'border-slate-700/40 bg-slate-800/30 hover:border-slate-600'
                  }`}>
                  <p className="text-sm font-medium text-slate-200">{rt.label}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{rt.desc}</p>
                </button>
              ))}
            </div>
          </Card>

          {/* Filters */}
          <Card className="p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200"><Filter size={15} /> Filters & Comparison</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-[10px] font-medium text-slate-500">Current Period From</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 focus:border-sky-500/50 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-slate-500">Current Period To</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 focus:border-sky-500/50 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-slate-500">Compare From</label>
                <input type="date" value={compareFrom} onChange={(e) => setCompareFrom(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 focus:border-sky-500/50 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-slate-500">Compare To</label>
                <input type="date" value={compareTo} onChange={(e) => setCompareTo(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 focus:border-sky-500/50 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-slate-500">Metric</label>
                <select value={selectedMetric} onChange={(e) => setSelectedMetric(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 focus:border-sky-500/50 focus:outline-none">
                  {METRICS.map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-slate-500">Ward</label>
                <select value={wardFilter} onChange={(e) => setWardFilter(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 focus:border-sky-500/50 focus:outline-none">
                  <option value="all">All Wards</option>
                  {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={generatePreview} loading={loading}>
                <BarChart3 size={14} /> Preview
              </Button>
              {canExport && (
                <>
                  <Button size="sm" variant="secondary" onClick={exportCSV} disabled={currentPeriod.length === 0}>
                    <Download size={14} /> Export CSV
                  </Button>
                  <Button size="sm" variant="primary" onClick={generateReport} disabled={currentPeriod.length === 0}>
                    <Save size={14} /> Generate & Save Report
                  </Button>
                </>
              )}
            </div>
          </Card>

          {/* Summary stats */}
          {summaryStats.length > 0 && (
            <Card className="p-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-200">Period Comparison Summary</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {summaryStats.map((s) => (
                  <div key={s.label} className="rounded-lg bg-slate-800/40 p-3">
                    <p className="text-[10px] text-slate-500 capitalize">{s.label}</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-lg font-semibold text-slate-100">{s.current.toFixed(1)}</p>
                      <span className="text-[10px] text-slate-500">vs {s.previous.toFixed(1)}</span>
                    </div>
                    <p className={`text-xs ${s.change > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {s.change > 0 ? '+' : ''}{s.change.toFixed(1)}%
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Chart preview */}
          {currentPeriod.length > 0 && (
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-slate-200">
                {selectedMetric.replace(/_/g, ' ')} — Current vs Comparison Period
              </h3>
              <LineChart data={currentPeriod} height={280} color="#38bdf8" showActual />
              {comparePeriod.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-[10px] text-slate-500">Comparison Period Trend</p>
                  <LineChart data={comparePeriod} height={120} color="#a78bfa" />
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-700/40 px-5 py-3">
            <h3 className="text-sm font-semibold text-slate-200">Generated Reports</h3>
          </div>
          {loading ? (
            <LoadingSpinner label="Loading reports…" />
          ) : reports.length === 0 ? (
            <EmptyState icon={<FileText size={32} />} title="No reports generated yet" description="Generate a report from the Generate Report tab." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-700/50 bg-slate-800/30 text-xs text-slate-400">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Report Name</th>
                    <th className="px-4 py-3 text-left font-medium">Type</th>
                    <th className="px-4 py-3 text-left font-medium">Period</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Generated By</th>
                    <th className="px-4 py-3 text-left font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {reports.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3 text-slate-200">{r.name}</td>
                      <td className="px-4 py-3 text-slate-400">{r.report_type.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3 text-[11px] text-slate-500">
                        {r.date_from ? new Date(r.date_from).toLocaleDateString() : '—'} → {r.date_to ? new Date(r.date_to).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={r.status === 'completed' ? 'success' : r.status === 'pending' ? 'warning' : 'neutral'}>
                          {r.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">{(Array.isArray(r.generated_by) ? r.generated_by[0]?.full_name : r.generated_by?.full_name) ?? '—'}</td>
                      <td className="px-4 py-3 text-[11px] text-slate-500">{new Date(r.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="border-t border-slate-700/30 px-4">
            <Pagination page={page} pageSize={pageSize} count={100} onPageChange={setPage} />
          </div>
        </Card>
      )}
    </div>
  );
}
