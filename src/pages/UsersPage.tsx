import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { hasPermission, roleLabel, type Permission } from '@/lib/permissions';
import { PageHeader, Card, LoadingSpinner, Badge, EmptyState, Button } from '@/components/ui';
import { Pagination, SearchInput } from '@/components/TableControls';
import {
  Users, UserPlus, X, Shield, Clock, CheckCircle2, XCircle, Edit,
  Mail, Phone, Lock, Eye,
} from 'lucide-react';

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  phone: string | null;
  title: string | null;
  last_login_at: string | null;
  org_id: string | null;
  created_at: string;
}

const ROLES = ['operations_admin', 'manager', 'analyst', 'field_staff'];

const PERMISSION_LIST: { key: Permission; label: string }[] = [
  { key: 'view_dashboard', label: 'View Dashboard' },
  { key: 'view_queues', label: 'View Workflow Queues' },
  { key: 'view_forecasts', label: 'View Forecasts' },
  { key: 'view_tasks', label: 'View Tasks' },
  { key: 'assign_tasks', label: 'Assign Tasks' },
  { key: 'escalate_tasks', label: 'Escalate Tasks' },
  { key: 'approve_actions', label: 'Approve Actions' },
  { key: 'view_predictions', label: 'View Predictions' },
  { key: 'review_anomalies', label: 'Review Anomalies' },
  { key: 'view_preventive_actions', label: 'View Preventive Actions' },
  { key: 'view_reports', label: 'View Reports' },
  { key: 'export_reports', label: 'Export Reports' },
  { key: 'view_notifications', label: 'View Notifications' },
  { key: 'manage_users', label: 'Manage Users' },
  { key: 'view_audit', label: 'View Audit Logs' },
  { key: 'manage_settings', label: 'Manage Settings' },
];

const ROLE_PERMS: Record<string, Permission[]> = {
  operations_admin: PERMISSION_LIST.map((p) => p.key),
  manager: ['view_dashboard','view_queues','view_forecasts','view_tasks','assign_tasks','escalate_tasks','approve_actions','view_predictions','review_anomalies','view_preventive_actions','view_reports','export_reports','view_notifications','view_audit'],
  analyst: ['view_dashboard','view_queues','view_forecasts','view_tasks','view_predictions','review_anomalies','view_preventive_actions','view_reports','export_reports','view_notifications','view_audit'],
  field_staff: ['view_dashboard','view_queues','view_tasks','view_notifications'],
};

