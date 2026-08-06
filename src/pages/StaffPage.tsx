import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { hasPermission, roleLabel } from '@/lib/permissions';
import { PageHeader, Card, LoadingSpinner, Badge, EmptyState, Button } from '@/components/ui';
import { Pagination, SearchInput, FilterSelect } from '@/components/TableControls';
import { Modal, FormField, inputClass, errorInputClass, selectClass } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { UserPlus, Edit, Trash2, Shield, Briefcase } from 'lucide-react';

interface StaffRow {
  id: string;
  employee_code: string | null;
  full_name: string;
  role: string;
  system_role: string | null;
  title: string | null;
  department: string | null;
  shift_preference: string | null;
  status: string;
  ward_id: string | null;
  org_id: string;
  speciality: string | null;
  created_at: string;
}

const SYSTEM_ROLES = [
  { value: 'operations_admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'analyst', label: 'Analyst' },
  { value: 'field_staff', label: 'Field Staff' },
];

const STAFF_TITLES = [
  { value: 'Doctor', label: 'Doctor' },
  { value: 'Nurse', label: 'Nurse' },
  { value: 'Technician', label: 'Technician' },
  { value: 'Ward Manager', label: 'Ward Manager' },
  { value: 'Administrator', label: 'Administrator' },
];

const SHIFT_PREFERENCES = [
  { value: 'day', label: 'Day' },
  { value: 'night', label: 'Night' },
  { value: 'rotating', label: 'Rotating' },
  { value: 'flexible', label: 'Flexible' },
];

const DEPARTMENTS = [
  'Emergency', 'ICU', 'General Medicine', 'Surgery', 'Pediatrics',
  'Maternity', 'Oncology', 'Cardiology', 'Radiology', 'Laboratory', 'Administration',
];

const staffSchema = z.object({
  full_name: z.string().min(1, 'Full name is required'),
  employee_code: z.string().min(1, 'Employee ID is required'),
  system_role: z.enum(['operations_admin', 'manager', 'analyst', 'field_staff']),
  title: z.enum(['Doctor', 'Nurse', 'Technician', 'Ward Manager', 'Administrator']),
  department: z.string().min(1, 'Department is required'),
  shift_preference: z.enum(['day', 'night', 'rotating', 'flexible']),
  status: z.enum(['active', 'inactive', 'suspended']),
  speciality: z.string().optional(),
});

type StaffFormData = z.infer<typeof staffSchema>;

export default function StaffPage() {
  const { profile } = useAuth();
  const canManage = hasPermission(profile?.role, 'manage_staff');
  const canManageRoles = profile?.role === 'operations_admin';
  const canView = hasPermission(profile?.role, 'view_staff');

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [titleFilter, setTitleFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const pageSize = 10;

  const loadStaff = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    let q = supabase.from('staff').select('*', { count: 'exact' });

    if (profile?.org_id) {
      q = q.eq('org_id', profile.org_id);
    }

    if (roleFilter !== 'all') q = q.eq('system_role', roleFilter);
    if (titleFilter !== 'all') q = q.eq('role', titleFilter);

    if (search.trim()) {
      q = q.or(`full_name.ilike.%${search}%,employee_code.ilike.%${search}%,speciality.ilike.%${search}%`);
    }

    const from = (page - 1) * pageSize;
    const { data, error, count: total } = await q
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      toast.error('Failed to load staff');
      setStaff([]);
    } else {
      setStaff((data ?? []) as StaffRow[]);
      setCount(total ?? 0);
    }
    setLoading(false);
  }, [canView, profile?.org_id, page, search, roleFilter, titleFilter]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (s: StaffRow) => {
    setEditing(s);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('staff').delete().eq('id', deleteTarget.id);

    if (error) {
      toast.error('Failed to delete staff member');
    } else {
      toast.success(`Staff member ${deleteTarget.full_name} removed`);
      setDeleteTarget(null);
      loadStaff();
    }
    setDeleting(false);
  };

  if (!canView) {
    return (
      <div>
        <PageHeader title="Staff Management" breadcrumbs={[{ label: 'Home' }, { label: 'Staff' }]} />
        <EmptyState icon={<Briefcase size={32} />} title="Access denied" description="You don't have permission to view staff." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Staff Management"
        subtitle="Manage staff records, roles, departments, and shift preferences."
        breadcrumbs={[{ label: 'Home' }, { label: 'Staff' }]}
        actions={canManage && <Button size="sm" onClick={openAdd}><UserPlus size={14} /> Add Staff</Button>}
      />

      {canManageRoles && (
        <Card className="mb-4 border-sky-500/20 bg-sky-500/5 p-3">
          <div className="flex items-center gap-2 text-xs text-sky-300">
            <Shield size={14} />
            <span>You have admin privileges — role assignments and access controls are fully editable.</span>
          </div>
        </Card>
      )}

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by name, employee ID, speciality…" />
          <FilterSelect label="Role" value={roleFilter} onChange={(v) => { setRoleFilter(v); setPage(1); }} options={SYSTEM_ROLES} />
          <FilterSelect label="Title" value={titleFilter} onChange={(v) => { setTitleFilter(v); setPage(1); }} options={STAFF_TITLES} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <LoadingSpinner label="Loading staff…" />
        ) : staff.length === 0 ? (
          <EmptyState
            icon={<Briefcase size={32} />}
            title="No staff found"
            description={search || roleFilter !== 'all' || titleFilter !== 'all' ? 'Try adjusting your filters.' : 'Add your first staff member to get started.'}
            action={canManage && <Button size="sm" onClick={openAdd}><UserPlus size={14} /> Add Staff</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-700/50 bg-slate-800/30 text-xs text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="hidden px-4 py-3 text-left font-medium md:table-cell">Employee ID</th>
                  <th className="px-4 py-3 text-left font-medium">Title</th>
                  <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">Role</th>
                  <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">Department</th>
                  <th className="hidden px-4 py-3 text-left font-medium xl:table-cell">Shift</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  {canManage && <th className="px-4 py-3 text-right font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {staff.map((s) => (
                  <tr key={s.id} className="transition-colors hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-200">{s.full_name}</p>
                      {s.speciality && <p className="text-[11px] text-slate-500">{s.speciality}</p>}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <span className="font-mono text-xs text-slate-400">{s.employee_code ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-300">{s.role}</td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      {s.system_role && (
                        <Badge variant={s.system_role === 'operations_admin' ? 'critical' : s.system_role === 'manager' ? 'info' : s.system_role === 'analyst' ? 'warning' : 'neutral'}>
                          {roleLabel(s.system_role as 'operations_admin' | 'manager' | 'analyst' | 'field_staff')}
                        </Badge>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-slate-400 lg:table-cell">{s.department ?? '—'}</td>
                    <td className="hidden px-4 py-3 text-xs capitalize text-slate-400 xl:table-cell">{s.shift_preference ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs ${s.status === 'active' ? 'text-emerald-400' : s.status === 'suspended' ? 'text-rose-400' : 'text-slate-500'}`}>
                        <span className={`h-2 w-2 rounded-full ${s.status === 'active' ? 'bg-emerald-400' : s.status === 'suspended' ? 'bg-rose-400' : 'bg-slate-500'}`} />
                        {s.status}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(s)} className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-700/40 hover:text-sky-400" aria-label="Edit staff">
                            <Edit size={15} />
                          </button>
                          <button onClick={() => setDeleteTarget(s)} className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-700/40 hover:text-rose-400" aria-label="Delete staff">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    )}
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

      {formOpen && (
        <StaffFormModal
          staff={editing}
          orgId={profile?.org_id}
          canManageRoles={canManageRoles}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); loadStaff(); }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove Staff Member"
        message={<>Are you sure you want to remove <span className="font-medium text-slate-200">{deleteTarget?.full_name}</span>? This will permanently delete the staff record.</>}
        confirmLabel="Remove"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function StaffFormModal({
  staff,
  orgId,
  canManageRoles,
  onClose,
  onSaved,
}: {
  staff: StaffRow | null;
  orgId: string | null | undefined;
  canManageRoles: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StaffFormData>({
    resolver: zodResolver(staffSchema),
    defaultValues: staff
      ? {
          full_name: staff.full_name,
          employee_code: staff.employee_code ?? '',
          system_role: (staff.system_role as 'operations_admin' | 'manager' | 'analyst' | 'field_staff') ?? 'field_staff',
          title: (staff.role as 'Doctor' | 'Nurse' | 'Technician' | 'Ward Manager' | 'Administrator') ?? 'Doctor',
          department: staff.department ?? '',
          shift_preference: (staff.shift_preference as 'day' | 'night' | 'rotating' | 'flexible') ?? 'day',
          status: (staff.status as 'active' | 'inactive' | 'suspended') ?? 'active',
          speciality: staff.speciality ?? '',
        }
      : {
          full_name: '',
          employee_code: '',
          system_role: 'field_staff',
          title: 'Doctor',
          department: '',
          shift_preference: 'day',
          status: 'active',
          speciality: '',
        },
  });

  const onSubmit = async (data: StaffFormData) => {
    const payload = {
      full_name: data.full_name,
      employee_code: data.employee_code,
      role: data.title,
      system_role: data.system_role,
      department: data.department,
      shift_preference: data.shift_preference,
      status: data.status,
      speciality: data.speciality || null,
      org_id: orgId,
    };

    if (staff) {
      const { error } = await supabase.from('staff').update(payload).eq('id', staff.id);
      if (error) {
        toast.error(error.message || 'Failed to update staff member');
        return;
      }
      toast.success(`Staff member ${data.full_name} updated`);
    } else {
      const { error } = await supabase.from('staff').insert(payload);
      if (error) {
        toast.error(error.message || 'Failed to create staff member');
        return;
      }
      toast.success(`Staff member ${data.full_name} added`);
    }
    onSaved();
  };

  return (
    <Modal
      open
      title={staff ? 'Edit Staff Member' : 'Add Staff Member'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={isSubmitting} onClick={handleSubmit(onSubmit)}>
            {staff ? 'Save Changes' : 'Add Staff'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Full Name" required error={errors.full_name?.message}>
          <input type="text" {...register('full_name')} className={errors.full_name ? errorInputClass : inputClass} placeholder="Dr. Jane Smith" />
        </FormField>
        <FormField label="Employee ID" required error={errors.employee_code?.message}>
          <input type="text" {...register('employee_code')} className={errors.employee_code ? errorInputClass : inputClass} placeholder="EMP-001" />
        </FormField>
        <FormField label="Title" required error={errors.title?.message}>
          <select {...register('title')} className={errors.title ? errorInputClass : selectClass}>
            {STAFF_TITLES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </FormField>
        <FormField label="Access Role" required error={errors.system_role?.message}>
          <select {...register('system_role')} className={errors.system_role ? errorInputClass : selectClass} disabled={!canManageRoles}>
            {SYSTEM_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          {!canManageRoles && <p className="mt-1 text-[10px] text-slate-500">Only admins can change access roles.</p>}
        </FormField>
        <FormField label="Department" required error={errors.department?.message}>
          <select {...register('department')} className={errors.department ? errorInputClass : selectClass}>
            <option value="">Select department…</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </FormField>
        <FormField label="Shift Preference" required error={errors.shift_preference?.message}>
          <select {...register('shift_preference')} className={errors.shift_preference ? errorInputClass : selectClass}>
            {SHIFT_PREFERENCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </FormField>
        <FormField label="Status" required error={errors.status?.message}>
          <select {...register('status')} className={errors.status ? errorInputClass : selectClass}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
        </FormField>
        <FormField label="Speciality" error={errors.speciality?.message}>
          <input type="text" {...register('speciality')} className={inputClass} placeholder="Cardiology, Emergency, etc." />
        </FormField>
      </form>
    </Modal>
  );
}
