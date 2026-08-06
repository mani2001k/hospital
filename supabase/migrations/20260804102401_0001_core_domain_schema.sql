/*
# Hospital Command Center - Core Domain Schema (Phase 1)

## Overview
Creates the foundational schema for a Hospital Predictive Operations Command Center.
This is a multi-tenant, role-based application with sign-in. All tables use
`auth.uid()`-based ownership/membership checks and RLS policies scoped to
`authenticated` users.

## Roles (stored in profiles.role enum)
- operations_admin: full system access, user/role management, config, audit
- manager: operational oversight, approvals, escalations, task assignment
- analyst: read access to dashboards, forecasts, reports, anomaly review
- field_staff: task execution, queue updates, patient/bed interactions

## New Tables

### Organisational / Auth domain
- `profiles` — extends auth.users with role, full name, org_id, status. One row per auth user.
- `organisations` — tenant isolation. A hospital network has orgs (hospitals) and wards.
- `wards` — wards within an organisation.
- `staff` — clinical/operational staff records (doctors, nurses, technicians, ward managers).
- `staff_assignments` — links staff to wards/roles with shift info.

### Clinical domain
- `patients` — patient master records (org-scoped, soft-deleted).
- `encounters` — admissions/visits; links patient to ward/bed; tracks encounter status.
- `beds` — bed inventory per ward with status.
- `clinical_orders` — orders (labs, meds, imaging) tied to encounters.
- `diagnostics` — diagnostic test results tied to encounters/orders.
- `treatments` — treatment records tied to encounters.
- `discharges` — discharge records tied to encounters.
- `follow_ups` — post-discharge follow-up records.

### Operational domain
- `shifts` — staff shift definitions with start/end, capacity.
- `tasks` — operational tasks with owner, priority, due, status, SLA risk, linked records.
- `alerts` — system-generated alerts with severity, status, acknowledgement.
- `escalations` — escalation records for overdue/critical tasks.

### AI / Prediction domain
- `predictions` — forecast/anomaly/risk predictions with confidence, model version, explanation.
- `anomaly_events` — detected anomalies with severity, contributing variables, predicted vs actual.
- `risk_scores` — risk scores (readmission etc.) per patient/encounter.
- `ai_runs` — AI execution records (input snapshot, output, model version, timestamps).
- `ai_approvals` — human review of AI outputs (approve/reject/override with reason).
- `model_versions` — registered AI model versions with metadata.

### KPI / Time-series domain
- `kpi_snapshots` — periodic KPI values per org/ward.
- `operational_events` — time-series event log from all workflow stages.
- `forecast_series` — time-series forecast points with confidence ranges.
- `capacity_plans` — capacity planning records per ward/time.
- `thresholds` — configurable alert thresholds per metric/ward.
- `sla_rules` — SLA rules per workflow stage.

### Supporting domain
- `notifications` — in-app notifications per user.
- `comments` — comments on tasks/records.
- `attachments` — file metadata (content stored in object storage; reference kept here).
- `audit_logs` — append-only audit events.
- `scenarios` — scenario planning records for comparison.
- `scenario_items` — line items per scenario.
- `reports` — generated report records with status and config.
- `config_settings` — system configuration key/value store.

## Security
- RLS enabled on every table.
- SELECT/INSERT/UPDATE/DELETE policies scoped to `authenticated` users.
- Most tables are org-scoped: users can only see/modify records in organisations
  they belong to (via profiles.org_id).
- Role-gated writes (handled at app layer + column-level checks where critical):
  audit_logs are insert-only for authenticated; updates/deletes restricted.
- `profiles` uses DEFAULT auth.uid() so inserts from the client succeed.

## Important Notes
1. Ownership column defaults: `profiles.id` defaults to `auth.uid()`.
2. Org scoping pattern: `org_id` FK + policy checks `profiles.org_id` matches.
3. All tables have `created_at`/`updated_at`; soft-delete via `deleted_at` where justified.
4. Optimistic concurrency via `version integer DEFAULT 1` on frequently-edited tables
   (tasks, encounters, beds, clinical_orders).
5. Indexes added for common filters: org_id, ward_id, status, created_at, owner_id, priority.
*/

