import { createClient } from '@supabase/supabase-js';

// Access environment variables with type casting for Vite
const env = (import.meta as any).env || {};
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;

let client = null;

// Debug logs to help diagnose Vercel environment issues
console.log('[Supabase Config] Initializing...');

if (supabaseUrl && supabaseKey) {
  try {
    client = createClient(supabaseUrl, supabaseKey);
    console.log('[Supabase Config] Client created successfully.');
  } catch (e) {
    console.error('[Supabase Config] Failed to create client:', e);
  }
} else {
  console.warn('[Supabase Config] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. App running in Offline/Mock mode.');
}

export const supabase = client;

export const isSupabaseConfigured = () => {
  return !!supabase;
};