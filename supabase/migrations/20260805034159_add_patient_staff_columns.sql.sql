-- Add columns requested for Patient Management
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS email text;

-- Backfill first_name/last_name from full_name for existing rows
UPDATE patients
SET first_name = split_part(full_name, ' ', 1),
    last_name = substring(full_name from position(' ' in full_name) + 1)
WHERE first_name IS NULL AND full_name IS NOT NULL;

-- Add columns requested for Staff Management
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS shift_preference text DEFAULT 'day';

-- Add index for patient email search
CREATE INDEX IF NOT EXISTS idx_patients_email ON patients(email);
CREATE INDEX IF NOT EXISTS idx_staff_department ON staff(department);