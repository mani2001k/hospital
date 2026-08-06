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
import { BedDouble, Edit, Trash2, Building2 } from 'lucide-react';

interface WardRow {
  id: string;
  name: string;
  code: string;
  type: string;
  floor: string | null;
  total_beds: number;
  org_id: string;
  created_at: string;
  available_beds: number;
  occupied_beds: number;
  occupancy_pct: number;
}

const WARD_TYPES = [
  { value: 'ICU', label: 'ICU' },
  { value: 'Emergency', label: 'Emergency' },
  { value: 'General', label: 'General' },
  { value: 'Maternity', label: 'Maternity' },
  { value: 'Pediatric', label: 'Pediatric' },
  { value: 'Surgical', label: 'Surgical' },
  { value: 'Oncology', label: 'Oncology' },
];

const wardSchema = z.object({
  name: z.string().min(1, 'Ward name is required'),
  code: z.string().min(1, 'Ward code is required').max(10, 'Code must be 10 characters or less'),
  type: z.enum(['ICU', 'Emergency', 'General', 'Maternity', 'Pediatric', 'Surgical', 'Oncology']),
  floor: z.string().optional(),
  total_beds: z.number().int().min(0, 'Beds must be 0 or more').max(500, 'Maximum 500 beds'),
});

type WardFormData = z.infer<typeof wardSchema>;