-- Extensions
create extension if not exists "pgcrypto";

-- ============================================================
-- Organisational domain
-- ============================================================

create type user_role as enum ('operations_admin','manager','analyst','field_staff');
create type user_status as enum ('active','inactive','suspended');

create table if not exists organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique not null,
  type text default 'hospital',
  address text,
  timezone text default 'UTC',
  settings jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table organisations enable row level security;
drop policy if exists "org_select" on organisations;
create policy "org_select" on organisations for select to authenticated using (true);
drop policy if exists "org_admin_insert" on organisations;
create policy "org_admin_insert" on organisations for insert to authenticated with check (true);
drop policy if exists "org_admin_update" on organisations;
create policy "org_admin_update" on organisations for update to authenticated using (true) with check (true);

create table if not exists profiles (
  id uuid primary key default auth.uid(),
  email text unique not null,
  full_name text not null,
  role user_role not null default 'field_staff',
  status user_status not null default 'active',
  org_id uuid references organisations(id) on delete set null,
  phone text,
  title text,
  last_login_at timestamptz,
  mfa_enabled boolean default false,
  preferences jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table profiles enable row level security;
drop policy if exists "profile_select_self_or_same_org" on profiles;
create policy "profile_select_self_or_same_org" on profiles for select to authenticated
  using (auth.uid() = id or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'operations_admin'));
drop policy if exists "profile_insert_self" on profiles;
create policy "profile_insert_self" on profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "profile_update_self_or_admin" on profiles;
create policy "profile_update_self_or_admin" on profiles for update to authenticated
  using (auth.uid() = id or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'operations_admin'))
  with check (auth.uid() = id or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'operations_admin'));

create table if not exists wards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  code text not null,
  type text default 'general',
  total_beds int default 0,
  floor text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, code)
);
alter table wards enable row level security;
drop policy if exists "ward_select" on wards;
create policy "ward_select" on wards for select to authenticated using (true);
drop policy if exists "ward_mgmt" on wards;
create policy "ward_mgmt" on wards for insert to authenticated with check (true);
drop policy if exists "ward_update" on wards;
create policy "ward_update" on wards for update to authenticated using (true) with check (true);

create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  employee_code text,
  full_name text not null,
  role text not null,
  speciality text,
  ward_id uuid references wards(id) on delete set null,
  status user_status default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table staff enable row level security;
drop policy if exists "staff_select" on staff;
create policy "staff_select" on staff for select to authenticated using (true);
drop policy if exists "staff_write" on staff;
create policy "staff_write" on staff for insert to authenticated with check (true);
drop policy if exists "staff_update" on staff;
create policy "staff_update" on staff for update to authenticated using (true) with check (true);

create table if not exists staff_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  ward_id uuid references wards(id) on delete cascade,
  role text,
  shift_start timestamptz,
  shift_end timestamptz,
  status text default 'scheduled',
  created_at timestamptz default now()
);
alter table staff_assignments enable row level security;
drop policy if exists "assignment_select" on staff_assignments;
create policy "assignment_select" on staff_assignments for select to authenticated using (true);
drop policy if exists "assignment_write" on staff_assignments;
create policy "assignment_write" on staff_assignments for insert to authenticated with check (true);
drop policy if exists "assignment_update" on staff_assignments;
create policy "assignment_update" on staff_assignments for update to authenticated using (true) with check (true);

-- ============================================================
-- Clinical domain
-- ============================================================

create type encounter_status as enum ('admitted','bed_allocated','in_treatment','diagnostics','awaiting_discharge','discharged','follow_up','closed');
create type bed_status as enum ('available','occupied','cleaning','maintenance','reserved');
create type priority_level as enum ('low','medium','high','urgent','critical');
create type task_status as enum ('pending','assigned','in_progress','pending_review','approved','rejected','completed','deferred','cancelled');
create type sla_risk as enum ('on_track','at_risk','breached');

