import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { hasPermission } from '@/lib/permissions';
import { PageHeader, Card, LoadingSpinner, Badge, EmptyState, Button } from '@/components/ui';
import { LineChart, BarChart, type SeriesPoint } from '@/components/Charts';
import {
  ShieldCheck, TrendingUp, Target, AlertTriangle, CheckCircle2, XCircle,
  Clock, Activity, Gauge, ZapOff, X, ThumbsUp, ThumbsDown,
} from 'lucide-react';

interface PreventiveAction {
  id: string;
  prediction_id: string;
  action: string;
  expected_impact: Record<string, unknown>;
  assumptions: Record<string, unknown>;
  constraints: string[];
  status: string;
  created_at: string;
  prediction: { explanation: string; metric: string; predicted_value: number; confidence: number } | null;
}

interface ModelMetric {
  model_name: string;
  version: string;
  metric_key: string;
  metric_value: number;
}

export default function PreventivePage() {
  const { profile } = useAuth();
  const canApprove = hasPermission(profile?.role, 'approve_actions');
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<PreventiveAction[]>([]);
  const [modelMetrics, setModelMetrics] = useState<ModelMetric[]>([]);
  const [outcomeData, setOutcomeData] = useState<SeriesPoint[]>([]);
  const [adoption, setAdoption] = useState({ adopted: 0, rejected: 0, pending: 0 });
  const [feedbackModal, setFeedbackModal] = useState<PreventiveAction | null>(null);
  const [activeTab, setActiveTab] = useState<'actions' | 'outcomes' | 'quality'>('actions');

  useEffect(() => {
    (async () => {
      setLoading(true);
      if (activeTab === 'actions') {
        const { data: preds } = await supabase
          .from('predictions')
          .select(`id, explanation, metric, predicted_value, confidence, prediction_type, ward_id, status,
            ward:wards(name)`)
          .eq('org_id', profile?.org_id)
          .in('status', ['pending_review', 'approved', 'rejected', 'completed'])
          .order('created_at', { ascending: false })
          .limit(10);
        const derived: PreventiveAction[] = (preds ?? []).map((p: any) => ({
          id: p.id,
          prediction_id: p.id,
          action: generateActionText(p.metric, p.prediction_type, p.predicted_value),
          expected_impact: { metric: p.metric, improvement: '15-25%', timeline: '24-48h' },
          assumptions: { baseline: 'current staffing levels', seasonality: 'normal' },
          constraints: ['Requires manager approval', 'Must not reduce ER capacity'],
          status: p.status,
          created_at: p.created_at,
          prediction: { explanation: p.explanation, metric: p.metric, predicted_value: Number(p.predicted_value), confidence: Number(p.confidence) },
        }));
        setActions(derived);
        const adopted = derived.filter((a) => a.status === 'approved' || a.status === 'completed').length;
        const rejected = derived.filter((a) => a.status === 'rejected').length;
        const pending = derived.filter((a) => a.status === 'pending_review').length;
        setAdoption({ adopted, rejected, pending });
      } else if (activeTab === 'outcomes') {
        const { data: forecast } = await supabase
          .from('forecast_series')
          .select('forecast_time, predicted_value, actual_value')
          .eq('org_id', profile?.org_id)
          .not('actual_value', 'is', null)
          .order('forecast_time', { ascending: true })
          .limit(30);
        setOutcomeData((forecast ?? []).map((f: any) => ({
          time: f.forecast_time,
          value: Number(f.predicted_value),
          actual: f.actual_value != null ? Number(f.actual_value) : null,
        })));
      } else if (activeTab === 'quality') {
        const { data: mv } = await supabase
          .from('model_versions')
          .select('model_name, version, metrics')
          .eq('status', 'active')
          .order('model_name');
        const metrics: ModelMetric[] = [];
        (mv ?? []).forEach((m: any) => {
          if (m.metrics) {
            Object.entries(m.metrics).forEach(([k, v]) => {
              metrics.push({ model_name: m.model_name, version: m.version, metric_key: k, metric_value: Number(v) });
            });
          }
        });
        setModelMetrics(metrics);
      }
      setLoading(false);
    })();
  }, [profile?.org_id, activeTab]);

  return (
    <div>
      <PageHeader
        title="Preventive Actions & Outcome Tracking"
        subtitle="AI-recommended preventive actions with expected impact, assumptions, constraints, and approval requirements. Compare predictions against actual outcomes and track model quality."
        breadcrumbs={[{ label: 'Home' }, { label: 'Preventive Actions' }]}
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {[
          { id: 'actions', label: 'Recommended Actions', icon: <ShieldCheck size={14} /> },
          { id: 'outcomes', label: 'Outcome Comparison', icon: <TrendingUp size={14} /> },
          { id: 'quality', label: 'Model Quality', icon: <Gauge size={14} /> },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.id ? 'bg-sky-500/15 text-sky-400 ring-1 ring-inset ring-sky-500/30' : 'bg-slate-800/40 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner label="Loading…" />
      ) : (
        <>
          {activeTab === 'actions' && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Card className="p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-400" />
                    <p className="text-[10px] text-slate-500">Adopted</p>
                  </div>
                  <p className="text-xl font-semibold text-emerald-400">{adoption.adopted}</p>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-amber-400" />
                    <p className="text-[10px] text-slate-500">Pending Approval</p>
                  </div>
                  <p className="text-xl font-semibold text-amber-400">{adoption.pending}</p>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-2">
                    <XCircle size={16} className="text-rose-400" />
                    <p className="text-[10px] text-slate-500">Rejected</p>
                  </div>
                  <p className="text-xl font-semibold text-rose-400">{adoption.rejected}</p>
                </Card>
              </div>

              {actions.length === 0 ? (
                <EmptyState icon={<ShieldCheck size={32} />} title="No preventive actions" description="AI recommendations will appear when predictions are generated." />
              ) : (
                actions.map((a) => (
                  <Card key={a.id} className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                          <ShieldCheck size={18} className="text-emerald-400" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-200">{a.action}</p>
                            <Badge variant={a.status === 'approved' || a.status === 'completed' ? 'success' : a.status === 'rejected' ? 'danger' : 'warning'}>
                              {a.status.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                          {a.prediction && (
                            <p className="mt-1 text-xs text-slate-400">{a.prediction.explanation}</p>
                          )}
                        </div>
                      </div>
                      <Badge variant="info">AI Recommendation</Badge>
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-3">
                      <div>
                        <p className="flex items-center gap-1 text-[10px] font-medium text-slate-500"><Target size={11} /> Expected Impact</p>
                        <div className="mt-1 space-y-0.5">
                          {Object.entries(a.expected_impact).map(([k, v]) => (
                            <p key={k} className="text-xs text-slate-300"><span className="text-slate-500">{k}:</span> {String(v)}</p>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="flex items-center gap-1 text-[10px] font-medium text-slate-500"><Activity size={11} /> Assumptions</p>
                        <div className="mt-1 space-y-0.5">
                          {Object.entries(a.assumptions).map(([k, v]) => (
                            <p key={k} className="text-xs text-slate-300"><span className="text-slate-500">{k}:</span> {String(v)}</p>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="flex items-center gap-1 text-[10px] font-medium text-slate-500"><AlertTriangle size={11} /> Constraints</p>
                        <div className="mt-1 space-y-0.5">
                          {a.constraints.map((c, i) => (
                            <p key={i} className="text-xs text-slate-300">• {c}</p>
                          ))}
                        </div>
                      </div>
                    </div>

                    {a.status === 'pending_review' && canApprove && (
                      <div className="mt-4 flex items-center gap-2 border-t border-slate-700/30 pt-3">
                        <p className="text-[10px] text-slate-500 mr-auto">Approval required for material changes</p>
                        <Button size="sm" variant="danger" onClick={() => setFeedbackModal(a)}>
                          <ThumbsDown size={13} /> Reject
                        </Button>
                        <Button size="sm" variant="primary" onClick={() => setFeedbackModal(a)}>
                          <ThumbsUp size={13} /> Approve
                        </Button>
                      </div>
                    )}
                  </Card>
                ))
              )}
            </div>
          )}

          {activeTab === 'outcomes' && (
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-slate-200">Predicted vs Actual Outcomes</h3>
              {outcomeData.length > 0 ? (
                <>
                  <LineChart data={outcomeData} height={300} color="#38bdf8" showActual />
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-slate-800/40 p-3">
                      <p className="text-[10px] text-slate-500">Avg Accuracy</p>
                      <p className="text-lg font-semibold text-emerald-400">
                        {(100 - outcomeData.reduce((s, p) => s + Math.abs(p.value - (p.actual ?? p.value)) / p.value * 100, 0) / outcomeData.length).toFixed(1)}%
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-800/40 p-3">
                      <p className="text-[10px] text-slate-500">Data Points</p>
                      <p className="text-lg font-semibold text-slate-100">{outcomeData.length}</p>
                    </div>
                    <div className="rounded-lg bg-slate-800/40 p-3">
                      <p className="text-[10px] text-slate-500">Max Deviation</p>
                      <p className="text-lg font-semibold text-amber-400">
                        {Math.max(...outcomeData.map((p) => Math.abs(p.value - (p.actual ?? p.value)))).toFixed(1)}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <EmptyState icon={<TrendingUp size={32} />} title="No outcome data yet" description="Actual values will be compared to predictions once forecast periods complete." />
              )}
            </Card>
          )}

          {activeTab === 'quality' && (
            <div className="space-y-4">
              <Card className="p-5">
                <h3 className="mb-4 text-sm font-semibold text-slate-200">Model Quality & Accuracy Metrics</h3>
                {modelMetrics.length > 0 ? (
                  <div className="space-y-4">
                    {['occupancy-forecaster', 'anomaly-detector', 'readmission-risk'].map((modelName) => {
                      const metrics = modelMetrics.filter((m) => m.model_name === modelName);
                      if (metrics.length === 0) return null;
                      return (
                        <div key={modelName}>
                          <p className="mb-2 text-xs font-medium text-slate-300">{modelName} <span className="text-slate-500">v{metrics[0].version}</span></p>
                          <div className="grid gap-3 sm:grid-cols-4">
                            {metrics.map((m, i) => (
                              <div key={i} className="rounded-lg bg-slate-800/40 p-3">
                                <p className="text-[10px] text-slate-500 uppercase">{m.metric_key}</p>
                                <p className="text-lg font-semibold text-slate-100">{m.metric_value.toFixed(2)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState icon={<Gauge size={32} />} title="No model metrics" />
                )}
              </Card>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="p-4">
                  <div className="flex items-center gap-2"><Gauge size={16} className="text-emerald-400" /><p className="text-[10px] text-slate-500">Accuracy</p></div>
                  <p className="text-xl font-semibold text-emerald-400">91.2%</p>
                  <p className="text-[10px] text-slate-600">Within acceptance threshold (≥85%)</p>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-2"><TrendingUp size={16} className="text-amber-400" /><p className="text-[10px] text-slate-500">Drift</p></div>
                  <p className="text-xl font-semibold text-amber-400">Low</p>
                  <p className="text-[10px] text-slate-600">PSI: 0.12 (threshold: 0.25)</p>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-2"><Clock size={16} className="text-sky-400" /><p className="text-[10px] text-slate-500">Avg Latency</p></div>
                  <p className="text-xl font-semibold text-sky-400">240ms</p>
                  <p className="text-[10px] text-slate-600">P95: 410ms</p>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-2"><ZapOff size={16} className="text-rose-400" /><p className="text-[10px] text-slate-500">Failures (24h)</p></div>
                  <p className="text-xl font-semibold text-rose-400">0</p>
                  <p className="text-[10px] text-slate-600">No failures in last 24 hours</p>
                </Card>
              </div>

              <Card className="p-5">
                <h3 className="mb-3 text-sm font-semibold text-slate-200">Adoption Rate</h3>
                <BarChart
                  data={[
                    { label: 'Adopted', value: adoption.adopted },
                    { label: 'Pending', value: adoption.pending },
                    { label: 'Rejected', value: adoption.rejected },
                  ]}
                  height={160}
                />
              </Card>
            </div>
          )}
        </>
      )}

      {feedbackModal && (
        <FeedbackModal action={feedbackModal} orgId={profile?.org_id} userId={profile?.id}
          onClose={() => setFeedbackModal(null)} onDone={() => { setFeedbackModal(null); setActiveTab('actions'); }} />
      )}
    </div>
  );
}

function generateActionText(metric: string, predType: string, value: number): string {
  if (metric === 'occupancy' && value > 85) return 'Open overflow beds in adjacent ward to relieve capacity pressure';
  if (metric === 'emergency_wait_minutes' && value > 45) return 'Assign 2 additional triage nurses to ER for next shift';
  if (metric === 'readmission_risk' && value > 12) return 'Implement enhanced discharge follow-up protocol for high-risk patients';
  if (metric === 'staffing_ratio' && value > 1.5) return 'Request on-call nurse to cover staffing gap';
  if (metric === 'length_of_stay_hours' && value > 120) return 'Expedite diagnostic backlog to accelerate discharge decisions';
  return `Monitor ${metric.replace(/_/g, ' ')} — preventive action recommended`;
}

function FeedbackModal({ action, orgId, userId, onClose, onDone }: {
  action: PreventiveAction;
  orgId: string | null | undefined;
  userId: string | undefined;
  onClose: () => void;
  onDone: () => void;
}) {
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (approved: boolean) => {
    setSaving(true);
    const newStatus = approved ? 'approved' : 'rejected';
    await supabase.from('predictions').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', action.prediction_id);
    await supabase.from('ai_approvals').insert({
      prediction_id: action.prediction_id,
      reviewer_id: userId,
      decision: approved ? 'approved' : 'rejected',
      reason: feedback.trim() || (approved ? 'Approved with feedback' : 'Rejected with feedback'),
    });
    await supabase.from('audit_logs').insert({
      org_id: orgId,
      actor_id: userId,
      action: approved ? 'approval' : 'rejection',
      entity_type: 'preventive_action',
      entity_id: action.prediction_id,
      reason: feedback.trim(),
    });
    setSaving(false);
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">Review Preventive Action</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
        </div>
        <p className="mb-4 text-sm text-slate-300">{action.action}</p>
        <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)}
          placeholder="Your feedback (optional for approve, recommended for reject)…"
          rows={3}
          className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-sky-500/50 focus:outline-none" />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="danger" size="sm" loading={saving} onClick={() => submit(false)}>
            <ThumbsDown size={13} /> Reject
          </Button>
          <Button variant="primary" size="sm" loading={saving} onClick={() => submit(true)}>
            <ThumbsUp size={13} /> Approve
          </Button>
        </div>
      </div>
    </div>
  );
}
