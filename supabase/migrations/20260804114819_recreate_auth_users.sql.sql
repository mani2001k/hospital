-- Delete existing auth users that have broken sign-in
-- Then recreate via the public signup API with a strong password
-- and fix up profiles to match

-- First, delete the broken users from auth.users (cascades to identities)
DELETE FROM auth.users WHERE email IN (
  'admin@hospital.io',
  'manager@hospital.io',
  'analyst@hospital.io',
  'staff@hospital.io',
  'test@hospital.io'
);

-- Also clean up any orphaned profiles
DELETE FROM profiles WHERE email IN (
  'admin@hospital.io',
  'manager@hospital.io',
  'analyst@hospital.io',
  'staff@hospital.io'
);