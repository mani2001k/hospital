import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { hasPermission } from '@/lib/permissions';
import { roleLabel } from '@/lib/permissions';
import { PageHeader, Card, LoadingSpinner, Badge, EmptyState, Button } from '@/components/ui';
import { Pagination, SearchInput } from '@/components/TableControls';
import {
  ScrollText, Settings, Search, Shield, Database, Bell, Brain, Filter,
  Lock, Save, CheckCircle2,
} from 'lucide-react';

interface AuditRow {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  outcome: string;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
  actor: { full_name: string; role: string } | { full_name: string; role: string }[] | null;
}

const AUDIT_ACTIONS = [
  'login', 'data_access', 'record_creation', 'modification', 'deletion', 'export',
  'ai_execution', 'approval', 'rejection', 'override', 'configuration_change',
  'task_status_change', 'task_assignment', 'escalation', 'user_creation', 'user_modification',
];

const ACTION_VARIANT: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'critical'> = {
  login: 'info',
  approval: 'success',
  rejection: 'danger',
  override: 'warning',
  deletion: 'danger',
  escalation: 'warning',
  ai_execution: 'info',
  configuration_change: 'warning',
  export: 'neutral',
};

export default function AuditSettingsPage() {
  const { profile } = useAuth();
  const canManageSettings = hasPermission(profile?.role, 'manage_settings');
  const [activeTab, setActiveTab] = useState<'audit' | 'settings'>('audit');
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [outcomeFilter, setOutcomeFilter] = useState('all');

  // Settings state
  const [settings, setSettings] = useState<{ key: string; value: string; category: string; description: string | null }[]>([]);
  const [thresholds, setThresholds] = useState<any[]>([]);
  const [slaRules, setSlaRules] = useState<any[]>([]);

  const loadAudit = async () => {
    setLoading(true);
    let q = supabase
      .from('audit_logs')
      .select(`id, actor_id, action, entity_type, entity_id, outcome, previous_value, new_value, reason, created_at,
        actor:profiles(full_name, role)`, { count: 'exact' })
      .order('created_at', { ascending: false });
    if (actionFilter !== 'all') q = q.eq('action', actionFilter);
    if (entityFilter !== 'all') q = q.eq('entity_type', entityFilter);
    if (outcomeFilter !== 'all') q = q.eq('outcome', outcomeFilter);
    if (search.trim()) {
      q = q.or(`action.ilike.%${search}%,reason.ilike.%${search}%`);
    }
    const from = (page - 1) * pageSize;
    const { data, count: total } = await q.range(from, from + pageSize - 1);
    setAuditLogs((data ?? []) as unknown as AuditRow[]);
    setCount(total ?? 0);
    setLoading(false);
  };

  const loadSettings = async () => {
    setLoading(true);
    const { data: cfg } = await supabase.from('config_settings').select('key, value, category, description').eq('org_id', profile?.org_id).order('category');
    setSettings((cfg ?? []) as any[]);
    const { data: th } = await supabase.from('thresholds').select('metric, warning_value, critical_value, direction, enabled, ward:wards(name)').eq('org_id', profile?.org_id).order('metric');
    setThresholds(th ?? []);
    const { data: sla } = await supabase.from('sla_rules').select('workflow_stage, priority, target_minutes, breach_minutes, enabled').eq('org_id', profile?.org_id).order('workflow_stage');
    setSlaRules(sla ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'audit') loadAudit();
    else loadSettings();
  }, [activeTab, profile?.org_id, page, search, actionFilter, entityFilter, outcomeFilter]);

  return (
    <div>
      <PageHeader
        title="Audit Logs & System Settings"
        subtitle="Searchable append-only audit trail and system configuration for master data, workflow rules, thresholds, AI settings, and notification rules."
        breadcrumbs={[{ label: 'Home' }, { label: 'Audit & Settings' }]}
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {[
          { id: 'audit', label: 'Audit Logs', icon: <ScrollText size={14} /> },
          { id: 'settings', label: 'System Settings', icon: <Settings size={14} /> },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.id ? 'bg-sky-500/15 text-sky-400 ring-1 ring-inset ring-sky-500/30' : 'bg-slate-800/40 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'audit' && (
        <>
          {/* Audit is append-only notice */}
          <Card className="mb-4 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-700/40">
                <Lock size={15} className="text-slate-400" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-200">Append-only audit trail</p>
                <p className="text-[11px] text-slate-500">Audit records cannot be modified or deleted by any user. All system actions are recorded with actor, timestamp, previous and new values.</p>
              </div>
            </div>
          </Card>

          {/* Filters */}
          <Card className="mb-4 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search action or reason…" />
              <div>
                <label className="mb-1 block text-[10px] font-medium text-slate-500">Action</label>
                <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
                  className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 focus:border-sky-500/50 focus:outline-none">
                  <option value="all">All Actions</option>
                  {AUDIT_ACTIONS.map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-slate-500">Entity</label>
                <select value={entityFilter} onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }}
                  className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 focus:border-sky-500/50 focus:outline-none">
                  <option value="all">All Entities</option>
                  <option value="task">Task</option>
                  <option value="prediction">Prediction</option>
                  <option value="anomaly">Anomaly</option>
                  <option value="profile">Profile</option>
                  <option value="preventive_action">Preventive Action</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-slate-500">Outcome</label>
                <select value={outcomeFilter} onChange={(e) => { setOutcomeFilter(e.target.value); setPage(1); }}
                  className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 focus:border-sky-500/50 focus:outline-none">
                  <option value="all">All Outcomes</option>
                  <option value="success">Success</option>
                  <option value="failure">Failure</option>
                </select>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            {loading ? (
              <LoadingSpinner label="Loading audit logs…" />
            ) : auditLogs.length === 0 ? (
              <EmptyState icon={<ScrollText size={32} />} title="No audit entries" description="Audit events will appear here as users interact with the system." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-700/50 bg-slate-800/30 text-xs text-slate-400">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Timestamp</th>
                      <th className="px-4 py-3 text-left font-medium">Actor</th>
                      <th className="px-4 py-3 text-left font-medium">Action</th>
                      <th className="px-4 py-3 text-left font-medium">Entity</th>
                      <th className="px-4 py-3 text-left font-medium">Reason / Details</th>
                      <th className="px-4 py-3 text-left font-medium">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3 text-[11px] text-slate-500 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          {(() => { const a = Array.isArray(log.actor) ? log.actor[0] : log.actor; return a ? (
                            <div>
                              <p className="text-xs text-slate-300">{a.full_name}</p>
                              <p className="text-[10px] text-slate-500">{roleLabel(a.role as any)}</p>
                            </div>
                          ) : <span className="text-xs text-slate-600">System</span>; })()}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={ACTION_VARIANT[log.action] ?? 'neutral'}>
                            {log.action.replace(/_/g, ' ')}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">
                          {log.entity_type ? log.entity_type.replace(/_/g, ' ') : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400 max-w-xs truncate">
                          {log.reason ?? '—'}
                          {log.previous_value && log.new_value && (
                            <span className="block text-[10px] text-slate-600 mt-0.5">
                              {JSON.stringify(log.previous_value)} → {JSON.stringify(log.new_value)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={log.outcome === 'success' ? 'success' : 'danger'}>{log.outcome}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="border-t border-slate-700/30 px-4">
              <Pagination page={page} pageSize={pageSize} count={count} onPageChange={setPage} />
            </div>
          </Card>
        </>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-4">
          {loading ? (
            <LoadingSpinner label="Loading settings…" />
          ) : (
            <>
              {/* Master data / workflow rules */}
              <Card className="p-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200"><Database size={15} /> SLA Rules</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-slate-700/50 text-slate-400">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Workflow Stage</th>
                        <th className="px-3 py-2 text-left font-medium">Priority</th>
                        <th className="px-3 py-2 text-left font-medium">Target (min)</th>
                        <th className="px-3 py-2 text-left font-medium">Breach (min)</th>
                        <th className="px-3 py-2 text-left font-medium">Enabled</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/30">
                      {slaRules.map((s, i) => (
                        <tr key={i} className="hover:bg-slate-800/20">
                          <td className="px-3 py-2 text-slate-300">{s.workflow_stage.replace(/_/g, ' ')}</td>
                          <td className="px-3 py-2"><Badge variant={s.priority === 'critical' ? 'critical' : s.priority === 'urgent' ? 'danger' : 'warning'}>{s.priority}</Badge></td>
                          <td className="px-3 py-2 text-slate-300">{s.target_minutes}</td>
                          <td className="px-3 py-2 text-slate-300">{s.breach_minutes ?? '—'}</td>
                          <td className="px-3 py-2"><span className={`h-2 w-2 rounded-full inline-block ${s.enabled ? 'bg-emerald-400' : 'bg-slate-600'}`} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Alert thresholds */}
              <Card className="p-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200"><Shield size={15} /> Alert Thresholds</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-slate-700/50 text-slate-400">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Metric</th>
                        <th className="px-3 py-2 text-left font-medium">Ward</th>
                        <th className="px-3 py-2 text-left font-medium">Warning</th>
                        <th className="px-3 py-2 text-left font-medium">Critical</th>
                        <th className="px-3 py-2 text-left font-medium">Direction</th>
                        <th className="px-3 py-2 text-left font-medium">Enabled</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/30">
                      {thresholds.map((t, i) => (
                        <tr key={i} className="hover:bg-slate-800/20">
                          <td className="px-3 py-2 text-slate-300">{t.metric.replace(/_/g, ' ')}</td>
                          <td className="px-3 py-2 text-slate-400">{(Array.isArray(t.ward) ? t.ward[0]?.name : t.ward?.name) ?? 'All'}</td>
                          <td className="px-3 py-2"><Badge variant="warning">{t.warning_value}</Badge></td>
                          <td className="px-3 py-2"><Badge variant="critical">{t.critical_value}</Badge></td>
                          <td className="px-3 py-2 text-slate-400">{t.direction}</td>
                          <td className="px-3 py-2"><span className={`h-2 w-2 rounded-full inline-block ${t.enabled ? 'bg-emerald-400' : 'bg-slate-600'}`} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* AI settings */}
              <Card className="p-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200"><Brain size={15} /> AI Configuration</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <SettingToggle label="Human approval required for material changes" desc="AI cannot execute critical operational changes without authorisation" defaultOn />
                  <SettingToggle label="Low-confidence alert threshold" desc="Flag predictions below 80% confidence" defaultOn />
                  <SettingToggle label="Anomaly auto-detection" desc="Automatically detect and flag operational anomalies" defaultOn />
                  <SettingToggle label="Explainable scores" desc="Show contributing factors and evidence for all AI outputs" defaultOn />
                </div>
              </Card>

              {/* Notification rules */}
              <Card className="p-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200"><Bell size={15} /> Notification Rules</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <SettingToggle label="Critical alerts — immediate" desc="Push notifications for critical severity events" defaultOn />
                  <SettingToggle label="SLA breach alerts" desc="Notify when tasks breach SLA deadlines" defaultOn />
                  <SettingToggle label="AI result notifications" desc="Notify when new predictions/anomalies are generated" defaultOn />
                  <SettingToggle label="Daily digest" desc="Summary of operations sent each morning" defaultOn />
                </div>
              </Card>

              {/* Data retention */}
              <Card className="p-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200"><Database size={15} /> Data Retention & Security</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg bg-slate-800/40 p-3">
                    <p className="text-[10px] text-slate-500">KPI Snapshot Retention</p>
                    <p className="text-sm font-medium text-slate-300">90 days</p>
                  </div>
                  <div className="rounded-lg bg-slate-800/40 p-3">
                    <p className="text-[10px] text-slate-500">Audit Log Retention</p>
                    <p className="text-sm font-medium text-slate-300">7 years (legal hold)</p>
                  </div>
                  <div className="rounded-lg bg-slate-800/40 p-3">
                    <p className="text-[10px] text-slate-500">Encryption at Rest</p>
                    <p className="text-sm font-medium text-emerald-400">Enabled (AES-256)</p>
                  </div>
                  <div className="rounded-lg bg-slate-800/40 p-3">
                    <p className="text-[10px] text-slate-500">Encryption in Transit</p>
                    <p className="text-sm font-medium text-emerald-400">Enabled (TLS 1.3)</p>
                  </div>
                </div>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SettingToggle({ label, desc, defaultOn }: { label: string; desc: string; defaultOn: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-800/40 p-3">
      <div>
        <p className="text-sm text-slate-200">{label}</p>
        <p className="text-[11px] text-slate-500">{desc}</p>
      </div>
      <button
        onClick={() => setOn(!on)}
        className={`relative h-6 w-11 rounded-full transition-colors ${on ? 'bg-sky-500' : 'bg-slate-600'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}
