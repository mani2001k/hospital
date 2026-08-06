import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { hasPermission } from '@/lib/permissions';
import { PageHeader, Card, LoadingSpinner, Badge, EmptyState, Button } from '@/components/ui';
import {
  Brain, Clock, BarChart3, Database, Tag, CheckCircle2, XCircle,
  AlertTriangle, RefreshCw, X, FileText, Sparkles, Loader2,
} from 'lucide-react';

interface PredictionRow {
  id: string;
  prediction_type: string;
  metric: string;
  predicted_value: number;
  confidence: number;
  confidence_low: number;
  confidence_high: number;
  horizon_hours: number;
  target_time: string;
  explanation: string;
  contributing_inputs: Record<string, unknown>;
  source_data_ref: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  ward: { name: string; code: string } | { name: string; code: string }[] | null;
  model_version: { model_name: string; version: string; id?: string } | { model_name: string; version: string; id?: string }[] | null;
}

function first<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

const TYPE_LABELS: Record<string, string> = {
  demand: 'Demand Forecast',
  workload: 'Workload Forecast',
  resource: 'Resource Requirement',
  service_risk: 'Service Risk',
  anomaly: 'Anomaly Prediction',
  readmission_risk: 'Readmission Risk',
};

const STATUS_STATE: Record<string, 'normal' | 'warning' | 'critical' | 'pending' | 'approved' | 'rejected' | 'completed'> = {
  pending_review: 'pending',
  approved: 'approved',
  rejected: 'rejected',
  completed: 'completed',
};

