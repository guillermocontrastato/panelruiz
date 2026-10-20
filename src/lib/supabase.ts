import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  rawUrl &&
  rawKey &&
  rawUrl !== 'https://your-project.supabase.co' &&
  !rawUrl.includes('placeholder')
);

// Fallback dummy credentials so createClient never throws on initialization
const supabaseUrl = rawUrl || 'https://mock-db-placeholder.supabase.co';
const supabaseAnonKey = rawKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.mock_key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

