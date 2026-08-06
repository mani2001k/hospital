-- Add system_role to staff for role-based access control mapping
ALTER TABLE staff ADD COLUMN IF NOT EXISTS system_role text DEFAULT 'field_staff';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS shift_preference text DEFAULT 'day';

-- Backfill system_role from linked profile role where available
UPDATE staff s
SET system_role = p.role
FROM profiles p
WHERE s.profile_id = p.id AND s.system_role = 'field_staff';

CREATE INDEX IF NOT EXISTS idx_staff_system_role ON staff(system_role);