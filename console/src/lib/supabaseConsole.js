import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_CONSOLE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_CONSOLE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConsole = url && anonKey
  ? createClient(url, anonKey)
  : null;