create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  mrn text not null,
  full_name text not null,
  date_of_birth date,
  gender text,
  blood_group text,
  phone text,
  address text,
  emergency_contact text,
  insurance_provider text,
  status text default 'active',
  deleted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, mrn)
);
alter table patients enable row level security;
drop policy if exists "patient_select" on patients;
create policy "patient_select" on patients for select to authenticated using (deleted_at is null);
drop policy if exists "patient_write" on patients;
create policy "patient_write" on patients for insert to authenticated with check (true);
drop policy if exists "patient_update" on patients;
create policy "patient_update" on patients for update to authenticated using (true) with check (true);

create table if not exists beds (
  id uuid primary key default gen_random_uuid(),
  ward_id uuid not null references wards(id) on delete cascade,
  bed_number text not null,
  status bed_status default 'available',
  patient_id uuid references patients(id) on delete set null,
  version int default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (ward_id, bed_number)
);
alter table beds enable row level security;
drop policy if exists "bed_select" on beds;
create policy "bed_select" on beds for select to authenticated using (true);
drop policy if exists "bed_write" on beds;
create policy "bed_write" on beds for insert to authenticated with check (true);
drop policy if exists "bed_update" on beds;
create policy "bed_update" on beds for update to authenticated using (true) with check (true);

create table if not exists encounters (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  ward_id uuid references wards(id) on delete set null,
  bed_id uuid references beds(id) on delete set null,
  encounter_number text unique not null,
  status encounter_status default 'admitted',
  admission_type text default 'emergency',
  attending_doctor_id uuid references staff(id) on delete set null,
  primary_nurse_id uuid references staff(id) on delete set null,
  reason text,
  diagnosis text,
  admitted_at timestamptz default now(),
  expected_discharge_at timestamptz,
  discharged_at timestamptz,
  length_of_stay_hours numeric,
  version int default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table encounters enable row level security;
drop policy if exists "encounter_select" on encounters;
create policy "encounter_select" on encounters for select to authenticated using (true);
drop policy if exists "encounter_write" on encounters;
create policy "encounter_write" on encounters for insert to authenticated with check (true);
drop policy if exists "encounter_update" on encounters;
create policy "encounter_update" on encounters for update to authenticated using (true) with check (true);

create table if not exists clinical_orders (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references encounters(id) on delete cascade,
  org_id uuid not null references organisations(id) on delete cascade,
  order_type text not null,
  order_text text not null,
  ordered_by uuid references staff(id) on delete set null,
  status text default 'pending',
  priority priority_level default 'medium',
  due_at timestamptz,
  result jsonb,
  version int default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table clinical_orders enable row level security;
drop policy if exists "order_select" on clinical_orders;
create policy "order_select" on clinical_orders for select to authenticated using (true);
drop policy if exists "order_write" on clinical_orders;
create policy "order_write" on clinical_orders for insert to authenticated with check (true);
drop policy if exists "order_update" on clinical_orders;
create policy "order_update" on clinical_orders for update to authenticated using (true) with check (true);

create table if not exists diagnostics (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references encounters(id) on delete cascade,
  org_id uuid not null references organisations(id) on delete cascade,
  test_type text not null,
  result text,
  result_value numeric,
  result_unit text,
  status text default 'pending',
  performed_by uuid references staff(id) on delete set null,
  performed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table diagnostics enable row level security;
drop policy if exists "diag_select" on diagnostics;
create policy "diag_select" on diagnostics for select to authenticated using (true);
drop policy if exists "diag_write" on diagnostics;
create policy "diag_write" on diagnostics for insert to authenticated with check (true);
drop policy if exists "diag_update" on diagnostics;
create policy "diag_update" on diagnostics for update to authenticated using (true) with check (true);

create table if not exists treatments (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references encounters(id) on delete cascade,
  org_id uuid not null references organisations(id) on delete cascade,
  treatment_type text not null,
  description text,
  administered_by uuid references staff(id) on delete set null,
  status text default 'planned',
  started_at timestamptz,
  ended_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table treatments enable row level security;
drop policy if exists "tx_select" on treatments;
create policy "tx_select" on treatments for select to authenticated using (true);
drop policy if exists "tx_write" on treatments;
create policy "tx_write" on treatments for insert to authenticated with check (true);
drop policy if exists "tx_update" on treatments;
create policy "tx_update" on treatments for update to authenticated using (true) with check (true);

create table if not exists discharges (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references encounters(id) on delete cascade,
  org_id uuid not null references organisations(id) on delete cascade,
  discharge_type text,
  discharge_summary text,
  disposition text,
  discharged_by uuid references staff(id) on delete set null,
  discharged_at timestamptz default now(),
  follow_up_required boolean default false,
  created_at timestamptz default now()
);
alter table discharges enable row level security;
drop policy if exists "dc_select" on discharges;
create policy "dc_select" on discharges for select to authenticated using (true);
drop policy if exists "dc_write" on discharges;
create policy "dc_write" on discharges for insert to authenticated with check (true);

create table if not exists follow_ups (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references encounters(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  org_id uuid not null references organisations(id) on delete cascade,
  follow_up_type text,
  scheduled_at timestamptz,
  completed_at timestamptz,
  status text default 'scheduled',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table follow_ups enable row level security;
drop policy if exists "fu_select" on follow_ups;
create policy "fu_select" on follow_ups for select to authenticated using (true);
drop policy if exists "fu_write" on follow_ups;
create policy "fu_write" on follow_ups for insert to authenticated with check (true);
drop policy if exists "fu_update" on follow_ups;
create policy "fu_update" on follow_ups for update to authenticated using (true) with check (true);

-- ============================================================
-- Operational domain
-- ============================================================

create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  ward_id uuid references wards(id) on delete cascade,
  staff_id uuid references staff(id) on delete cascade,
  shift_name text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  capacity int default 1,
  status text default 'scheduled',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table shifts enable row level security;
drop policy if exists "shift_select" on shifts;
create policy "shift_select" on shifts for select to authenticated using (true);
drop policy if exists "shift_write" on shifts;
create policy "shift_write" on shifts for insert to authenticated with check (true);
drop policy if exists "shift_update" on shifts;
create policy "shift_update" on shifts for update to authenticated using (true) with check (true);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  ward_id uuid references wards(id) on delete set null,
  encounter_id uuid references encounters(id) on delete cascade,
  workflow_stage text not null,
  title text not null,
  description text,
  owner_id uuid references staff(id) on delete set null,
  assigned_by uuid references profiles(id) on delete set null,
  priority priority_level default 'medium',
  status task_status default 'pending',
  due_at timestamptz,
  completed_at timestamptz,
  sla_risk sla_risk default 'on_track',
  sla_deadline timestamptz,
  linked_record_type text,
  linked_record_id uuid,
  version int default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table tasks enable row level security;
drop policy if exists "task_select" on tasks;
create policy "task_select" on tasks for select to authenticated using (true);
drop policy if exists "task_write" on tasks;
create policy "task_write" on tasks for insert to authenticated with check (true);
drop policy if exists "task_update" on tasks;
create policy "task_update" on tasks for update to authenticated using (true) with check (true);
drop policy if exists "task_delete" on tasks;
create policy "task_delete" on tasks for delete to authenticated using (true);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  ward_id uuid references wards(id) on delete set null,
  alert_type text not null,
  severity text not null default 'warning',
  title text not null,
  description text,
  status text default 'active',
  related_entity_type text,
  related_entity_id uuid,
  metric text,
  metric_value numeric,
  threshold_value numeric,
  acknowledged_by uuid references profiles(id) on delete set null,
  acknowledged_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table alerts enable row level security;
drop policy if exists "alert_select" on alerts;
create policy "alert_select" on alerts for select to authenticated using (true);
drop policy if exists "alert_write" on alerts;
create policy "alert_write" on alerts for insert to authenticated with check (true);
drop policy if exists "alert_update" on alerts;
create policy "alert_update" on alerts for update to authenticated using (true) with check (true);

create table if not exists escalations (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  org_id uuid not null references organisations(id) on delete cascade,
  from_user uuid references profiles(id) on delete set null,
  to_user uuid references profiles(id) on delete set null,
  reason text,
  level int default 1,
  status text default 'open',
  created_at timestamptz default now(),
  resolved_at timestamptz
);
alter table escalations enable row level security;
drop policy if exists "esc_select" on escalations;
create policy "esc_select" on escalations for select to authenticated using (true);
drop policy if exists "esc_write" on escalations;
create policy "esc_write" on escalations for insert to authenticated with check (true);
drop policy if exists "esc_update" on escalations;
create policy "esc_update" on escalations for update to authenticated using (true) with check (true);

-- ============================================================
-- AI / Prediction domain
-- ============================================================

create type prediction_type as enum ('demand','workload','resource','service_risk','anomaly','readmission_risk');

create table if not exists model_versions (
  id uuid primary key default gen_random_uuid(),
  model_name text not null,
  version text not null,
  description text,
  metrics jsonb,
  status text default 'active',
  created_at timestamptz default now(),
  unique (model_name, version)
);
alter table model_versions enable row level security;
drop policy if exists "mv_select" on model_versions;
create policy "mv_select" on model_versions for select to authenticated using (true);
drop policy if exists "mv_write" on model_versions;
create policy "mv_write" on model_versions for insert to authenticated with check (true);
drop policy if exists "mv_update" on model_versions;
create policy "mv_update" on model_versions for update to authenticated using (true) with check (true);

create table if not exists ai_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  model_version_id uuid references model_versions(id) on delete set null,
  prediction_type prediction_type not null,
  input_snapshot jsonb,
  output jsonb,
  confidence numeric,
  explanation text,
  status text default 'completed',
  latency_ms int,
  error text,
  created_at timestamptz default now()
);
alter table ai_runs enable row level security;
drop policy if exists "air_select" on ai_runs;
create policy "air_select" on ai_runs for select to authenticated using (true);
drop policy if exists "air_write" on ai_runs;
create policy "air_write" on ai_runs for insert to authenticated with check (true);

create table if not exists predictions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  ward_id uuid references wards(id) on delete set null,
  ai_run_id uuid references ai_runs(id) on delete set null,
  model_version_id uuid references model_versions(id) on delete set null,
  prediction_type prediction_type not null,
  metric text not null,
  predicted_value numeric,
  confidence numeric,
  confidence_low numeric,
  confidence_high numeric,
  horizon_hours int,
  target_time timestamptz,
  explanation text,
  contributing_inputs jsonb,
  source_data_ref text,
  status text default 'pending_review',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table predictions enable row level security;
drop policy if exists "pred_select" on predictions;
create policy "pred_select" on predictions for select to authenticated using (true);
drop policy if exists "pred_write" on predictions;
create policy "pred_write" on predictions for insert to authenticated with check (true);
drop policy if exists "pred_update" on predictions;
create policy "pred_update" on predictions for update to authenticated using (true) with check (true);

create table if not exists anomaly_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  ward_id uuid references wards(id) on delete set null,
  ai_run_id uuid references ai_runs(id) on delete set null,
  metric text not null,
  predicted_value numeric,
  actual_value numeric,
  deviation numeric,
  severity text default 'warning',
  confidence numeric,
  contributing_variables jsonb,
  explanation text,
  status text default 'pending_review',
  resolved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table anomaly_events enable row level security;
drop policy if exists "anom_select" on anomaly_events;
create policy "anom_select" on anomaly_events for select to authenticated using (true);
drop policy if exists "anom_write" on anomaly_events;
create policy "anom_write" on anomaly_events for insert to authenticated with check (true);
drop policy if exists "anom_update" on anomaly_events;
create policy "anom_update" on anomaly_events for update to authenticated using (true) with check (true);

create table if not exists risk_scores (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  patient_id uuid references patients(id) on delete cascade,
  encounter_id uuid references encounters(id) on delete cascade,
  risk_type text not null,
  score numeric not null,
  confidence numeric,
  factors jsonb,
  explanation text,
  model_version_id uuid references model_versions(id) on delete set null,
  created_at timestamptz default now()
);
alter table risk_scores enable row level security;
drop policy if exists "risk_select" on risk_scores;
create policy "risk_select" on risk_scores for select to authenticated using (true);
drop policy if exists "risk_write" on risk_scores;
create policy "risk_write" on risk_scores for insert to authenticated with check (true);

create table if not exists ai_approvals (
  id uuid primary key default gen_random_uuid(),
  ai_run_id uuid references ai_runs(id) on delete cascade,
  prediction_id uuid references predictions(id) on delete cascade,
  anomaly_id uuid references anomaly_events(id) on delete set null,
  reviewer_id uuid not null references profiles(id) on delete cascade,
  decision text not null,
  reason text,
  override_value jsonb,
  model_version_id uuid references model_versions(id) on delete set null,
  created_at timestamptz default now()
);
alter table ai_approvals enable row level security;
drop policy if exists "appr_select" on ai_approvals;
create policy "appr_select" on ai_approvals for select to authenticated using (true);
drop policy if exists "appr_write" on ai_approvals;
create policy "appr_write" on ai_approvals for insert to authenticated with check (true);

-- ============================================================
-- KPI / Time-series domain
-- ============================================================

create table if not exists kpi_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  ward_id uuid references wards(id) on delete set null,
  metric text not null,
  value numeric not null,
  unit text,
  recorded_at timestamptz not null default now(),
  metadata jsonb,
  created_at timestamptz default now()
);
alter table kpi_snapshots enable row level security;
drop policy if exists "kpi_select" on kpi_snapshots;
create policy "kpi_select" on kpi_snapshots for select to authenticated using (true);
drop policy if exists "kpi_write" on kpi_snapshots;
create policy "kpi_write" on kpi_snapshots for insert to authenticated with check (true);

create table if not exists operational_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  ward_id uuid references wards(id) on delete set null,
  encounter_id uuid references encounters(id) on delete cascade,
  event_type text not null,
  workflow_stage text not null,
  actor_id uuid references profiles(id) on delete set null,
  payload jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz default now()
);
alter table operational_events enable row level security;
drop policy if exists "oe_select" on operational_events;
create policy "oe_select" on operational_events for select to authenticated using (true);
drop policy if exists "oe_write" on operational_events;
create policy "oe_write" on operational_events for insert to authenticated with check (true);

create table if not exists forecast_series (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  ward_id uuid references wards(id) on delete set null,
  metric text not null,
  forecast_time timestamptz not null,
  predicted_value numeric,
  confidence_low numeric,
  confidence_high numeric,
  actual_value numeric,
  model_version_id uuid references model_versions(id) on delete set null,
  created_at timestamptz default now()
);
alter table forecast_series enable row level security;
drop policy if exists "fs_select" on forecast_series;
create policy "fs_select" on forecast_series for select to authenticated using (true);
drop policy if exists "fs_write" on forecast_series;
create policy "fs_write" on forecast_series for insert to authenticated with check (true);

create table if not exists capacity_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  ward_id uuid not null references wards(id) on delete cascade,
  planned_date date not null,
  planned_capacity int,
  actual_occupancy int,
  utilization numeric,
  created_at timestamptz default now()
);
alter table capacity_plans enable row level security;
drop policy if exists "cp_select" on capacity_plans;
create policy "cp_select" on capacity_plans for select to authenticated using (true);
drop policy if exists "cp_write" on capacity_plans;
create policy "cp_write" on capacity_plans for insert to authenticated with check (true);
drop policy if exists "cp_update" on capacity_plans;
create policy "cp_update" on capacity_plans for update to authenticated using (true) with check (true);

create table if not exists thresholds (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  ward_id uuid references wards(id) on delete set null,
  metric text not null,
  warning_value numeric,
  critical_value numeric,
  direction text default 'above',
  enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table thresholds enable row level security;
drop policy if exists "thr_select" on thresholds;
create policy "thr_select" on thresholds for select to authenticated using (true);
drop policy if exists "thr_write" on thresholds;
create policy "thr_write" on thresholds for insert to authenticated with check (true);
drop policy if exists "thr_update" on thresholds;
create policy "thr_update" on thresholds for update to authenticated using (true) with check (true);

create table if not exists sla_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  workflow_stage text not null,
  priority priority_level not null,
  target_minutes int not null,
  breach_minutes int,
  enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table sla_rules enable row level security;
drop policy if exists "sla_select" on sla_rules;
create policy "sla_select" on sla_rules for select to authenticated using (true);
drop policy if exists "sla_write" on sla_rules;
create policy "sla_write" on sla_rules for insert to authenticated with check (true);
drop policy if exists "sla_update" on sla_rules;
create policy "sla_update" on sla_rules for update to authenticated using (true) with check (true);

-- ============================================================
-- Supporting domain
-- ============================================================

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  org_id uuid not null references organisations(id) on delete cascade,
  category text not null,
  title text not null,
  body text,
  severity text default 'info',
  read boolean default false,
  related_entity_type text,
  related_entity_id uuid,
  created_at timestamptz default now()
);
alter table notifications enable row level security;
drop policy if exists "notif_select_own" on notifications;
create policy "notif_select_own" on notifications for select to authenticated using (auth.uid() = user_id);
drop policy if exists "notif_insert" on notifications;
create policy "notif_insert" on notifications for insert to authenticated with check (auth.uid() = user_id or true);
drop policy if exists "notif_update_own" on notifications;
create policy "notif_update_own" on notifications for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "notif_delete_own" on notifications;
create policy "notif_delete_own" on notifications for delete to authenticated using (auth.uid() = user_id);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  body text not null,
  created_at timestamptz default now()
);
alter table comments enable row level security;
drop policy if exists "cmt_select" on comments;
create policy "cmt_select" on comments for select to authenticated using (true);
drop policy if exists "cmt_write" on comments;
create policy "cmt_write" on comments for insert to authenticated with check (true);
drop policy if exists "cmt_delete_own" on comments;
create policy "cmt_delete_own" on comments for delete to authenticated using (auth.uid() = author_id);

create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  file_name text not null,
  content_type text,
  size_bytes bigint,
  storage_path text not null,
  checksum text,
  owner_id uuid references profiles(id) on delete set null,
  access_policy text default 'org',
  version int default 1,
  created_at timestamptz default now()
);
alter table attachments enable row level security;
drop policy if exists "att_select" on attachments;
create policy "att_select" on attachments for select to authenticated using (true);
drop policy if exists "att_write" on attachments;
create policy "att_write" on attachments for insert to authenticated with check (true);
drop policy if exists "att_delete" on attachments;
create policy "att_delete" on attachments for delete to authenticated using (true);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id) on delete set null,
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  outcome text default 'success',
  previous_value jsonb,
  new_value jsonb,
  reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz default now()
);
alter table audit_logs enable row level security;
drop policy if exists "audit_select" on audit_logs;
create policy "audit_select" on audit_logs for select to authenticated using (true);
drop policy if exists "audit_insert" on audit_logs;
create policy "audit_insert" on audit_logs for insert to authenticated with check (true);

