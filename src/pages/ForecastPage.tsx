import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { PageHeader, Card, LoadingSpinner, Badge, EmptyState, Button, StatusDot } from '@/components/ui';
import { LineChart, HeatMapGrid, type SeriesPoint } from '@/components/Charts';
import { Pagination } from '@/components/TableControls';
import {
  TrendingUp, AlertTriangle, Layers, Settings2, X, ChevronDown, ChevronRight,
} from 'lucide-react';

interface ForecastPoint {
  id: string;
  metric: string;
  forecast_time: string;
  predicted_value: number;
  confidence_low: number;
  confidence_high: number;
  actual_value: number | null;
  ward: { name: string; code: string } | { name: string; code: string }[] | null;
}

interface AnomalyRow {
  id: string;
  metric: string;
  predicted_value: number;
  actual_value: number;
  deviation: number;
  severity: string;
  confidence: number;
  explanation: string;
  contributing_variables: Record<string, unknown>;
  status: string;
  ward: { name: string; code: string } | { name: string; code: string }[] | null;
  created_at: string;
}

interface ThresholdRow {
  id: string;
  metric: string;
  warning_value: number;
  critical_value: number;
  direction: string;
  enabled: boolean;
  ward: { name: string } | { name: string }[] | null;
}

const METRIC_LABELS: Record<string, string> = {
  occupancy: 'Occupancy %',
  emergency_wait_minutes: 'ER Wait (min)',
  bed_turnover_hours: 'Bed Turnover (h)',
  length_of_stay_hours: 'Length of Stay (h)',
  staffing_ratio: 'Staffing Ratio',
  readmission_risk: 'Readmission Risk %',
};

