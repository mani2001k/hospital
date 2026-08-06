import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { hasPermission } from '@/lib/permissions';
import { PageHeader, Card, LoadingSpinner, Badge, EmptyState, Button } from '@/components/ui';
import {
  ClipboardList, ArrowUpCircle, GitCompare, Clock, User, X,
  Plus, CheckCircle2, XCircle, Clock4, AlertTriangle,
} from 'lucide-react';

interface TaskRow {
  id: string;
  title: string;
  priority: string;
  status: string;
  sla_risk: string;
  due_at: string | null;
  owner: { full_name: string; role: string } | { full_name: string; role: string }[] | null;
  ward: { name: string } | { name: string }[] | null;
  version: number;
}

interface StaffRow { id: string; full_name: string; role: string; }
interface WardRow { id: string; name: string; }

interface ScenarioRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  assumptions: Record<string, unknown>;
  expected_impact: Record<string, unknown>;
  created_at: string;
}

interface TimelineEntry {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  created_at: string;
  reason: string | null;
}

const STAFF_ROLES = ['field_staff', 'nurse', 'doctor', 'ward_manager'];

export default function TasksPage() {
  const { profile } = useAuth();
  const canAssign = hasPermission(profile?.role, 'assign_tasks');
  const canEscalate = hasPermission(profile?.role, 'escalate_tasks');
  const canApprove = hasPermission(profile?.role, 'approve_actions');
  const [activeTab, setActiveTab] = useState<'assign' | 'escalate' | 'scenarios' | 'timeline'>('assign');
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [assignModal, setAssignModal] = useState<TaskRow | null>(null);
  const [newTaskModal, setNewTaskModal] = useState(false);
  const [wards, setWards] = useState<WardRow[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [escalatedIds, setEscalatedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      setLoading(true);
      if (activeTab === 'assign') {
        const { data: t } = await supabase
          .from('tasks')
          .select(`id, title, priority, status, sla_risk, due_at, version,
            owner:staff(full_name, role), ward:wards(name)`)
          .eq('org_id', profile?.org_id)
          .in('status', ['pending', 'assigned', 'in_progress'])
          .order('priority', { ascending: false })
          .limit(20);
        setTasks((t ?? []) as TaskRow[]);
        const { data: s } = await supabase
          .from('staff')
          .select('id, full_name, role')
          .eq('org_id', profile?.org_id)
          .eq('status', 'active')
          .order('full_name');
        setStaff((s ?? []) as StaffRow[]);
        const { data: w } = await supabase
          .from('wards')
          .select('id, name')
          .eq('org_id', profile?.org_id)
          .order('name');
        setWards((w ?? []) as WardRow[]);
      } else if (activeTab === 'scenarios') {
        const { data: sc } = await supabase
          .from('scenarios')
          .select('id, name, description, status, assumptions, expected_impact, created_at')
          .eq('org_id', profile?.org_id)
          .order('created_at', { ascending: false });
        setScenarios((sc ?? []) as ScenarioRow[]);
      } else if (activeTab === 'timeline') {
        const { data: tl } = await supabase
          .from('audit_logs')
          .select('id, actor_id, action, entity_type, created_at, reason')
          .eq('org_id', profile?.org_id)
          .in('action', ['task_status_change', 'task_assignment', 'escalation', 'approval', 'rejection'])
          .order('created_at', { ascending: false })
          .limit(30);
        setTimeline((tl ?? []) as TimelineEntry[]);
      } else if (activeTab === 'escalate') {
        const { data: t } = await supabase
          .from('tasks')
          .select(`id, title, priority, status, sla_risk, due_at, version,
            owner:staff(full_name, role), ward:wards(name)`)
          .eq('org_id', profile?.org_id)
          .in('sla_risk', ['at_risk', 'breached'])
          .order('sla_risk', { ascending: false })
          .limit(20);
        setTasks((t ?? []) as TaskRow[]);
      }
      setLoading(false);
    })();
  }, [profile?.org_id, profile?.id, activeTab]);

  const escalateTask = async (task: TaskRow) => {
    if (!canEscalate) return;
    await supabase.from('escalations').insert({
      task_id: task.id,
      org_id: profile?.org_id,
      from_user: profile?.id,
      reason: `SLA ${task.sla_risk} — auto-escalated from task board`,
      level: 1,
      status: 'open',
    });
    await supabase.from('audit_logs').insert({
      org_id: profile?.org_id,
      actor_id: profile?.id,
      action: 'escalation',
      entity_type: 'task',
      entity_id: task.id,
      reason: `Escalated due to SLA ${task.sla_risk}`,
    });
    setEscalatedIds((prev) => new Set([...prev, task.id]));
  };

  return (
    <div>
      <PageHeader
        title="Task Assignment, Escalation & Scenario Planning"
        subtitle="Assign tasks, manage escalations, compare scenarios, and track the timeline of actions taken."
        breadcrumbs={[{ label: 'Home' }, { label: 'Tasks & Escalation' }]}
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {[
          { id: 'assign', label: 'Task Assignment', icon: <ClipboardList size={14} /> },
          { id: 'escalate', label: 'Escalation', icon: <ArrowUpCircle size={14} /> },
          { id: 'scenarios', label: 'Scenario Comparison', icon: <GitCompare size={14} /> },
          { id: 'timeline', label: 'Action Timeline', icon: <Clock4 size={14} /> },
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
        <LoadingSpinner label="Loading…" />
      ) : (
        <>
          {activeTab === 'assign' && (
            <Card className="overflow-hidden">
              <div className="border-b border-slate-700/40 px-5 py-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200">Pending & Active Tasks</h3>
                {canAssign && <Button size="sm" variant="secondary" onClick={() => setNewTaskModal(true)}><Plus size={14} /> New Task</Button>}
              </div>
              {tasks.length === 0 ? (
                <EmptyState icon={<ClipboardList size={32} />} title="No tasks to assign" />
              ) : (
                <div className="divide-y divide-slate-700/30">
                  {tasks.map((t) => (
                    <div key={t.id} className="flex items-center justify-between px-5 py-4">
                      <div className="flex items-center gap-4">
                        <Badge variant={t.priority === 'critical' ? 'critical' : t.priority === 'urgent' ? 'danger' : 'warning'}>
                          {t.priority}
                        </Badge>
                        <div>
                          <p className="text-sm font-medium text-slate-200">{t.title}</p>
                          <div className="flex items-center gap-3 text-[11px] text-slate-500">
                            {(() => { const o = Array.isArray(t.owner) ? t.owner[0] : t.owner; return o ? <span><User size={11} className="inline mr-1" />{o.full_name}</span> : null; })()}
                            {(() => { const w = Array.isArray(t.ward) ? t.ward[0] : t.ward; return w ? <span>{w.name}</span> : null; })()}
                            {t.due_at && <span><Clock size={11} className="inline mr-1" />{new Date(t.due_at).toLocaleString()}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={t.sla_risk === 'breached' ? 'danger' : t.sla_risk === 'at_risk' ? 'warning' : 'success'}>
                          {t.sla_risk.replace(/_/g, ' ')}
                        </Badge>
                        {canAssign && (
                          <Button size="sm" variant="secondary" onClick={() => setAssignModal(t)}>Assign</Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {activeTab === 'escalate' && (
            <Card className="overflow-hidden">
              <div className="border-b border-slate-700/40 px-5 py-3">
                <h3 className="text-sm font-semibold text-slate-200">SLA At-Risk & Breached Tasks</h3>
              </div>
              {tasks.length === 0 ? (
                <EmptyState icon={<AlertTriangle size={32} />} title="No tasks at risk" description="All tasks are on track." />
              ) : (
                <div className="divide-y divide-slate-700/30">
                  {tasks.map((t) => (
                    <div key={t.id} className="flex items-center justify-between px-5 py-4">
                      <div className="flex items-center gap-4">
                        <AlertTriangle size={18} className={t.sla_risk === 'breached' ? 'text-rose-400' : 'text-amber-400'} />
                        <div>
                          <p className="text-sm font-medium text-slate-200">{t.title}</p>
                          <p className="text-[11px] text-slate-500">
                            {(Array.isArray(t.owner) ? t.owner[0]?.full_name : t.owner?.full_name) ?? 'Unassigned'} · {(Array.isArray(t.ward) ? t.ward[0]?.name : t.ward?.name) ?? '—'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={t.sla_risk === 'breached' ? 'danger' : 'warning'}>
                          {t.sla_risk.replace(/_/g, ' ')}
                        </Badge>
                        {canEscalate && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => escalateTask(t)}
                            disabled={escalatedIds.has(t.id)}
                          >
                            {escalatedIds.has(t.id) ? 'Escalated' : 'Escalate'}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {activeTab === 'scenarios' && (
            <div className="space-y-4">
              {canApprove && (
                <Card className="p-5">
                  <h3 className="mb-3 text-sm font-semibold text-slate-200">Create Scenario</h3>
                  <ScenarioForm orgId={profile?.org_id} userId={profile?.id} onCreated={() => setActiveTab('scenarios')} />
                </Card>
              )}
              {scenarios.length === 0 ? (
                <EmptyState icon={<GitCompare size={32} />} title="No scenarios yet" description="Create scenarios to compare operational strategies." />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {scenarios.map((s) => (
                    <Card key={s.id} className="p-5">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-slate-200">{s.name}</h4>
                        <Badge variant={s.status === 'approved' ? 'success' : s.status === 'rejected' ? 'danger' : 'info'}>
                          {s.status}
                        </Badge>
                      </div>
                      {s.description && <p className="mt-2 text-xs text-slate-400">{s.description}</p>}
                      {s.expected_impact && Object.keys(s.expected_impact).length > 0 && (
                        <div className="mt-3 space-y-1">
                          {Object.entries(s.expected_impact).map(([k, v]) => (
                            <div key={k} className="flex items-center justify-between text-xs">
                              <span className="text-slate-500">{k.replace(/_/g, ' ')}</span>
                              <span className="font-medium text-slate-300">{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="mt-3 text-[10px] text-slate-600">{new Date(s.created_at).toLocaleString()}</p>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'timeline' && (
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-slate-200">Action Timeline</h3>
              {timeline.length === 0 ? (
                <EmptyState icon={<Clock4 size={32} />} title="No actions recorded yet" />
              ) : (
                <div className="space-y-3">
                  {timeline.map((entry) => (
                    <div key={entry.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 ring-1 ring-slate-700">
                          {entry.action === 'approval' ? <CheckCircle2 size={14} className="text-emerald-400" /> :
                           entry.action === 'rejection' ? <XCircle size={14} className="text-rose-400" /> :
                           entry.action === 'escalation' ? <ArrowUpCircle size={14} className="text-amber-400" /> :
                           <ClipboardList size={14} className="text-sky-400" />}
                        </div>
                        {timeline.indexOf(entry) < timeline.length - 1 && (
                          <div className="h-full w-px flex-1 bg-slate-700/40" />
                        )}
                      </div>
                      <div className="pb-3">
                        <p className="text-sm text-slate-200">{entry.action.replace(/_/g, ' ')}</p>
                        {entry.reason && <p className="text-xs text-slate-500">{entry.reason}</p>}
                        <p className="text-[10px] text-slate-600">{new Date(entry.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {assignModal && (
        <AssignModal task={assignModal} staff={staff} orgId={profile?.org_id} userId={profile?.id} onClose={() => setAssignModal(null)} />
      )}
      {newTaskModal && (
        <NewTaskModal wards={wards} staff={staff} orgId={profile?.org_id} userId={profile?.id} onClose={() => setNewTaskModal(false)} onCreated={() => { setNewTaskModal(false); setActiveTab('assign'); }} />
      )}
    </div>
  );
}

function AssignModal({ task, staff, orgId, userId, onClose }: { task: TaskRow; staff: StaffRow[]; orgId: string | null | undefined; userId: string | undefined; onClose: () => void }) {
  const [selectedStaff, setSelectedStaff] = useState('');
  const [saving, setSaving] = useState(false);

  const assign = async () => {
    if (!selectedStaff) return;
    setSaving(true);
    await supabase.from('tasks').update({
      owner_id: selectedStaff,
      assigned_by: userId,
      status: 'assigned',
      updated_at: new Date().toISOString(),
    }).eq('id', task.id);
    await supabase.from('audit_logs').insert({
      org_id: orgId,
      actor_id: userId,
      action: 'task_assignment',
      entity_type: 'task',
      entity_id: task.id,
      new_value: { owner_id: selectedStaff },
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">Assign Task</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
        </div>
        <p className="mb-4 text-sm text-slate-300">{task.title}</p>
        <label className="mb-1.5 block text-xs font-medium text-slate-400">Select Staff Member</label>
        <select
          value={selectedStaff}
          onChange={(e) => setSelectedStaff(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-sky-500/50 focus:outline-none"
        >
          <option value="">Choose…</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name} ({s.role})</option>
          ))}
        </select>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} disabled={!selectedStaff} onClick={assign}>Assign</Button>
        </div>
      </div>
    </div>
  );
}

function NewTaskModal({ wards, staff, orgId, userId, onClose, onCreated }: {
  wards: WardRow[];
  staff: StaffRow[];
  orgId: string | null | undefined;
  userId: string | undefined;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [wardId, setWardId] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent' | 'critical'>('medium');
  const [workflowStage, setWorkflowStage] = useState<'triage' | 'treatment' | 'discharge' | 'follow_up' | 'escalation'>('triage');
  const [ownerId, setOwnerId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setError('');
    const { error: insertError } = await supabase.from('tasks').insert({
      org_id: orgId,
      title: title.trim(),
      description: description.trim() || null,
      ward_id: wardId || null,
      priority,
      workflow_stage: workflowStage,
      status: ownerId ? 'assigned' : 'pending',
      owner_id: ownerId || null,
      assigned_by: userId,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      sla_deadline: dueAt ? new Date(dueAt).toISOString() : null,
      sla_risk: 'on_track',
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    onCreated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">New Task</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Title *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 'Allocate additional nursing staff to ER'"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-sky-500/50 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Task details…" rows={2}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-sky-500/50 focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Ward</label>
              <select value={wardId} onChange={(e) => setWardId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-sky-500/50 focus:outline-none">
                <option value="">—</option>
                {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-sky-500/50 focus:outline-none">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Workflow Stage</label>
              <select value={workflowStage} onChange={(e) => setWorkflowStage(e.target.value as typeof workflowStage)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-sky-500/50 focus:outline-none">
                <option value="triage">Triage</option>
                <option value="treatment">Treatment</option>
                <option value="discharge">Discharge</option>
                <option value="follow_up">Follow-up</option>
                <option value="escalation">Escalation</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Due Date</label>
              <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-sky-500/50 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Assign To (optional)</label>
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-sky-500/50 focus:outline-none">
              <option value="">Unassigned</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.role})</option>)}
            </select>
          </div>
          {error && <p className="text-xs text-rose-400">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} disabled={!title.trim()} onClick={create}>Create Task</Button>
        </div>
      </div>
    </div>
  );
}

function ScenarioForm({ orgId, userId, onCreated }: { orgId: string | null | undefined; userId: string | undefined; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await supabase.from('scenarios').insert({
      org_id: orgId,
      name: name.trim(),
      description: description.trim() || null,
      status: 'draft',
      assumptions: {},
      expected_impact: {},
      created_by: userId,
    });
    setSaving(false);
    setName('');
    setDescription('');
    onCreated();
  };

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Scenario name (e.g. 'Increase ICU staffing by 2 nurses')"
        className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-sky-500/50 focus:outline-none"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description and assumptions…"
        rows={2}
        className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-sky-500/50 focus:outline-none"
      />
      <Button size="sm" loading={saving} disabled={!name.trim()} onClick={create}>Create Scenario</Button>
    </div>
  );
}
