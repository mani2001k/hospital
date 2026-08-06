import type { UserRole } from '@/lib/supabase';

export type Permission =
  | 'view_dashboard'
  | 'view_queues'
  | 'view_forecasts'
  | 'view_tasks'
  | 'assign_tasks'
  | 'escalate_tasks'
  | 'approve_actions'
  | 'view_predictions'
  | 'review_anomalies'
  | 'view_preventive_actions'
  | 'view_reports'
  | 'export_reports'
  | 'view_notifications'
  | 'manage_users'
  | 'view_audit'
  | 'manage_settings'
  | 'manage_patients'
  | 'manage_staff'
  | 'manage_wards'
  | 'view_patients'
  | 'view_staff'
  | 'view_wards';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  operations_admin: [
    'view_dashboard','view_queues','view_forecasts','view_tasks','assign_tasks',
    'escalate_tasks','approve_actions','view_predictions','review_anomalies',
    'view_preventive_actions','view_reports','export_reports','view_notifications',
    'manage_users','view_audit','manage_settings',
    'view_patients','manage_patients','view_staff','manage_staff','view_wards','manage_wards',
  ],
  manager: [
    'view_dashboard','view_queues','view_forecasts','view_tasks','assign_tasks',
    'escalate_tasks','approve_actions','view_predictions','review_anomalies',
    'view_preventive_actions','view_reports','export_reports','view_notifications','view_audit',
    'view_patients','manage_patients','view_staff','manage_staff','view_wards','manage_wards',
  ],
  analyst: [
    'view_dashboard','view_queues','view_forecasts','view_tasks','view_predictions',
    'review_anomalies','view_preventive_actions','view_reports','export_reports',
    'view_notifications','view_audit',
    'view_patients','view_staff','view_wards',
  ],
  field_staff: [
    'view_dashboard','view_queues','view_tasks','view_notifications',
    'view_patients',
  ],
};

export function hasPermission(role: UserRole | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function roleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    operations_admin: 'Operations Admin',
    manager: 'Manager',
    analyst: 'Analyst',
    field_staff: 'Field Staff',
  };
  return labels[role] ?? role;
}

export const WORKFLOW_STAGES = [
  'admission',
  'bed_allocation',
  'clinical_orders',
  'diagnostics',
  'treatment',
  'discharge',
  'follow_up',
] as const;

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export function stageLabel(stage: string): string {
  return stage
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