export default function PredictionsPage() {
  const { profile } = useAuth();
  const canReview = hasPermission(profile?.role, 'approve_actions');
  const [loading, setLoading] = useState(true);
  const [predictions, setPredictions] = useState<PredictionRow[]>([]);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selected, setSelected] = useState<PredictionRow | null>(null);
  const [reviewModal, setReviewModal] = useState<PredictionRow | null>(null);
  const [lowConfidenceOnly, setLowConfidenceOnly] = useState(false);

  const loadPredictions = async () => {
    setLoading(true);
    let q = supabase
      .from('predictions')
      .select(`
        id, prediction_type, metric, predicted_value, confidence, confidence_low, confidence_high,
        horizon_hours, target_time, explanation, contributing_inputs, source_data_ref, status,
        created_at, updated_at,
        ward:wards(name, code),
        model_version:model_versions(model_name, version)
      `)
      .eq('org_id', profile?.org_id)
      .order('created_at', { ascending: false });

    if (filterType !== 'all') q = q.eq('prediction_type', filterType);
    if (filterStatus !== 'all') q = q.eq('status', filterStatus);

    const { data } = await q;
    let rows = (data ?? []) as unknown as PredictionRow[];
    if (lowConfidenceOnly) rows = rows.filter((r) => r.confidence < 0.8);
    setPredictions(rows);
    setLoading(false);
  };

  useEffect(() => {
    loadPredictions();
  }, [profile?.org_id, filterType, filterStatus, lowConfidenceOnly]);

  const stats = {
    total: predictions.length,
    pending: predictions.filter((p) => p.status === 'pending_review').length,
    lowConf: predictions.filter((p) => p.confidence < 0.8).length,
    approved: predictions.filter((p) => p.status === 'approved').length,
  };

  return (
    <div>
      <PageHeader
        title="Demand & Workload Predictions"
        subtitle="AI-generated forecasts with confidence scores, contributing inputs, explanations, and model version tracking."
        breadcrumbs={[{ label: 'Home' }, { label: 'Demand Predictions' }]}
        actions={
          <Button variant="secondary" size="sm" onClick={loadPredictions} loading={loading}>
            <RefreshCw size={14} /> Refresh
          </Button>
        }
      />

      {/* Stats */}
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-[10px] text-slate-500">Total Predictions</p>
          <p className="text-xl font-semibold text-slate-100">{stats.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] text-slate-500">Pending Review</p>
          <p className="text-xl font-semibold text-amber-400">{stats.pending}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] text-slate-500">Low Confidence (&lt;80%)</p>
          <p className="text-xl font-semibold text-rose-400">{stats.lowConf}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] text-slate-500">Approved</p>
          <p className="text-xl font-semibold text-emerald-400">{stats.approved}</p>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[10px] font-medium text-slate-500">Type</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 focus:border-sky-500/50 focus:outline-none">
              <option value="all">All Types</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium text-slate-500">Status</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 focus:border-sky-500/50 focus:outline-none">
              <option value="all">All Statuses</option>
              <option value="pending_review">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={lowConfidenceOnly} onChange={(e) => setLowConfidenceOnly(e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500/30" />
            Low confidence only
          </label>
        </div>
      </Card>

      {loading ? (
        <LoadingSpinner label="Loading predictions…" />
      ) : predictions.length === 0 ? (
        <EmptyState
          icon={<Brain size={32} />}
          title="No predictions available"
          description="AI predictions will appear here when forecast jobs run. Check back later or adjust filters."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {predictions.map((p) => {
            const state = STATUS_STATE[p.status] ?? 'pending';
            const isLowConf = p.confidence < 0.8;
            const ward = first(p.ward);
            const mv = first(p.model_version);
            return (
              <Card key={p.id} className="p-5 transition-shadow hover:shadow-lg hover:shadow-slate-900/50">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/10">
                      <Brain size={18} className="text-sky-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-200">{TYPE_LABELS[p.prediction_type] ?? p.prediction_type}</p>
                      <p className="text-[11px] text-slate-500">
                        {ward?.name ?? 'Network'} · {p.metric.replace(/_/g, ' ')}
                      </p>
                    </div>
                  </div>
                  <Badge variant={state === 'approved' ? 'success' : state === 'rejected' ? 'danger' : state === 'pending' ? 'warning' : 'neutral'}>
                    {p.status.replace(/_/g, ' ')}
                  </Badge>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-slate-800/40 p-3">
                    <p className="text-[10px] text-slate-500">Predicted</p>
                    <p className="text-xl font-bold text-slate-100">{p.predicted_value.toFixed(1)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-800/40 p-3">
                    <p className="text-[10px] text-slate-500">Confidence</p>
                    <p className={`text-xl font-bold ${isLowConf ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {Math.round(p.confidence * 100)}%
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-800/40 p-3">
                    <p className="text-[10px] text-slate-500">Range</p>
                    <p className="text-sm font-medium text-slate-300">
                      {p.confidence_low?.toFixed(1)}–{p.confidence_high?.toFixed(1)}
                    </p>
                  </div>
                </div>

                {isLowConf && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                    <AlertTriangle size={14} /> Low confidence prediction — review before acting.
                  </div>
                )}

                <p className="mt-3 text-xs text-slate-400 line-clamp-2">{p.explanation}</p>

                <div className="mt-4 flex items-center justify-between border-t border-slate-700/30 pt-3">
                  <div className="flex items-center gap-3 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1"><Tag size={11} /> {mv?.model_name ?? '—'} v{mv?.version ?? '—'}</span>
                    <span className="flex items-center gap-1"><Clock size={11} /> {p.horizon_hours}h ahead</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setSelected(p)}>Details</Button>
                    {canReview && p.status === 'pending_review' && (
                      <Button size="sm" variant="primary" onClick={() => setReviewModal(p)}>Review</Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {selected && (
        <PredictionDetail prediction={selected} onClose={() => setSelected(null)} />
      )}
      {reviewModal && (
        <ReviewModal prediction={reviewModal} orgId={profile?.org_id} userId={profile?.id} onClose={() => setReviewModal(null)} onDone={loadPredictions} />
      )}
    </div>
  );
}

function PredictionDetail({ prediction, onClose }: { prediction: PredictionRow; onClose: () => void }) {
  const inputs = Object.entries(prediction.contributing_inputs || {});
  const ward = first(prediction.ward);
  const mv = first(prediction.model_version);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSource, setAiSource] = useState<string>('');

  const fetchAnalysis = async () => {
    setAiLoading(true);
    setAiAnalysis(null);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-analysis`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'prediction',
          orgId: prediction.org_id,
          data: {
            metric: prediction.metric,
            prediction_type: prediction.prediction_type,
            predicted_value: prediction.predicted_value,
            confidence: prediction.confidence,
            confidence_low: prediction.confidence_low,
            confidence_high: prediction.confidence_high,
            horizon_hours: prediction.horizon_hours,
            ward_name: ward?.name,
            explanation: prediction.explanation,
            contributing_inputs: prediction.contributing_inputs,
          },
        }),
      });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const result = await response.json();
      setAiAnalysis(result.analysis ?? 'No analysis returned.');
      setAiSource(result.source ?? 'fallback');
    } catch {
      setAiAnalysis('Unable to generate AI analysis at this time. Please try again later.');
      setAiSource('error');
    }
    setAiLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-slate-700 bg-slate-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-700/50 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-100">Prediction Details</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="rounded-lg border border-slate-700/40 bg-slate-800/30 p-4">
            <div className="flex items-center gap-2">
              <Brain size={18} className="text-sky-400" />
              <p className="text-sm font-medium text-slate-200">{TYPE_LABELS[prediction.prediction_type]}</p>
            </div>
            <p className="mt-1 text-xs text-slate-500">{ward?.name} · {prediction.metric.replace(/_/g, ' ')}</p>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-lg bg-slate-800/40 p-3 text-center">
              <p className="text-[10px] text-slate-500">Predicted</p>
              <p className="text-lg font-bold text-slate-100">{prediction.predicted_value.toFixed(1)}</p>
            </div>
            <div className="rounded-lg bg-slate-800/40 p-3 text-center">
              <p className="text-[10px] text-slate-500">Confidence</p>
              <p className={`text-lg font-bold ${prediction.confidence < 0.8 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {Math.round(prediction.confidence * 100)}%
              </p>
            </div>
            <div className="rounded-lg bg-slate-800/40 p-3 text-center">
              <p className="text-[10px] text-slate-500">Low</p>
              <p className="text-sm font-medium text-slate-300">{prediction.confidence_low?.toFixed(1)}</p>
            </div>
            <div className="rounded-lg bg-slate-800/40 p-3 text-center">
              <p className="text-[10px] text-slate-500">High</p>
              <p className="text-sm font-medium text-slate-300">{prediction.confidence_high?.toFixed(1)}</p>
            </div>
          </div>

          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-slate-400"><FileText size={13} /> Explanation</p>
            <p className="mt-1 text-sm text-slate-300">{prediction.explanation}</p>
          </div>

          <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-sky-400" />
                <p className="text-xs font-semibold text-sky-400">Gemini AI Analysis</p>
              </div>
              <button onClick={fetchAnalysis} disabled={aiLoading}
                className="flex items-center gap-1.5 rounded-lg bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-400 ring-1 ring-inset ring-sky-500/30 transition-colors hover:bg-sky-500/20 disabled:opacity-50">
                {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {aiLoading ? 'Analysing…' : aiAnalysis ? 'Regenerate' : 'Generate'}
              </button>
            </div>
            {aiAnalysis ? (
              <div className="mt-3">
                <p className="text-xs text-slate-300 whitespace-pre-wrap">{aiAnalysis}</p>
                <p className="mt-2 text-[10px] text-slate-500">
                  {aiSource === 'gemini' ? 'Powered by Google Gemini' : aiSource === 'error' ? 'Analysis error' : 'Rule-based fallback — add a Gemini API key for full AI analysis'}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-slate-500">Click "Generate" to get an AI-powered analysis of this prediction with risk factors, recommendations, and confidence assessment.</p>
            )}
          </div>

          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-slate-400"><BarChart3 size={13} /> Contributing Inputs</p>
            <div className="mt-2 space-y-1.5">
              {inputs.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between rounded-lg bg-slate-800/40 px-3 py-2">
                  <span className="text-xs text-slate-400">{k.replace(/_/g, ' ')}</span>
                  <span className="text-xs font-medium text-slate-200">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-slate-400"><Database size={13} /> Source Data</p>
            <p className="mt-1 text-xs text-slate-500 font-mono">{prediction.source_data_ref ?? 'Snapshot stored in AI run record'}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-slate-700/40 pt-4">
            <div>
              <p className="text-[10px] text-slate-500">Model</p>
              <p className="text-xs text-slate-300">{mv?.model_name}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500">Version</p>
              <p className="text-xs text-slate-300">v{mv?.version}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500">Target Time</p>
              <p className="text-xs text-slate-300">{new Date(prediction.target_time).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500">Generated</p>
              <p className="text-xs text-slate-300">{new Date(prediction.created_at).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewModal({ prediction, orgId, userId, onClose, onDone }: {
  prediction: PredictionRow;
  orgId: string | null | undefined;
  userId: string | undefined;
  onClose: () => void;
  onDone: () => void;
}) {
  const [decision, setDecision] = useState<'approved' | 'rejected' | 'overridden'>('approved');
  const [reason, setReason] = useState('');
  const [overrideValue, setOverrideValue] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!reason.trim()) return;
    setSaving(true);
    const newStatus = decision === 'rejected' ? 'rejected' : decision === 'overridden' ? 'completed' : 'approved';
    await supabase.from('predictions').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', prediction.id);
    await supabase.from('ai_approvals').insert({
      prediction_id: prediction.id,
      reviewer_id: userId,
      decision,
      reason: reason.trim(),
      override_value: decision === 'overridden' ? { value: overrideValue } : null,
    });
    await supabase.from('audit_logs').insert({
      org_id: orgId,
      actor_id: userId,
      action: decision === 'approved' ? 'approval' : decision === 'rejected' ? 'rejection' : 'override',
      entity_type: 'prediction',
      entity_id: prediction.id,
      reason: reason.trim(),
      new_value: decision === 'overridden' ? { override: overrideValue } : { decision },
    });
    setSaving(false);
    onDone();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">Review AI Prediction</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-slate-400">{prediction.explanation}</p>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Decision</label>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setDecision('approved')}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${decision === 'approved' ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30' : 'bg-slate-800/40 text-slate-400 hover:text-slate-200'}`}>
                <CheckCircle2 size={14} /> Approve
              </button>
              <button onClick={() => setDecision('rejected')}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${decision === 'rejected' ? 'bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30' : 'bg-slate-800/40 text-slate-400 hover:text-slate-200'}`}>
                <XCircle size={14} /> Reject
              </button>
              <button onClick={() => setDecision('overridden')}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${decision === 'overridden' ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30' : 'bg-slate-800/40 text-slate-400 hover:text-slate-200'}`}>
                <AlertTriangle size={14} /> Override
              </button>
            </div>
          </div>
          {decision === 'overridden' && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Override Value</label>
              <input type="text" value={overrideValue} onChange={(e) => setOverrideValue(e.target.value)}
                placeholder="Corrected value"
                className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-sky-500/50 focus:outline-none" />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Reason (required)</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Explain your decision…"
              rows={3}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-sky-500/50 focus:outline-none" />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} disabled={!reason.trim()} onClick={submit}>Submit Review</Button>
        </div>
      </div>
    </div>
  );
}
