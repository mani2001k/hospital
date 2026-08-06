import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTable } from '@/hooks/useTable';
import { WORKFLOW_STAGES, stageLabel } from '@/lib/permissions';
import { PageHeader, Card, LoadingSpinner, Badge, EmptyState, Button } from '@/components/ui';
import { Pagination, SearchInput, FilterSelect } from '@/components/TableControls';
import {
  ListChecks, Search as SearchIcon, Eye, X, Clock, User, Flag,
} from 'lucide-react';

interface TaskRow {
  id: string;
  workflow_stage: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  sla_risk: string;
  due_at: string | null;
  sla_deadline: string | null;
  created_at: string;
  updated_at: string;
  owner: { full_name: string; role: string } | { full_name: string; role: string }[] | null;
  ward: { name: string; code: string } | { name: string; code: string }[] | null;
  encounter: { encounter_number: string } | { encounter_number: string }[] | null;
}

function first<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

const PRIORITY_VARIANT: Record<string, 'neutral' | 'info' | 'warning' | 'danger' | 'critical'> = {
  low: 'neutral', medium: 'info', high: 'warning', urgent: 'danger', critical: 'critical',
};

const SLA_VARIANT: Record<string, 'success' | 'warning' | 'danger'> = {
  on_track: 'success', at_risk: 'warning', breached: 'danger',
};

const STAGE_TABS = [
  { value: 'all', label: 'All Stages' },
  ...WORKFLOW_STAGES.map((s) => ({ value: s, label: stageLabel(s) })),
];

function timeFromNow(iso: string | null): { text: string; overdue: boolean } {
  if (!iso) return { text: '—', overdue: false };
  const diff = new Date(iso).getTime() - Date.now();
  const hours = diff / 3600000;
  if (hours < 0) return { text: `${Math.abs(hours).toFixed(0)}h overdue`, overdue: true };
  if (hours < 24) return { text: `in ${hours.toFixed(0)}h`, overdue: false };
  return { text: `in ${(hours / 24).toFixed(1)}d`, overdue: false };
}

