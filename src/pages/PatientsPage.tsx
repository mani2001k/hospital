import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { hasPermission } from '@/lib/permissions';
import { PageHeader, Card, LoadingSpinner, Badge, EmptyState, Button } from '@/components/ui';
import { Pagination, SearchInput, FilterSelect } from '@/components/TableControls';
import { Modal, FormField, inputClass, errorInputClass, selectClass } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { UserPlus, Edit, Trash2, Phone, Mail, Users } from 'lucide-react';

interface PatientRow {
  id: string;
  mrn: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: string;
  org_id: string;
  blood_group: string | null;
  emergency_contact: string | null;
  insurance_provider: string | null;
  created_at: string;
}

const patientSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  date_of_birth: z.string().min(1, 'Date of birth is required'),
  gender: z.string().min(1, 'Gender is required'),
  phone: z.string().min(7, 'Phone must be at least 7 digits').regex(/^[\d\s\-\+\(\)]+$/, 'Invalid phone format'),
  email: z.string().email('Invalid email format').or(z.literal('')),
  address: z.string().optional(),
  status: z.enum(['active', 'inactive', 'discharged']),
  blood_group: z.string().optional(),
  emergency_contact: z.string().optional(),
  insurance_provider: z.string().optional(),
});

type PatientFormData = z.infer<typeof patientSchema>;

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'discharged', label: 'Discharged' },
];