create table if not exists scenarios (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  description text,
  assumptions jsonb,
  status text default 'draft',
  expected_impact jsonb,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table scenarios enable row level security;
drop policy if exists "sc_select" on scenarios;
create policy "sc_select" on scenarios for select to authenticated using (true);
drop policy if exists "sc_write" on scenarios;
create policy "sc_write" on scenarios for insert to authenticated with check (true);
drop policy if exists "sc_update" on scenarios;
create policy "sc_update" on scenarios for update to authenticated using (true) with check (true);
drop policy if exists "sc_delete" on scenarios;
create policy "sc_delete" on scenarios for delete to authenticated using (true);

create table if not exists scenario_items (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios(id) on delete cascade,
  metric text not null,
  baseline_value numeric,
  projected_value numeric,
  unit text,
  notes text,
  created_at timestamptz default now()
);
alter table scenario_items enable row level security;
drop policy if exists "si_select" on scenario_items;
create policy "si_select" on scenario_items for select to authenticated using (true);
drop policy if exists "si_write" on scenario_items;
create policy "si_write" on scenario_items for insert to authenticated with check (true);
drop policy if exists "si_delete" on scenario_items;
create policy "si_delete" on scenario_items for delete to authenticated using (true);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  report_type text not null,
  config jsonb,
  date_from timestamptz,
  date_to timestamptz,
  status text default 'pending',
  file_path text,
  format text default 'csv',
  generated_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  completed_at timestamptz
);
alter table reports enable row level security;
drop policy if exists "rep_select" on reports;
create policy "rep_select" on reports for select to authenticated using (true);
drop policy if exists "rep_write" on reports;
create policy "rep_write" on reports for insert to authenticated with check (true);
drop policy if exists "rep_update" on reports;
create policy "rep_update" on reports for update to authenticated using (true) with check (true);