export default function QueuesPage() {
  const { profile } = useAuth();
  const [stage, setStage] = useState('all');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [slaRisk, setSlaRisk] = useState('all');
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<'created_at' | 'due_at' | 'priority'>('created_at');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [selected, setSelected] = useState<TaskRow | null>(null);

  const filters = useMemo(() => ({
    workflow_stage: stage !== 'all' ? stage : null,
    status: status !== 'all' ? status : null,
    priority: priority !== 'all' ? priority : null,
    sla_risk: slaRisk !== 'all' ? slaRisk : null,
  }), [stage, status, priority, slaRisk]);

  const { data, count, loading } = useTable<TaskRow>({
    table: 'tasks',
    select: `
      id, workflow_stage, title, description, priority, status, sla_risk,
      due_at, sla_deadline, created_at, updated_at,
      owner:staff(full_name, role),
      ward:wards(name, code),
      encounter:encounters(encounter_number)
    `,
    orgId: profile?.org_id,
    filters,
    search: { columns: ['title', 'description'], term: search },
    orderBy: { column: sortCol, ascending: sortAsc },
    page,
    pageSize,
  });

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(false); }
  };

  return (
    <div>
      <PageHeader
        title="Live Workflow Queues"
        subtitle="Real-time task queues across admission, bed allocation, clinical orders, diagnostics, treatment, discharge, and follow-up."
        breadcrumbs={[{ label: 'Home' }, { label: 'Workflow Queues' }]}
      />

      {/* Stage tabs */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {STAGE_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setStage(tab.value); setPage(1); }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              stage === tab.value
                ? 'bg-sky-500/15 text-sky-400 ring-1 ring-inset ring-sky-500/30'
                : 'bg-slate-800/40 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search tasks…" />
          <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }}
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'assigned', label: 'Assigned' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'pending_review', label: 'Pending Review' },
              { value: 'completed', label: 'Completed' },
              { value: 'deferred', label: 'Deferred' },
            ]}
          />
          <FilterSelect label="Priority" value={priority} onChange={(v) => { setPriority(v); setPage(1); }}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'urgent', label: 'Urgent' },
              { value: 'critical', label: 'Critical' },
            ]}
          />
          <FilterSelect label="SLA Risk" value={slaRisk} onChange={(v) => { setSlaRisk(v); setPage(1); }}
            options={[
              { value: 'on_track', label: 'On Track' },
              { value: 'at_risk', label: 'At Risk' },
              { value: 'breached', label: 'Breached' },
            ]}
          />
          {(stage !== 'all' || status !== 'all' || priority !== 'all' || slaRisk !== 'all' || search) && (
            <Button variant="ghost" size="sm" onClick={() => { setStage('all'); setStatus('all'); setPriority('all'); setSlaRisk('all'); setSearch(''); setPage(1); }}>
              <X size={14} /> Clear
            </Button>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <LoadingSpinner label="Loading tasks…" />
        ) : data.length === 0 ? (
          <EmptyState icon={<ListChecks size={32} />} title="No tasks found" description="Try adjusting your filters or search." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-700/50 bg-slate-800/30 text-xs text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Task</th>
                  <th className="px-4 py-3 text-left font-medium">Stage</th>
                  <th className="px-4 py-3 text-left font-medium">
                    <button onClick={() => toggleSort('priority')} className="flex items-center gap-1 hover:text-slate-200">
                      Priority
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-medium">Owner</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">SLA</th>
                  <th className="px-4 py-3 text-left font-medium">
                    <button onClick={() => toggleSort('due_at')} className="flex items-center gap-1 hover:text-slate-200">
                      Due
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {data.map((task) => {
                  const due = timeFromNow(task.due_at);
                  return (
                    <tr key={task.id} className="transition-colors hover:bg-slate-800/30">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-200">{task.title}</p>
                        {(() => { const e = first(task.encounter); return e ? <p className="text-[11px] text-slate-500">{e.encounter_number}</p> : null; })()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-slate-400">{stageLabel(task.workflow_stage)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={PRIORITY_VARIANT[task.priority] ?? 'neutral'}>
                          <Flag size={10} /> {task.priority}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {(() => { const o = first(task.owner); return o ? (<div><p className="text-xs text-slate-300">{o.full_name}</p><p className="text-[10px] text-slate-500">{o.role}</p></div>) : <span className="text-xs text-slate-600">Unassigned</span>; })()}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={task.status === 'completed' ? 'success' : task.status === 'pending' ? 'neutral' : 'info'}>
                          {task.status.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={SLA_VARIANT[task.sla_risk] ?? 'neutral'}>
                          {task.sla_risk.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs ${due.overdue ? 'text-rose-400' : 'text-slate-400'}`}>
                          {due.text}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setSelected(task)}
                          className="text-slate-500 hover:text-sky-400"
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-slate-700/30 px-4">
          <Pagination page={page} pageSize={pageSize} count={count} onPageChange={setPage} />
        </div>
      </Card>

      {/* Task detail drawer */}
      {selected && (
        <TaskDetailDrawer task={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function TaskDetailDrawer({ task, onClose }: { task: TaskRow; onClose: () => void }) {
  const { profile } = useAuth();
  const [updating, setUpdating] = useState(false);
  const [newStatus, setNewStatus] = useState(task.status);

  const updateStatus = async () => {
    if (newStatus === task.status) return;
    setUpdating(true);
    await supabase.from('tasks').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', task.id);
    await supabase.from('audit_logs').insert({
      org_id: profile?.org_id,
      actor_id: profile?.id,
      action: 'task_status_change',
      entity_type: 'task',
      entity_id: task.id,
      previous_value: { status: task.status },
      new_value: { status: newStatus },
    });
    setUpdating(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-slate-700 bg-slate-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-700/50 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-100">Task Details</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <p className="text-xs text-slate-500">Title</p>
            <p className="text-sm font-medium text-slate-200">{task.title}</p>
          </div>
          {task.description && (
            <div>
              <p className="text-xs text-slate-500">Description</p>
              <p className="text-sm text-slate-300">{task.description}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-500">Workflow Stage</p>
              <p className="text-sm text-slate-300">{stageLabel(task.workflow_stage)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Priority</p>
              <Badge variant={PRIORITY_VARIANT[task.priority] ?? 'neutral'}>{task.priority}</Badge>
            </div>
            <div>
              <p className="text-xs text-slate-500">SLA Risk</p>
              <Badge variant={SLA_VARIANT[task.sla_risk] ?? 'neutral'}>{task.sla_risk.replace(/_/g, ' ')}</Badge>
            </div>
            <div>
              <p className="text-xs text-slate-500">Status</p>
              <p className="text-sm text-slate-300 capitalize">{task.status.replace(/_/g, ' ')}</p>
            </div>
          </div>
          {task.owner && (
            <div>
              <p className="text-xs text-slate-500">Owner</p>
              <div className="flex items-center gap-2">
                <User size={14} className="text-slate-500" />
              {(() => { const o = first(task.owner); return o ? <span className="text-sm text-slate-300">{o.full_name} · {o.role}</span> : null; })()}
              </div>
            </div>
          )}
          {task.ward && (
            <div>
              <p className="text-xs text-slate-500">Ward</p>
              <p className="text-sm text-slate-300">{(() => { const w = first(task.ward); return w ? `${w.name} (${w.code})` : '—'; })()}</p>
            </div>
          )}
          {task.due_at && (
            <div>
              <p className="text-xs text-slate-500">Due</p>
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-slate-500" />
                <span className="text-sm text-slate-300">{new Date(task.due_at).toLocaleString()}</span>
              </div>
            </div>
          )}
          <div className="border-t border-slate-700/40 pt-4">
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Update Status</label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-sky-500/50 focus:outline-none"
            >
              {['pending','assigned','in_progress','pending_review','completed','deferred','cancelled'].map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <Button onClick={updateStatus} loading={updating} disabled={newStatus === task.status} className="mt-3 w-full" size="sm">
              Save Status Change
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