export default function UsersPage() {
  const { profile } = useAuth();
  const canManage = hasPermission(profile?.role, 'manage_users');
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createModal, setCreateModal] = useState(false);
  const [editUser, setEditUser] = useState<ProfileRow | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    let q = supabase
      .from('profiles')
      .select('*', { count: 'exact' });
    if (hasPermission(profile?.role, 'manage_users')) {
      // Admins see all users
    } else {
      q = q.eq('id', profile?.id);
    }
    if (roleFilter !== 'all') q = q.eq('role', roleFilter);
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    if (search.trim()) {
      q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }
    const from = (page - 1) * pageSize;
    const { data, count: total } = await q.order('created_at', { ascending: false }).range(from, from + pageSize - 1);
    setUsers((data ?? []) as ProfileRow[]);
    setCount(total ?? 0);
    setLoading(false);
  };

  useEffect(() => {
    loadUsers();
  }, [profile?.id, profile?.role, page, search, roleFilter, statusFilter]);

  return (
    <div>
      <PageHeader
        title="User & Role Management"
        subtitle="Create, view, edit, activate, and deactivate users. Manage roles, permissions, and organisational access with least-privilege defaults."
        breadcrumbs={[{ label: 'Home' }, { label: 'User Management' }]}
        actions={canManage && <Button size="sm" onClick={() => setCreateModal(true)}><UserPlus size={14} /> Add User</Button>}
      />

      {/* Filters */}
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by name or email…" />
          <div>
            <label className="mb-1 block text-[10px] font-medium text-slate-500">Role</label>
            <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 focus:border-sky-500/50 focus:outline-none">
              <option value="all">All Roles</option>
              {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r as any)}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium text-slate-500">Status</label>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 focus:border-sky-500/50 focus:outline-none">
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Role & permission matrix */}
      <Card className="mb-4 p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200"><Shield size={15} /> Role Permission Matrix</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-slate-700/50 text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Permission</th>
                {ROLES.map((r) => <th key={r} className="px-3 py-2 text-center font-medium">{roleLabel(r as any)}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {PERMISSION_LIST.map((p) => (
                <tr key={p.key} className="hover:bg-slate-800/20">
                  <td className="px-3 py-2 text-slate-300">{p.label}</td>
                  {ROLES.map((r) => (
                    <td key={r} className="px-3 py-2 text-center">
                      {ROLE_PERMS[r].includes(p.key) ? (
                        <CheckCircle2 size={14} className="inline text-emerald-400" />
                      ) : (
                        <XCircle size={14} className="inline text-slate-600" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Users table */}
      <Card className="overflow-hidden">
        {loading ? (
          <LoadingSpinner label="Loading users…" />
        ) : users.length === 0 ? (
          <EmptyState icon={<Users size={32} />} title="No users found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-700/50 bg-slate-800/30 text-xs text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Last Login</th>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                  <th className="px-4 py-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-200">{u.full_name}</p>
                      <p className="text-[11px] text-slate-500">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.role === 'operations_admin' ? 'critical' : u.role === 'manager' ? 'info' : u.role === 'analyst' ? 'warning' : 'neutral'}>
                        {roleLabel(u.role as any)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs ${u.status === 'active' ? 'text-emerald-400' : u.status === 'suspended' ? 'text-rose-400' : 'text-slate-500'}`}>
                        <span className={`h-2 w-2 rounded-full ${u.status === 'active' ? 'bg-emerald-400' : u.status === 'suspended' ? 'bg-rose-400' : 'bg-slate-500'}`} />
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-500">
                      {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-500">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManage && (
                        <button onClick={() => setEditUser(u)} className="text-slate-500 hover:text-sky-400">
                          <Edit size={15} />
                        </button>
                      )}
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

      {createModal && <CreateUserModal orgId={profile?.org_id} onClose={() => setCreateModal(false)} onDone={loadUsers} />}
      {editUser && <EditUserModal user={editUser} orgId={profile?.org_id} actorId={profile?.id} onClose={() => setEditUser(null)} onDone={loadUsers} />}
    </div>
  );
}

function CreateUserModal({ orgId, onClose, onDone }: { orgId: string | null | undefined; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('field_staff');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!email.trim() || !fullName.trim() || !password) { setError('Email, name, and password are required'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setSaving(true);
    setError(null);
    // Create auth user via signUp
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (authError || !authData.user) {
      setError(authError?.message ?? 'Failed to create user');
      setSaving(false);
      return;
    }
    // Create profile
    await supabase.from('profiles').upsert({
      id: authData.user.id,
      email: email.trim(),
      full_name: fullName.trim(),
      role,
      status: 'active',
      org_id: orgId,
      phone: phone.trim() || null,
      title: title.trim() || null,
    });
    await supabase.from('audit_logs').insert({
      org_id: orgId,
      actor_id: authData.user.id,
      action: 'user_creation',
      entity_type: 'profile',
      entity_id: authData.user.id,
      new_value: { email, role, full_name: fullName },
    });
    setSaving(false);
    onDone();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">Add New User</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <Field label="Full Name" icon={<Users size={14} />}>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-sky-500/50 focus:outline-none" />
          </Field>
          <Field label="Email" icon={<Mail size={14} />}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@hospital.io"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-sky-500/50 focus:outline-none" />
          </Field>
          <Field label="Password" icon={<Lock size={14} />}>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-sky-500/50 focus:outline-none" />
          </Field>
          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-sky-500/50 focus:outline-none">
              {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r as any)}</option>)}
            </select>
          </Field>
          <Field label="Phone" icon={<Phone size={14} />}>
            <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="555-0000"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-sky-500/50 focus:outline-none" />
          </Field>
          <Field label="Title">
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nurse, Doctor, etc."
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-sky-500/50 focus:outline-none" />
          </Field>
          {error && <p className="text-xs text-rose-400">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={create}>Create User</Button>
        </div>
      </div>
    </div>
  );
}

function EditUserModal({ user, orgId, actorId, onClose, onDone }: {
  user: ProfileRow; orgId: string | null | undefined; actorId: string | undefined; onClose: () => void; onDone: () => void;
}) {
  const [role, setRole] = useState(user.role);
  const [status, setStatus] = useState(user.status);
  const [title, setTitle] = useState(user.title ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const prev = { role: user.role, status: user.status, title: user.title };
    await supabase.from('profiles').update({ role, status, title: title || null, updated_at: new Date().toISOString() }).eq('id', user.id);
    await supabase.from('audit_logs').insert({
      org_id: orgId,
      actor_id: actorId,
      action: 'user_modification',
      entity_type: 'profile',
      entity_id: user.id,
      previous_value: prev,
      new_value: { role, status, title },
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
          <h3 className="text-sm font-semibold text-slate-100">Edit User</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-800/40 p-3">
            <p className="text-sm font-medium text-slate-200">{user.full_name}</p>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>
          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-sky-500/50 focus:outline-none">
              {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r as any)}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-sky-500/50 focus:outline-none">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </Field>
          <Field label="Title">
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-sky-500/50 focus:outline-none" />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={save}>Save Changes</Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-400">
        {icon} {label}
      </label>
      {children}
    </div>
  );
}