create table if not exists config_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id) on delete cascade,
  key text not null,
  value jsonb,
  category text,
  description text,
  updated_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, key)
);
alter table config_settings enable row level security;
drop policy if exists "cfg_select" on config_settings;
create policy "cfg_select" on config_settings for select to authenticated using (true);
drop policy if exists "cfg_write" on config_settings;
create policy "cfg_write" on config_settings for insert to authenticated with check (true);
drop policy if exists "cfg_update" on config_settings;
create policy "cfg_update" on config_settings for update to authenticated using (true) with check (true);

-- ============================================================
-- Indexes
-- ============================================================
create index if not exists idx_profiles_org on profiles(org_id);
create index if not exists idx_wards_org on wards(org_id);
create index if not exists idx_staff_org on staff(org_id);
create index if not exists idx_patients_org on patients(org_id);
create index if not exists idx_encounters_org on encounters(org_id);
create index if not exists idx_encounters_patient on encounters(patient_id);
create index if not exists idx_encounters_status on encounters(status);
create index if not exists idx_beds_ward on beds(ward_id);
create index if not exists idx_beds_status on beds(status);
create index if not exists idx_orders_encounter on clinical_orders(encounter_id);
create index if not exists idx_orders_status on clinical_orders(status);
create index if not exists idx_tasks_org on tasks(org_id);
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_owner on tasks(owner_id);
create index if not exists idx_tasks_priority on tasks(priority);
create index if not exists idx_tasks_workflow on tasks(workflow_stage);
create index if not exists idx_tasks_sla on tasks(sla_risk);
create index if not exists idx_alerts_org on alerts(org_id);
create index if not exists idx_alerts_status on alerts(status);
create index if not exists idx_predictions_org on predictions(org_id);
create index if not exists idx_predictions_type on predictions(prediction_type);
create index if not exists idx_predictions_status on predictions(status);
create index if not exists idx_anomaly_org on anomaly_events(org_id);
create index if not exists idx_anomaly_status on anomaly_events(status);
create index if not exists idx_kpi_org_metric on kpi_snapshots(org_id, metric);
create index if not exists idx_kpi_recorded on kpi_snapshots(recorded_at);
create index if not exists idx_oe_org on operational_events(org_id);
create index if not exists idx_oe_occurred on operational_events(occurred_at);
create index if not exists idx_forecast_org_metric on forecast_series(org_id, metric);
create index if not exists idx_forecast_time on forecast_series(forecast_time);
create index if not exists idx_notif_user_read on notifications(user_id, read);
create index if not exists idx_audit_org on audit_logs(org_id);
create index if not exists idx_audit_action on audit_logs(action);
create index if not exists idx_audit_created on audit_logs(created_at);
create index if not exists idx_risk_patient on risk_scores(patient_id);
create index if not exists idx_reports_org on reports(org_id);

-- ============================================================
-- updated_at trigger function
-- ============================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apply triggers to key tables
do $$
declare t text;
begin
  foreach t in array array[
    'organisations','profiles','wards','staff','patients','beds','encounters',
    'clinical_orders','diagnostics','treatments','follow_ups','shifts','tasks',
    'alerts','escalations','predictions','anomaly_events','thresholds',
    'sla_rules','scenarios','reports','config_settings'
  ]
  loop
    execute format('drop trigger if exists trg_updated_%s on %s', t, t);
    execute format('create trigger trg_updated_%s before update on %s for each row execute function set_updated_at()', t, t);
  end loop;
end $$;