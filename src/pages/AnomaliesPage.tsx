import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { hasPermission } from '@/lib/permissions';
import { PageHeader, Card, LoadingSpinner, Badge, EmptyState, Button, StatusDot } from '@/components/ui';
import {
  AlertTriangle, Brain, CheckCircle2, XCircle, Clock, TrendingUp, TrendingDown,
  X, RefreshCw, MessageSquare, Sparkles, Loader2,
} from 'lucide-react';

interface AnomalyRow {
  id: string;
  metric: string;
  predicted_value: number;
  actual_value: number;
  deviation: number;
  severity: string;
  confidence: number;
  contributing_variables: Record<string, unknown>;
  explanation: string;
  status: string;
  ward: { name: string; code: string } | { name: string; code: string }[] | null;
  created_at: string;
  resolved_at: string | null;
}

interface ApprovalRow {
  id: string;
  decision: string;
  reason: string;
  reviewer: { full_name: string } | { full_name: string }[] | null;
  created_at: string;
}

const METRIC_LABELS: Record<string, string> = {
  occupancy: 'Occupancy %',
  emergency_wait_minutes: 'ER Wait (min)',
  bed_turnover_hours: 'Bed Turnover (h)',
  length_of_stay_hours: 'Length of Stay (h)',
  staffing_ratio: 'Staffing Ratio',
  readmission_risk: 'Readmission Risk %',
};