export default function WardsPage() {
  const { profile } = useAuth();
  const canManage = hasPermission(profile?.role, 'manage_wards');
  const canView = hasPermission(profile?.role, 'view_wards');

  const [wards, setWards] = useState<WardRow[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WardRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WardRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const pageSize = 10;

  const loadWards = useCallback(async () => {
    if (!canView) return;
    setLoading(true);

    let wardQuery = supabase.from('wards').select('*', { count: 'exact' });

    if (profile?.org_id) {
      wardQuery = wardQuery.eq('org_id', profile.org_id);
    }
    if (typeFilter !== 'all') {
      wardQuery = wardQuery.eq('type', typeFilter);
    }
    if (search.trim()) {
      wardQuery = wardQuery.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
    }

    const from = (page - 1) * pageSize;
    const { data: wardData, error: wardErr, count: total } = await wardQuery
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (wardErr) {
      toast.error('Failed to load wards');
      setWards([]);
      setLoading(false);
      return;
    }

    const wardList = (wardData ?? []) as Omit<WardRow, 'available_beds' | 'occupied_beds' | 'occupancy_pct'>[];
    const wardIds = wardList.map((w) => w.id);

    let bedMap: Record<string, { total: number; occupied: number }> = {};
    if (wardIds.length > 0) {
      const { data: bedData } = await supabase
        .from('beds')
        .select('ward_id, status')
        .in('ward_id', wardIds);

      if (bedData) {
        for (const b of bedData as { ward_id: string; status: string }[]) {
          if (!bedMap[b.ward_id]) bedMap[b.ward_id] = { total: 0, occupied: 0 };
          bedMap[b.ward_id].total++;
          if (b.status === 'occupied') bedMap[b.ward_id].occupied++;
        }
      }
    }

    const enriched: WardRow[] = wardList.map((w) => {
      const beds = bedMap[w.id] ?? { total: 0, occupied: 0 };
      const availableBeds = beds.total - beds.occupied;
      const occupancyPct = beds.total > 0 ? Math.round((beds.occupied / beds.total) * 100) : 0;
      return {
        ...w,
        available_beds: availableBeds,
        occupied_beds: beds.occupied,
        occupancy_pct: occupancyPct,
      };
    });

    setWards(enriched);
    setCount(total ?? 0);
    setLoading(false);
  }, [canView, profile?.org_id, page, search, typeFilter]);

  useEffect(() => {
    loadWards();
  }, [loadWards]);

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (w: WardRow) => {
    setEditing(w);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('wards').delete().eq('id', deleteTarget.id);

    if (error) {
      if (error.code === '23503') {
        toast.error('Cannot delete ward — it has associated beds or staff. Remove those first.');
      } else {
        toast.error(error.message || 'Failed to delete ward');
      }
    } else {
      toast.success(`Ward ${deleteTarget.name} deleted`);
      setDeleteTarget(null);
      loadWards();
    }
    setDeleting(false);
  };

  if (!canView) {
    return (
      <div>
        <PageHeader title="Ward Management" breadcrumbs={[{ label: 'Home' }, { label: 'Wards' }]} />
        <EmptyState icon={<Building2 size={32} />} title="Access denied" description="You don't have permission to view wards." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Ward Management"
        subtitle="Manage hospital wards, bed capacity, and monitor occupancy rates."
        breadcrumbs={[{ label: 'Home' }, { label: 'Wards' }]}
        actions={canManage && <Button size="sm" onClick={openAdd}><BedDouble size={14} /> Add Ward</Button>}
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by name or code…" />
          <FilterSelect label="Type" value={typeFilter} onChange={(v) => { setTypeFilter(v); setPage(1); }} options={WARD_TYPES} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <LoadingSpinner label="Loading wards…" />
        ) : wards.length === 0 ? (
          <EmptyState
            icon={<Building2 size={32} />}
            title="No wards found"
            description={search || typeFilter !== 'all' ? 'Try adjusting your filters.' : 'Add your first ward to get started.'}
            action={canManage && <Button size="sm" onClick={openAdd}><BedDouble size={14} /> Add Ward</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-700/50 bg-slate-800/30 text-xs text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Ward</th>
                  <th className="hidden px-4 py-3 text-left font-medium md:table-cell">Code</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">Floor</th>
                  <th className="px-4 py-3 text-left font-medium">Beds</th>
                  <th className="px-4 py-3 text-left font-medium">Occupancy</th>
                  {canManage && <th className="px-4 py-3 text-right font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {wards.map((w) => (
                  <tr key={w.id} className="transition-colors hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-200">{w.name}</p>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <span className="font-mono text-xs text-slate-400">{w.code}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="info">{w.type}</Badge>
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-slate-400 lg:table-cell">{w.floor ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-xs">
                        <BedDouble size={14} className="text-slate-500" />
                        <span className="text-slate-300">{w.occupied_beds}/{w.total_beds}</span>
                        <span className="text-emerald-400">{w.available_beds} free</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-700">
                          <div
                            className={`h-full rounded-full transition-all ${w.occupancy_pct >= 90 ? 'bg-rose-500' : w.occupancy_pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${w.occupancy_pct}%` }}
                          />
                        </div>
                        <span className={`text-xs font-medium ${w.occupancy_pct >= 90 ? 'text-rose-400' : w.occupancy_pct >= 70 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {w.occupancy_pct}%
                        </span>
                      </div>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(w)} className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-700/40 hover:text-sky-400" aria-label="Edit ward">
                            <Edit size={15} />
                          </button>
                          <button onClick={() => setDeleteTarget(w)} className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-700/40 hover:text-rose-400" aria-label="Delete ward">
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
        <WardFormModal
          ward={editing}
          orgId={profile?.org_id}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); loadWards(); }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Ward"
        message={<>Are you sure you want to delete <span className="font-medium text-slate-200">{deleteTarget?.name}</span>? All beds in this ward will also be removed.</>}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function WardFormModal({
  ward,
  orgId,
  onClose,
  onSaved,
}: {
  ward: WardRow | null;
  orgId: string | null | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<WardFormData>({
    resolver: zodResolver(wardSchema),
    defaultValues: ward
      ? {
          name: ward.name,
          code: ward.code,
          type: (ward.type as 'ICU' | 'Emergency' | 'General' | 'Maternity' | 'Pediatric' | 'Surgical' | 'Oncology') ?? 'General',
          floor: ward.floor ?? '',
          total_beds: ward.total_beds,
        }
      : {
          name: '',
          code: '',
          type: 'General',
          floor: '',
          total_beds: 0,
        },
  });

  const onSubmit = async (data: WardFormData) => {
    const payload = {
      name: data.name,
      code: data.code.toUpperCase(),
      type: data.type,
      floor: data.floor || null,
      total_beds: data.total_beds,
      org_id: orgId,
    };

    if (ward) {
      const { error } = await supabase.from('wards').update(payload).eq('id', ward.id);
      if (error) {
        if (error.code === '23505') {
          toast.error('A ward with this code already exists in your organisation.');
        } else {
          toast.error(error.message || 'Failed to update ward');
        }
        return;
      }
      toast.success(`Ward ${data.name} updated`);
    } else {
      const { data: newWard, error } = await supabase.from('wards').insert(payload).select().single();
      if (error) {
        if (error.code === '23505') {
          toast.error('A ward with this code already exists in your organisation.');
        } else {
          toast.error(error.message || 'Failed to create ward');
        }
        return;
      }

      // Auto-create beds if total_beds > 0
      if (newWard && data.total_beds > 0) {
        const bedInserts = Array.from({ length: data.total_beds }, (_, i) => ({
          ward_id: newWard.id,
          bed_number: `${data.code}-${String(i + 1).padStart(2, '0')}`,
          status: 'available' as const,
        }));
        await supabase.from('beds').insert(bedInserts);
      }

      toast.success(`Ward ${data.name} added with ${data.total_beds} beds`);
    }
    onSaved();
  };

  return (
    <Modal
      open
      title={ward ? 'Edit Ward' : 'Add Ward'}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={isSubmitting} onClick={handleSubmit(onSubmit)}>
            {ward ? 'Save Changes' : 'Add Ward'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Ward Name" required error={errors.name?.message}>
          <input type="text" {...register('name')} className={errors.name ? errorInputClass : inputClass} placeholder="Intensive Care Unit" />
        </FormField>
        <FormField label="Ward Code" required error={errors.code?.message}>
          <input type="text" {...register('code')} className={errors.code ? errorInputClass : inputClass} placeholder="ICU01" maxLength={10} />
        </FormField>
        <FormField label="Type" required error={errors.type?.message}>
          <select {...register('type')} className={errors.type ? errorInputClass : selectClass}>
            {WARD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </FormField>
        <FormField label="Floor" error={errors.floor?.message}>
          <input type="text" {...register('floor')} className={inputClass} placeholder="Ground, 1st, 2nd…" />
        </FormField>
        <FormField label="Total Beds" required error={errors.total_beds?.message}>
          <input type="number" min={0} max={500} {...register('total_beds', { valueAsNumber: true })} className={errors.total_beds ? errorInputClass : inputClass} placeholder="20" />
        </FormField>
        {!ward && (
          <div className="sm:col-span-2">
            <p className="rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2 text-xs text-slate-400">
              Beds will be automatically created and set to available when a new ward is added.
            </p>
          </div>
        )}
      </form>
    </Modal>
  );
}