export default function ForecastPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'forecasts' | 'capacity' | 'anomalies' | 'thresholds'>('forecasts');
  const [forecastMetric, setForecastMetric] = useState('occupancy');
  const [forecastWard, setForecastWard] = useState('all');
  const [wards, setWards] = useState<{ id: string; name: string }[]>([]);
  const [forecastData, setForecastData] = useState<ForecastPoint[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyRow[]>([]);
  const [thresholds, setThresholds] = useState<ThresholdRow[]>([]);
  const [selectedAnomaly, setSelectedAnomaly] = useState<AnomalyRow | null>(null);
  const [anomalyPage, setAnomalyPage] = useState(1);
  const [capacityData, setCapacityData] = useState<{ ward: string; values: number[][] } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: w } = await supabase.from('wards').select('id, name').eq('org_id', profile?.org_id).order('name');
      setWards(w ?? []);
    })();
  }, [profile?.org_id]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      if (activeTab === 'forecasts') {
        let q = supabase
          .from('forecast_series')
          .select(`
            id, metric, forecast_time, predicted_value, confidence_low, confidence_high, actual_value,
            ward:wards(name, code)
          `)
          .eq('org_id', profile?.org_id)
          .eq('metric', forecastMetric)
          .order('forecast_time', { ascending: true });
        if (forecastWard !== 'all') q = q.eq('ward_id', forecastWard);
        const { data } = await q;
        setForecastData((data ?? []) as unknown as ForecastPoint[]);
      } else if (activeTab === 'anomalies') {
        const { data } = await supabase
          .from('anomaly_events')
          .select(`
            id, metric, predicted_value, actual_value, deviation, severity, confidence,
            explanation, contributing_variables, status, created_at,
            ward:wards(name, code)
          `)
          .eq('org_id', profile?.org_id)
          .order('created_at', { ascending: false });
        setAnomalies((data ?? []) as unknown as AnomalyRow[]);
      } else if (activeTab === 'thresholds') {
        const { data } = await supabase
          .from('thresholds')
          .select(`
            id, metric, warning_value, critical_value, direction, enabled,
            ward:wards(name)
          `)
          .eq('org_id', profile?.org_id)
          .order('metric');
        setThresholds((data ?? []) as unknown as ThresholdRow[]);
      } else if (activeTab === 'capacity') {
        // Build capacity heat map from KPI occupancy data per ward x day
        const { data: kpi } = await supabase
          .from('kpi_snapshots')
          .select('ward_id, value, recorded_at, ward:wards(name)')
          .eq('org_id', profile?.org_id)
          .eq('metric', 'occupancy')
          .order('recorded_at', { ascending: true });
        if (kpi && kpi.length > 0) {
          const wardMap: Record<string, string> = {};
          kpi.forEach((r: any) => { if (r.ward) wardMap[r.ward_id] = r.ward.name; });
          const wardIds = Object.keys(wardMap);
          const dayMap: Record<string, number> = {};
          kpi.forEach((r: any) => {
            const d = new Date(r.recorded_at).toLocaleDateString('en-US', { weekday: 'short' });
            dayMap[d] = (dayMap[d] ?? 0) + 1;
          });
          const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
          const values: number[][] = wardIds.map((wid) => {
            return days.map((d) => {
              const rows = kpi.filter((r: any) => r.ward_id === wid && new Date(r.recorded_at).toLocaleDateString('en-US', { weekday: 'short' }) === d);
              if (rows.length === 0) return 0;
              return rows.reduce((s: number, r: any) => s + Number(r.value), 0) / rows.length;
            });
          });
          setCapacityData({ ward: wardIds.map((w) => wardMap[w]).join(','), values });
        }
      }
      setLoading(false);
    })();
  }, [profile?.org_id, activeTab, forecastMetric, forecastWard]);

  const forecastSeries: SeriesPoint[] = useMemo(() =>
    forecastData.map((f) => ({
      time: f.forecast_time,
      value: Number(f.predicted_value),
      actual: f.actual_value != null ? Number(f.actual_value) : null,
    })), [forecastData]);

  const anomalyPageSize = 6;
  const pagedAnomalies = anomalies.slice((anomalyPage - 1) * anomalyPageSize, anomalyPage * anomalyPageSize);

  return (
    <div>
      <PageHeader
        title="Forecast, Capacity & Risk Analysis"
        subtitle="Demand and workload forecasts, capacity heat maps, anomaly markers, and configurable alert thresholds."
        breadcrumbs={[{ label: 'Home' }, { label: 'Forecast & Capacity' }]}
      />

      {/* Tabs */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {[
          { id: 'forecasts', label: 'Demand Forecasts', icon: <TrendingUp size={14} /> },
          { id: 'capacity', label: 'Capacity Heat Map', icon: <Layers size={14} /> },
          { id: 'anomalies', label: 'Anomaly Markers', icon: <AlertTriangle size={14} /> },
          { id: 'thresholds', label: 'Alert Thresholds', icon: <Settings2 size={14} /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-sky-500/15 text-sky-400 ring-1 ring-inset ring-sky-500/30'
                : 'bg-slate-800/40 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner label="Loading analysis…" />
      ) : (
        <>
          {activeTab === 'forecasts' && (
            <div className="space-y-4">
              <Card className="p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-slate-500">Metric</label>
                    <select
                      value={forecastMetric}
                      onChange={(e) => setForecastMetric(e.target.value)}
                      className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 focus:border-sky-500/50 focus:outline-none"
                    >
                      {Object.entries(METRIC_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-slate-500">Ward</label>
                    <select
                      value={forecastWard}
                      onChange={(e) => setForecastWard(e.target.value)}
                      className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 focus:border-sky-500/50 focus:outline-none"
                    >
                      <option value="all">All Wards</option>
                      {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                </div>
              </Card>
              <Card className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-200">
                    {METRIC_LABELS[forecastMetric] ?? forecastMetric} — 72h Forecast
                  </h3>
                  <div className="flex items-center gap-3 text-[10px]">
                    <div className="flex items-center gap-1.5"><span className="h-2 w-4 rounded bg-sky-400" /> Predicted</div>
                    <div className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-slate-400" style={{ borderTop: '2px dashed' }} /> Actual</div>
                  </div>
                </div>
                {forecastSeries.length > 0 ? (
                  <>
                    <LineChart data={forecastSeries} height={280} color="#38bdf8" showActual unit={forecastMetric.includes('occupancy') || forecastMetric.includes('risk') ? '%' : ''} />
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg bg-slate-800/40 p-3">
                        <p className="text-[10px] text-slate-500">Peak Forecast</p>
                        <p className="text-lg font-semibold text-slate-100">
                          {Math.max(...forecastSeries.map((p) => p.value)).toFixed(1)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-800/40 p-3">
                        <p className="text-[10px] text-slate-500">Avg Confidence Range</p>
                        <p className="text-lg font-semibold text-slate-100">
                          ±{((Math.max(...forecastData.map((f) => f.confidence_high - f.predicted_value))) || 0).toFixed(1)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-800/40 p-3">
                        <p className="text-[10px] text-slate-500">Horizon</p>
                        <p className="text-lg font-semibold text-slate-100">72 hours</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <EmptyState icon={<TrendingUp size={32} />} title="No forecast data" description="No forecasts available for this metric/ward combination." />
                )}
              </Card>
            </div>
          )}

          {activeTab === 'capacity' && (
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-slate-200">Ward Capacity Heat Map (Occupancy % by Day)</h3>
              {capacityData ? (
                <HeatMapGrid
                  rows={capacityData.values.length}
                  cols={7}
                  values={capacityData.values}
                  rowLabels={capacityData.ward.split(',')}
                  colLabels={['Mon','Tue','Wed','Thu','Fri','Sat','Sun']}
                />
              ) : (
                <EmptyState icon={<Layers size={32} />} title="No capacity data" description="No occupancy data available to build heat map." />
              )}
              <div className="mt-4 flex items-center gap-3 text-[10px] text-slate-500">
                <span>Low</span>
                <div className="flex gap-0.5">
                  {[200, 60, 30, 0].map((h, i) => (
                    <div key={i} className="h-3 w-6 rounded-sm" style={{ backgroundColor: `hsl(${h} 60% 45%)` }} />
                  ))}
                </div>
                <span>High</span>
              </div>
            </Card>
          )}

          {activeTab === 'anomalies' && (
            <Card className="overflow-hidden">
              <div className="border-b border-slate-700/40 px-5 py-3">
                <h3 className="text-sm font-semibold text-slate-200">Anomaly Markers — Predicted vs Actual</h3>
              </div>
              {anomalies.length === 0 ? (
                <EmptyState icon={<AlertTriangle size={32} />} title="No anomalies detected" description="All metrics within expected range." />
              ) : (
                <div className="divide-y divide-slate-700/30">
                  {pagedAnomalies.map((a) => (
                    <div
                      key={a.id}
                      className="flex cursor-pointer items-center justify-between px-5 py-4 transition-colors hover:bg-slate-800/30"
                      onClick={() => setSelectedAnomaly(a)}
                    >
                      <div className="flex items-center gap-4">
                        <StatusDot status={a.severity === 'critical' ? 'critical' : 'warning'} />
                        <div>
                          <p className="text-sm font-medium text-slate-200">{METRIC_LABELS[a.metric] ?? a.metric.replace(/_/g, ' ')}</p>
                          <p className="text-[11px] text-slate-500">
                            {(Array.isArray(a.ward) ? a.ward[0]?.name : a.ward?.name) ?? '—'} · Predicted {a.predicted_value.toFixed(1)} → Actual {a.actual_value.toFixed(1)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={a.severity === 'critical' ? 'critical' : 'warning'}>
                          {a.severity}
                        </Badge>
                        <Badge variant="info">Conf {Math.round(a.confidence * 100)}%</Badge>
                        <Badge variant={a.status === 'pending_review' ? 'warning' : 'neutral'}>
                          {a.status.replace(/_/g, ' ')}
                        </Badge>
                        <ChevronRight size={16} className="text-slate-600" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="border-t border-slate-700/30 px-4">
                <Pagination page={anomalyPage} pageSize={anomalyPageSize} count={anomalies.length} onPageChange={setAnomalyPage} />
              </div>
            </Card>
          )}

          {activeTab === 'thresholds' && (
            <Card className="overflow-hidden">
              <div className="border-b border-slate-700/40 px-5 py-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200">Configurable Alert Thresholds</h3>
              </div>
              {thresholds.length === 0 ? (
                <EmptyState icon={<Settings2 size={32} />} title="No thresholds configured" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-700/50 bg-slate-800/30 text-xs text-slate-400">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Metric</th>
                        <th className="px-4 py-3 text-left font-medium">Ward</th>
                        <th className="px-4 py-3 text-left font-medium">Warning</th>
                        <th className="px-4 py-3 text-left font-medium">Critical</th>
                        <th className="px-4 py-3 text-left font-medium">Direction</th>
                        <th className="px-4 py-3 text-left font-medium">Enabled</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/30">
                      {thresholds.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-800/30">
                          <td className="px-4 py-3 text-slate-200">{METRIC_LABELS[t.metric] ?? t.metric.replace(/_/g, ' ')}</td>
                          <td className="px-4 py-3 text-slate-400">{(Array.isArray(t.ward) ? t.ward[0]?.name : t.ward?.name) ?? 'All'}</td>
                          <td className="px-4 py-3"><Badge variant="warning">{t.warning_value}</Badge></td>
                          <td className="px-4 py-3"><Badge variant="critical">{t.critical_value}</Badge></td>
                          <td className="px-4 py-3 text-slate-400">{t.direction}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-block h-2 w-2 rounded-full ${t.enabled ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {/* Anomaly drill-down drawer */}
      {selectedAnomaly && (
        <AnomalyDrillDown anomaly={selectedAnomaly} onClose={() => setSelectedAnomaly(null)} />
      )}
    </div>
  );
}

function AnomalyDrillDown({ anomaly, onClose }: { anomaly: AnomalyRow; onClose: () => void }) {
  const vars = Object.entries(anomaly.contributing_variables || {});
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-slate-700 bg-slate-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-700/50 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-100">Anomaly Drill-Down</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="rounded-lg border border-slate-700/40 bg-slate-800/30 p-4">
            <div className="flex items-center gap-2">
              <StatusDot status={anomaly.severity === 'critical' ? 'critical' : 'warning'} />
              <Badge variant={anomaly.severity === 'critical' ? 'critical' : 'warning'}>{anomaly.severity}</Badge>
              <Badge variant="info">Confidence {Math.round(anomaly.confidence * 100)}%</Badge>
            </div>
            <p className="mt-3 text-sm font-medium text-slate-200">{METRIC_LABELS[anomaly.metric] ?? anomaly.metric.replace(/_/g, ' ')}</p>
            <p className="text-xs text-slate-500">{(Array.isArray(anomaly.ward) ? anomaly.ward[0]?.name : anomaly.ward?.name) ?? '—'}</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-slate-800/40 p-3">
              <p className="text-[10px] text-slate-500">Predicted</p>
              <p className="text-lg font-semibold text-slate-100">{anomaly.predicted_value.toFixed(1)}</p>
            </div>
            <div className="rounded-lg bg-slate-800/40 p-3">
              <p className="text-[10px] text-slate-500">Actual</p>
              <p className="text-lg font-semibold text-rose-400">{anomaly.actual_value.toFixed(1)}</p>
            </div>
            <div className="rounded-lg bg-slate-800/40 p-3">
              <p className="text-[10px] text-slate-500">Deviation</p>
              <p className="text-lg font-semibold text-amber-400">+{anomaly.deviation.toFixed(1)}</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400">Explanation</p>
            <p className="mt-1 text-sm text-slate-300">{anomaly.explanation}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400">Contributing Variables</p>
            <div className="mt-2 space-y-1.5">
              {vars.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between rounded-lg bg-slate-800/40 px-3 py-2">
                  <span className="text-xs text-slate-400">{k.replace(/_/g, ' ')}</span>
                  <span className="text-xs font-medium text-slate-200">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
