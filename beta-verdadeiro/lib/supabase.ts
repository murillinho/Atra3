import { createClient } from '@supabase/supabase-js';

// Access environment variables safely using process.env (Standard/Parcel)
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

let client = null;

// Only attempt to initialize if keys are present
if (supabaseUrl && supabaseKey) {
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