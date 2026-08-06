import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type UserRole = 'operations_admin' | 'manager' | 'analyst' | 'field_staff';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  status: 'active' | 'inactive' | 'suspended';
  org_id: string | null;
  phone: string | null;
  title: string | null;
  last_login_at: string | null;
  mfa_enabled: boolean;
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
