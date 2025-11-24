import { createClient } from '@supabase/supabase-js';

// Access environment variables safely
const env = (import.meta as any).env || {};
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;

let client = null;

// Only attempt to initialize if keys are present
if (supabaseUrl && supabaseKey && supabaseUrl !== 'undefined' && supabaseKey !== 'undefined') {
  try {
    client = createClient(supabaseUrl, supabaseKey);
    console.log('[System] Supabase connected.');
  } catch (e) {
    console.warn('[System] Supabase init failed, using Offline Mode.');
  }
} else {
  console.log('[System] No API keys found. Running in Offline Mode.');
}

export const supabase = client;

export const isSupabaseConfigured = () => {
  return !!supabase;
};