export default function AnomaliesPage() {
  const { profile } = useAuth();
  const canReview = hasPermission(profile?.role, 'review_anomalies') || hasPermission(profile?.role, 'approve_actions');
  const [loading, setLoading] = useState(true);
  const [anomalies, setAnomalies] = useState<AnomalyRow[]>([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [selected, setSelected] = useState<AnomalyRow | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [reviewMode, setReviewMode] = useState(false);

  const loadAnomalies = async () => {
    setLoading(true);
    let q = supabase
      .from('anomaly_events')
      .select(`
        id, metric, predicted_value, actual_value, deviation, severity, confidence,
        contributing_variables, explanation, status, resolved_at, created_at,
        ward:wards(name, code)
      `)
      .eq('org_id', profile?.org_id)
      .order('created_at', { ascending: false });
    if (filterStatus !== 'all') q = q.eq('status', filterStatus);
    if (filterSeverity !== 'all') q = q.eq('severity', filterSeverity);
    const { data } = await q;
    setAnomalies((data ?? []) as unknown as AnomalyRow[]);
    setLoading(false);
  };

  useEffect(() => {
    loadAnomalies();
  }, [profile?.org_id, filterStatus, filterSeverity]);

  useEffect(() => {
    if (selected) {
      (async () => {
        const { data } = await supabase
          .from('ai_approvals')
          .select(`id, decision, reason, created_at, reviewer:profiles(full_name)`)
          .eq('anomaly_id', selected.id)
          .order('created_at', { ascending: false });
        setApprovals((data ?? []) as unknown as ApprovalRow[]);
      })();
    }
  }, [selected]);

  const stats = {
    total: anomalies.length,
    pending: anomalies.filter((a) => a.status === 'pending_review').length,
    critical: anomalies.filter((a) => a.severity === 'critical').length,
    resolved: anomalies.filter((a) => a.status === 'approved' || a.status === 'rejected' || a.status === 'completed').length,
  };

  return (
    <div>
      <PageHeader
        title="Anomaly & Risk Explanations"
        subtitle="Detected anomalies with contributing variables, severity, confidence, predicted vs actual comparison, and mandatory human review."
        breadcrumbs={[{ label: 'Home' }, { label: 'Anomaly Explanations' }]}
        actions={
          <Button variant="secondary" size="sm" onClick={loadAnomalies} loading={loading}>
            <RefreshCw size={14} /> Refresh
          </Button>
        }
      />

      {/* AI vs Decision banner */}
      <Card className="mb-4 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10">
            <Brain size={16} className="text-sky-400" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-200">AI suggestions are advisory only</p>
            <p className="text-[11px] text-slate-500">
              All anomaly detections require authorised human review before any operational action is taken.
              AI explanations are based on observable inputs and model factors — no hidden reasoning is exposed.
            </p>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-[10px] text-slate-500">Total Anomalies</p>
          <p className="text-xl font-semibold text-slate-100">{stats.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] text-slate-500">Pending Review</p>
          <p className="text-xl font-semibold text-amber-400">{stats.pending}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] text-slate-500">Critical</p>
          <p className="text-xl font-semibold text-rose-400">{stats.critical}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] text-slate-500">Resolved</p>
          <p className="text-xl font-semibold text-emerald-400">{stats.resolved}</p>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[10px] font-medium text-slate-500">Status</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 focus:border-sky-500/50 focus:outline-none">
              <option value="all">All</option>
              <option value="pending_review">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium text-slate-500">Severity</label>
            <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 focus:border-sky-500/50 focus:outline-none">
              <option value="all">All</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>
      </Card>

      {loading ? (
        <LoadingSpinner label="Loading anomalies…" />
      ) : anomalies.length === 0 ? (
        <EmptyState icon={<AlertTriangle size={32} />} title="No anomalies detected" description="All metrics within expected range." />
      ) : (
        <div className="space-y-3">
          {anomalies.map((a) => {
            const isPositive = a.deviation > 0;
            return (
              <Card key={a.id} className="p-5 transition-shadow hover:shadow-lg hover:shadow-slate-900/50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${a.severity === 'critical' ? 'bg-rose-500/10' : 'bg-amber-500/10'}`}>
                      <AlertTriangle size={18} className={a.severity === 'critical' ? 'text-rose-400' : 'text-amber-400'} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-200">{METRIC_LABELS[a.metric] ?? a.metric.replace(/_/g, ' ')}</p>
                        <Badge variant={a.severity === 'critical' ? 'critical' : 'warning'}>{a.severity}</Badge>
                        <Badge variant="info">Conf {Math.round(a.confidence * 100)}%</Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{(Array.isArray(a.ward) ? a.ward[0]?.name : a.ward?.name) ?? '—'}</p>
                      <p className="mt-2 text-sm text-slate-300">{a.explanation}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant={a.status === 'pending_review' ? 'warning' : a.status === 'approved' ? 'success' : a.status === 'rejected' ? 'danger' : 'neutral'}>
                      {a.status.replace(/_/g, ' ')}
                    </Badge>
                    <Button size="sm" variant="ghost" onClick={() => { setSelected(a); setReviewMode(false); }}>Details</Button>
                    {canReview && a.status === 'pending_review' && (
                      <Button size="sm" variant="primary" onClick={() => { setSelected(a); setReviewMode(true); }}>Review</Button>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-700/30 pt-3">
                  <div>
                    <p className="text-[10px] text-slate-500">Predicted</p>
                    <p className="text-sm font-medium text-slate-300">{a.predicted_value.toFixed(1)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500">Actual</p>
                    <p className="text-sm font-medium text-rose-400">{a.actual_value.toFixed(1)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500">Deviation</p>
                    <p className={`flex items-center gap-1 text-sm font-medium ${isPositive ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {isPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                      {isPositive ? '+' : ''}{a.deviation.toFixed(1)}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {selected && (
        <AnomalyDetail
          anomaly={selected}
          approvals={approvals}
          reviewMode={reviewMode}
          canReview={canReview}
          orgId={profile?.org_id}
          userId={profile?.id}
          onClose={() => { setSelected(null); setReviewMode(false); }}
          onDone={loadAnomalies}
        />
      )}
    </div>
  );
}

function AnomalyDetail({ anomaly, approvals, reviewMode, canReview, orgId, userId, onClose, onDone }: {
  anomaly: AnomalyRow;
  approvals: ApprovalRow[];
  reviewMode: boolean;
  canReview: boolean;
  orgId: string | null | undefined;
  userId: string | undefined;
  onClose: () => void;
  onDone: () => void;
}) {
  const [decision, setDecision] = useState<'accepted' | 'rejected' | 'corrected'>('accepted');
  const [reason, setReason] = useState('');
  const [correction, setCorrection] = useState('');
  const [saving, setSaving] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSource, setAiSource] = useState<string>('');
  const vars = Object.entries(anomaly.contributing_variables || {});

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
          type: 'anomaly',
          orgId: orgId,
          data: {
            metric: anomaly.metric,
            predicted_value: anomaly.predicted_value,
            actual_value: anomaly.actual_value,
            deviation: anomaly.deviation,
            severity: anomaly.severity,
            confidence: anomaly.confidence,
            ward_name: Array.isArray(anomaly.ward) ? anomaly.ward[0]?.name : anomaly.ward?.name,
            contributing_variables: anomaly.contributing_variables,
            explanation: anomaly.explanation,
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

  const submit = async () => {
    if (!reason.trim()) return;
    setSaving(true);
    const newStatus = decision === 'rejected' ? 'rejected' : 'completed';
    await supabase.from('anomaly_events').update({
      status: newStatus,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', anomaly.id);
    await supabase.from('ai_approvals').insert({
      anomaly_id: anomaly.id,
      reviewer_id: userId,
      decision,
      reason: reason.trim(),
      override_value: decision === 'corrected' ? { correction: correction.trim() } : null,
    });
    await supabase.from('audit_logs').insert({
      org_id: orgId,
      actor_id: userId,
      action: decision === 'accepted' ? 'approval' : decision === 'rejected' ? 'rejection' : 'override',
      entity_type: 'anomaly',
      entity_id: anomaly.id,
      reason: reason.trim(),
    });
    setSaving(false);
    onDone();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-slate-700 bg-slate-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-700/50 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-100">{reviewMode ? 'Review Anomaly' : 'Anomaly Details'}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* AI explanation section */}
          <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain size={15} className="text-sky-400" />
                <p className="text-xs font-semibold text-sky-400">AI Explanation</p>
              </div>
              <button onClick={fetchAnalysis} disabled={aiLoading}
                className="flex items-center gap-1.5 rounded-lg bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-400 ring-1 ring-inset ring-sky-500/30 transition-colors hover:bg-sky-500/20 disabled:opacity-50">
                {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {aiLoading ? 'Analysing…' : aiAnalysis ? 'Regenerate' : 'Gemini Analysis'}
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-300">{anomaly.explanation}</p>
            {aiAnalysis && (
              <div className="mt-3 border-t border-sky-500/20 pt-3">
                <p className="mb-1 text-[10px] font-medium text-sky-400">Gemini Analysis {aiSource === 'gemini' ? '(Powered by Gemini)' : '(Rule-based fallback)'}</p>
                <p className="text-xs text-slate-300 whitespace-pre-wrap">{aiAnalysis}</p>
              </div>
            )}
            <p className="mt-2 text-[10px] text-slate-500">
              Generated {new Date(anomaly.created_at).toLocaleString()} · Confidence {Math.round(anomaly.confidence * 100)}%
            </p>
          </div>

          {/* Predicted vs Actual */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-slate-800/40 p-3 text-center">
              <p className="text-[10px] text-slate-500">Predicted</p>
              <p className="text-lg font-bold text-slate-100">{anomaly.predicted_value.toFixed(1)}</p>
            </div>
            <div className="rounded-lg bg-slate-800/40 p-3 text-center">
              <p className="text-[10px] text-slate-500">Actual</p>
              <p className="text-lg font-bold text-rose-400">{anomaly.actual_value.toFixed(1)}</p>
            </div>
            <div className="rounded-lg bg-slate-800/40 p-3 text-center">
              <p className="text-[10px] text-slate-500">Deviation</p>
              <p className="text-lg font-bold text-amber-400">{anomaly.deviation > 0 ? '+' : ''}{anomaly.deviation.toFixed(1)}</p>
            </div>
          </div>

          {/* Contributing variables */}
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

          {/* Previous review history */}
          {approvals.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 text-xs font-medium text-slate-400"><MessageSquare size={13} /> Review History</p>
              <div className="mt-2 space-y-2">
                {approvals.map((a) => (
                  <div key={a.id} className="rounded-lg bg-slate-800/40 p-3">
                    <div className="flex items-center justify-between">
                      <Badge variant={a.decision === 'accepted' || a.decision === 'approved' ? 'success' : a.decision === 'rejected' ? 'danger' : 'warning'}>
                        {a.decision}
                      </Badge>
                      <span className="text-[10px] text-slate-500">{(Array.isArray(a.reviewer) ? a.reviewer[0]?.full_name : a.reviewer?.full_name) ?? '—'}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{a.reason}</p>
                    <p className="mt-1 text-[10px] text-slate-600">{new Date(a.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Review form */}
          {reviewMode && canReview && anomaly.status === 'pending_review' && (
            <div className="border-t border-slate-700/40 pt-4">
              <p className="mb-3 text-xs font-semibold text-slate-300">Your Review</p>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => setDecision('accepted')}
                    className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${decision === 'accepted' ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30' : 'bg-slate-800/40 text-slate-400 hover:text-slate-200'}`}>
                    <CheckCircle2 size={14} /> Accept
                  </button>
                  <button onClick={() => setDecision('rejected')}
                    className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${decision === 'rejected' ? 'bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30' : 'bg-slate-800/40 text-slate-400 hover:text-slate-200'}`}>
                    <XCircle size={14} /> Reject
                  </button>
                  <button onClick={() => setDecision('corrected')}
                    className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${decision === 'corrected' ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30' : 'bg-slate-800/40 text-slate-400 hover:text-slate-200'}`}>
                    <AlertTriangle size={14} /> Correct
                  </button>
                </div>
                {decision === 'corrected' && (
                  <input type="text" value={correction} onChange={(e) => setCorrection(e.target.value)}
                    placeholder="Corrected assessment…"
                    className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-sky-500/50 focus:outline-none" />
                )}
                <textarea value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for decision (mandatory)…"
                  rows={3}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-sky-500/50 focus:outline-none" />
                <Button size="sm" loading={saving} disabled={!reason.trim()} onClick={submit} className="w-full">
                  Submit Review
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
