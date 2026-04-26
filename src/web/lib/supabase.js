// Supabase client — singleton shared across the whole app.
// Config is read from Vite env vars (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
// The anon key is safe to ship in the client bundle — every table has
// Row-Level Security enabled, so the key alone grants no data access.

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Don't throw — let the app still render in dev so the error surfaces on
  // the auth screen rather than blanking the page.
  // eslint-disable-next-line no-console
  console.warn(
    '[Melo] Supabase env vars missing. Copy .env.example to .env.local and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  );
}

export const supabase = createClient(url || 'http://localhost', anonKey || 'public-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'melo.auth.session',
  },
});

export const isConfigured = Boolean(url && anonKey);
