import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { PageHeader, Card, LoadingSpinner, Badge, EmptyState, Button } from '@/components/ui';
import { Pagination, FilterSelect } from '@/components/TableControls';
import {
  Bell, Check, Trash2, AlertTriangle, CheckCircle2, Clock, Brain,
  Info, User, ArrowRight, X,
} from 'lucide-react';

interface NotificationRow {
  id: string;
  category: string;
  title: string;
  body: string | null;
  severity: string;
  read: boolean;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_at: string;
}

const CATEGORY_ICONS: Record<string, typeof Bell> = {
  assignment: User,
  exception: AlertTriangle,
  approval: CheckCircle2,
  alert: AlertTriangle,
  due_date: Clock,
  ai_result: Brain,
  system: Info,
};

const SEVERITY_VARIANT: Record<string, 'neutral' | 'info' | 'warning' | 'danger' | 'critical' | 'success'> = {
  info: 'info',
  low: 'neutral',
  medium: 'warning',
  high: 'warning',
  urgent: 'danger',
  critical: 'critical',
};

export default function NotificationsPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [prefModal, setPrefModal] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    let q = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });

    if (filter === 'unread') q = q.eq('read', false);
    else if (filter === 'urgent') q = q.in('severity', ['urgent', 'critical']);
    else if (filter === 'assigned') q = q.eq('category', 'assignment');

    const from = (page - 1) * pageSize;
    const { data, count } = await q.range(from, from + pageSize - 1);
    setNotifications((data ?? []) as NotificationRow[]);
    setLoading(false);
  }, [profile?.id, filter, page, pageSize]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    await supabase.from('notifications').update({ read: true }).in('id', unread.map((n) => n.id));
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const deleteNotification = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const clearSelected = async (ids: string[]) => {
    await supabase.from('notifications').delete().in('id', ids);
    setNotifications((prev) => prev.filter((n) => !ids.includes(n.id)));
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Seed some notifications if none exist
  const seedNotifications = async () => {
    if (!profile?.id || !profile?.org_id) return;
    const samples = [
      { category: 'alert', title: 'ICU occupancy at 92%', body: 'ICU Unit A nearing critical capacity', severity: 'critical' },
      { category: 'assignment', title: 'New task assigned: Process CT scan results', body: 'Radiology awaiting read', severity: 'high' },
      { category: 'ai_result', title: 'New prediction: Emergency wait time forecast', body: 'Peak of 72 min expected at 14:00', severity: 'medium' },
      { category: 'due_date', title: 'Task due in 2 hours', body: 'Complete admission paperwork for new patient', severity: 'urgent' },
      { category: 'approval', title: 'AI prediction awaiting your review', body: 'Readmission risk trending upward', severity: 'high' },
      { category: 'system', title: 'System maintenance scheduled', body: 'Brief downtime expected at 02:00 UTC', severity: 'low' },
    ];
    for (const s of samples) {
      await supabase.from('notifications').insert({
        user_id: profile.id,
        org_id: profile.org_id,
        ...s,
      });
    }
    loadNotifications();
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Stay informed about assignments, exceptions, approvals, alerts, due dates, AI results, and system events."
        breadcrumbs={[{ label: 'Home' }, { label: 'Notifications' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPrefModal(true)}>Preferences</Button>
            <Button size="sm" variant="secondary" onClick={markAllRead} disabled={unreadCount === 0}>
              <Check size={14} /> Mark all read
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-1.5">
            {[
              { v: 'all', l: 'All' },
              { v: 'unread', l: 'Unread' },
              { v: 'urgent', l: 'Urgent' },
              { v: 'assigned', l: 'Assigned' },
            ].map((f) => (
              <button key={f.v} onClick={() => { setFilter(f.v); setPage(1); }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === f.v ? 'bg-sky-500/15 text-sky-400 ring-1 ring-inset ring-sky-500/30' : 'bg-slate-800/40 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}>
                {f.l}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {loading ? (
        <LoadingSpinner label="Loading notifications…" />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={<Bell size={32} />}
          title="No notifications"
          description="You're all caught up. New notifications will appear here."
          action={<Button size="sm" variant="secondary" onClick={seedNotifications}>Load sample notifications</Button>}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-slate-700/30">
            {notifications.map((n) => {
              const Icon = CATEGORY_ICONS[n.category] ?? Bell;
              return (
                <div key={n.id} className={`flex items-start gap-4 px-5 py-4 transition-colors hover:bg-slate-800/30 ${!n.read ? 'bg-sky-500/5' : ''}`}>
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    n.severity === 'critical' ? 'bg-rose-500/10' :
                    n.severity === 'urgent' || n.severity === 'high' ? 'bg-amber-500/10' :
                    n.severity === 'medium' ? 'bg-sky-500/10' : 'bg-slate-700/40'
                  }`}>
                    <Icon size={16} className={
                      n.severity === 'critical' ? 'text-rose-400' :
                      n.severity === 'urgent' || n.severity === 'high' ? 'text-amber-400' :
                      n.severity === 'medium' ? 'text-sky-400' : 'text-slate-400'
                    } />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm ${!n.read ? 'font-semibold text-slate-100' : 'font-medium text-slate-300'}`}>{n.title}</p>
                      {!n.read && <span className="h-2 w-2 rounded-full bg-sky-400" />}
                      <Badge variant={SEVERITY_VARIANT[n.severity] ?? 'neutral'}>{n.severity}</Badge>
                    </div>
                    {n.body && <p className="mt-1 text-xs text-slate-400">{n.body}</p>}
                    <div className="mt-1.5 flex items-center gap-3 text-[10px] text-slate-600">
                      <span>{new Date(n.created_at).toLocaleString()}</span>
                      <span className="capitalize">· {n.category.replace(/_/g, ' ')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!n.read && (
                      <button onClick={() => markRead(n.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-700/40 hover:text-sky-400" title="Mark as read">
                        <Check size={15} />
                      </button>
                    )}
                    <button onClick={() => deleteNotification(n.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-700/40 hover:text-rose-400" title="Delete">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-slate-700/30 px-4">
            <Pagination page={page} pageSize={pageSize} count={notifications.length} onPageChange={setPage} />
          </div>
        </Card>
      )}

      {prefModal && <PreferenceModal onClose={() => setPrefModal(false)} />}
    </div>
  );
}

function PreferenceModal({ onClose }: { onClose: () => void }) {
  const prefs = [
    { event: 'Critical alerts', desc: 'Immediate notification for critical severity', default: true },
    { event: 'Task assignments', desc: 'When a task is assigned to you', default: true },
    { event: 'AI prediction results', desc: 'When new predictions are generated', default: true },
    { event: 'SLA breaches', desc: 'When a task SLA is breached', default: true },
    { event: 'Approval requests', desc: 'When an AI output needs your review', default: true },
    { event: 'System events', desc: 'Maintenance and system notifications', default: false },
  ];
  const [values, setValues] = useState(prefs.map((p) => p.default));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">Notification Preferences</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          {prefs.map((p, i) => (
            <label key={i} className="flex items-center justify-between rounded-lg bg-slate-800/40 p-3">
              <div>
                <p className="text-sm text-slate-200">{p.event}</p>
                <p className="text-[11px] text-slate-500">{p.desc}</p>
              </div>
              <input type="checkbox" checked={values[i]} onChange={(e) => setValues((prev) => prev.map((v, idx) => idx === i ? e.target.checked : v))}
                className="h-5 w-5 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500/30" />
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <Button size="sm" onClick={onClose}>Save Preferences</Button>
        </div>
      </div>
    </div>
  );
}