export default function PatientsPage() {
  const { profile } = useAuth();
  const canManage = hasPermission(profile?.role, 'manage_patients');
  const canView = hasPermission(profile?.role, 'view_patients');

  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PatientRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PatientRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const pageSize = 10;

  const loadPatients = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    let q = supabase.from('patients').select('*', { count: 'exact' });

    if (profile?.org_id) {
      q = q.eq('org_id', profile.org_id);
    }
    q = q.is('deleted_at', null);

    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    if (genderFilter !== 'all') q = q.eq('gender', genderFilter);

    if (search.trim()) {
      q = q.or(`full_name.ilike.%${search}%,mrn.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const from = (page - 1) * pageSize;
    const { data, error, count: total } = await q
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      toast.error('Failed to load patients');
      setPatients([]);
    } else {
      setPatients((data ?? []) as PatientRow[]);
      setCount(total ?? 0);
    }
    setLoading(false);
  }, [canView, profile?.org_id, page, search, statusFilter, genderFilter]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (patient: PatientRow) => {
    setEditing(patient);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase
      .from('patients')
      .update({ deleted_at: new Date().toISOString(), status: 'inactive' })
      .eq('id', deleteTarget.id);

    if (error) {
      toast.error('Failed to delete patient');
    } else {
      toast.success(`Patient ${deleteTarget.full_name} deleted`);
      setDeleteTarget(null);
      loadPatients();
    }
    setDeleting(false);
  };

  if (!canView) {
    return (
      <div>
        <PageHeader title="Patient Management" breadcrumbs={[{ label: 'Home' }, { label: 'Patients' }]} />
        <EmptyState icon={<Users size={32} />} title="Access denied" description="You don't have permission to view patients." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Patient Management"
        subtitle="Manage patient records, demographics, and contact information."
        breadcrumbs={[{ label: 'Home' }, { label: 'Patients' }]}
        actions={canManage && <Button size="sm" onClick={openAdd}><UserPlus size={14} /> Add Patient</Button>}
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by name, MRN, email, phone…" />
          <FilterSelect label="Status" value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} options={STATUS_OPTIONS} />
          <FilterSelect label="Gender" value={genderFilter} onChange={(v) => { setGenderFilter(v); setPage(1); }} options={GENDER_OPTIONS} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <LoadingSpinner label="Loading patients…" />
        ) : patients.length === 0 ? (
          <EmptyState
            icon={<Users size={32} />}
            title="No patients found"
            description={search || statusFilter !== 'all' || genderFilter !== 'all' ? 'Try adjusting your filters.' : 'Add your first patient to get started.'}
            action={canManage && <Button size="sm" onClick={openAdd}><UserPlus size={14} /> Add Patient</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-700/50 bg-slate-800/30 text-xs text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Patient</th>
                  <th className="px-4 py-3 text-left font-medium">MRN</th>
                  <th className="hidden px-4 py-3 text-left font-medium md:table-cell">DOB</th>
                  <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">Gender</th>
                  <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">Contact</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  {canManage && <th className="px-4 py-3 text-right font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {patients.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-200">{p.full_name}</p>
                      <p className="text-[11px] text-slate-500">{p.email ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-slate-400">{p.mrn}</span>
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-slate-400 md:table-cell">
                      {p.date_of_birth ? new Date(p.date_of_birth).toLocaleDateString() : '—'}
                    </td>
                    <td className="hidden px-4 py-3 text-xs capitalize text-slate-400 lg:table-cell">{p.gender ?? '—'}</td>
                    <td className="hidden px-4 py-3 text-xs text-slate-400 lg:table-cell">
                      {p.phone ? (
                        <span className="flex items-center gap-1"><Phone size={11} /> {p.phone}</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={p.status === 'active' ? 'success' : p.status === 'discharged' ? 'info' : 'neutral'}>
                        {p.status}
                      </Badge>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(p)} className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-700/40 hover:text-sky-400" aria-label="Edit patient">
                            <Edit size={15} />
                          </button>
                          <button onClick={() => setDeleteTarget(p)} className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-700/40 hover:text-rose-400" aria-label="Delete patient">
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
        <PatientFormModal
          patient={editing}
          orgId={profile?.org_id}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); loadPatients(); }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Patient"
        message={<>Are you sure you want to delete <span className="font-medium text-slate-200">{deleteTarget?.full_name}</span>? This action will mark the patient as inactive and cannot be undone.</>}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function generateMRN(): string {
  const stamp = Date.now().toString().slice(-6);
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `MRN-${stamp}${rand}`;
}

function PatientFormModal({
  patient,
  orgId,
  onClose,
  onSaved,
}: {
  patient: PatientRow | null;
  orgId: string | null | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PatientFormData>({
    resolver: zodResolver(patientSchema),
    defaultValues: patient
      ? {
          first_name: patient.first_name ?? '',
          last_name: patient.last_name ?? '',
          date_of_birth: patient.date_of_birth ? patient.date_of_birth.split('T')[0] : '',
          gender: patient.gender ?? '',
          phone: patient.phone ?? '',
          email: patient.email ?? '',
          address: patient.address ?? '',
          status: (patient.status as 'active' | 'inactive' | 'discharged') ?? 'active',
          blood_group: patient.blood_group ?? '',
          emergency_contact: patient.emergency_contact ?? '',
          insurance_provider: patient.insurance_provider ?? '',
        }
      : {
          first_name: '',
          last_name: '',
          date_of_birth: '',
          gender: '',
          phone: '',
          email: '',
          address: '',
          status: 'active',
          blood_group: '',
          emergency_contact: '',
          insurance_provider: '',
        },
  });

  const onSubmit = async (data: PatientFormData) => {
    const fullName = `${data.first_name} ${data.last_name}`.trim();
    const payload = {
      full_name: fullName,
      first_name: data.first_name,
      last_name: data.last_name,
      date_of_birth: data.date_of_birth || null,
      gender: data.gender || null,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
      status: data.status,
      blood_group: data.blood_group || null,
      emergency_contact: data.emergency_contact || null,
      insurance_provider: data.insurance_provider || null,
      org_id: orgId,
    };

    if (patient) {
      const { error } = await supabase.from('patients').update(payload).eq('id', patient.id);
      if (error) {
        toast.error(error.message || 'Failed to update patient');
        return;
      }
      toast.success(`Patient ${fullName} updated`);
    } else {
      const mrn = generateMRN();
      const { error } = await supabase.from('patients').insert({ ...payload, mrn });
      if (error) {
        if (error.code === '23505') {
          toast.error('A patient with this MRN already exists. Please try again.');
        } else {
          toast.error(error.message || 'Failed to create patient');
        }
        return;
      }
      toast.success(`Patient ${fullName} added`);
    }
    onSaved();
  };

  return (
    <Modal
      open
      title={patient ? 'Edit Patient' : 'Add Patient'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={isSubmitting} onClick={handleSubmit(onSubmit)}>
            {patient ? 'Save Changes' : 'Add Patient'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="First Name" required error={errors.first_name?.message}>
          <input type="text" {...register('first_name')} className={errors.first_name ? errorInputClass : inputClass} placeholder="Jane" />
        </FormField>
        <FormField label="Last Name" required error={errors.last_name?.message}>
          <input type="text" {...register('last_name')} className={errors.last_name ? errorInputClass : inputClass} placeholder="Doe" />
        </FormField>
        <FormField label="Date of Birth" required error={errors.date_of_birth?.message}>
          <input type="date" {...register('date_of_birth')} className={errors.date_of_birth ? errorInputClass : inputClass} />
        </FormField>
        <FormField label="Gender" required error={errors.gender?.message}>
          <select {...register('gender')} className={errors.gender ? errorInputClass : selectClass}>
            <option value="">Select gender…</option>
            {GENDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </FormField>
        <FormField label="Phone" required error={errors.phone?.message}>
          <input type="tel" {...register('phone')} className={errors.phone ? errorInputClass : inputClass} placeholder="555-0000" />
        </FormField>
        <FormField label="Email" error={errors.email?.message}>
          <input type="email" {...register('email')} className={errors.email ? errorInputClass : inputClass} placeholder="jane@example.com" />
        </FormField>
        <FormField label="Address" error={errors.address?.message}>
          <input type="text" {...register('address')} className={inputClass} placeholder="123 Main St, City" />
        </FormField>
        <FormField label="Status" required error={errors.status?.message}>
          <select {...register('status')} className={errors.status ? errorInputClass : selectClass}>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </FormField>
        <FormField label="Blood Group" error={errors.blood_group?.message}>
          <select {...register('blood_group')} className={selectClass}>
            <option value="">Unknown</option>
            {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </FormField>
        <FormField label="Emergency Contact" error={errors.emergency_contact?.message}>
          <input type="text" {...register('emergency_contact')} className={inputClass} placeholder="555-0000" />
        </FormField>
        <FormField label="Insurance Provider" error={errors.insurance_provider?.message}>
          <input type="text" {...register('insurance_provider')} className={inputClass} placeholder="Provider name" />
        </FormField>
      </form>
    </Modal>
  );
}
