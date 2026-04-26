// Melo — setlistfm-set-key Edge Function
// =======================================
// Encrypts a user-provided Setlist.fm API key with AES-GCM using
// the server-only MELO_SETTINGS_ENC_KEY secret, then upserts the
// ciphertext into `user_settings.setlist_fm_key_encrypted` (bytea).
//
// The plaintext key never round-trips back to the client. Once set,
// the only way to use it is via the sibling `setlistfm-proxy`
// function, which decrypts in-memory just long enough to forward a
// single request to api.setlist.fm.
//
// Why AES-GCM in Deno instead of pgp_sym_encrypt in Postgres? Both
// are fine cryptographically. Doing it in Deno keeps the encryption
// key off the database connection string and lets us rotate it
// without a DB migration.
//
// Ciphertext layout: [12-byte IV][ciphertext + 16-byte GCM tag],
// stored as a hex `\x...` bytea literal so PostgREST accepts it.
//
// Deploy:
//   supabase secrets set MELO_SETTINGS_ENC_KEY="$(openssl rand -base64 48)"
//   supabase functions deploy setlistfm-set-key --no-verify-jwt
//
// (--no-verify-jwt because we verify the JWT manually below.)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ENC_KEY = Deno.env.get('MELO_SETTINGS_ENC_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  if (!ENC_KEY) {
    console.error('[setlistfm-set-key] MELO_SETTINGS_ENC_KEY not set');
    return json({ error: 'server misconfigured: encryption key missing' }, 500);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'missing Authorization header' }, 401);

    // Identify the caller from their JWT.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user?.id) {
      return json({ error: 'invalid session' }, 401);
    }
    const userId = userData.user.id;

    let body: { key?: string };
    try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
    const key = (body?.key || '').trim();

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (!key) {
      // Empty key = "disconnect". Clear the encrypted column.
      const { error } = await adminClient
        .from('user_settings')
        .upsert(
          { user_id: userId, setlist_fm_key_encrypted: null },
          { onConflict: 'user_id' },
        );
      if (error) {
        console.error('[setlistfm-set-key] clear failed', error);
        return json({ error: error.message }, 500);
      }
      return json({ ok: true, hasSetlistFmKey: false }, 200);
    }

    const ciphertext = await encryptAesGcm(key, ENC_KEY);

    const { error } = await adminClient
      .from('user_settings')
      .upsert(
        { user_id: userId, setlist_fm_key_encrypted: ciphertext },
        { onConflict: 'user_id' },
      );
    if (error) {
      console.error('[setlistfm-set-key] upsert failed', error);
      return json({ error: error.message }, 500);
    }

    return json({ ok: true, hasSetlistFmKey: true }, 200);
  } catch (err) {
    console.error('[setlistfm-set-key] unexpected error', err);
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

// -------------------- AES-GCM helpers --------------------

async function encryptAesGcm(plaintext: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(secret);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(plaintext),
    ),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  // PostgREST accepts bytea as a hex-prefixed string.
  return '\\x' + bytesToHex(out);
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  // SHA-256 of the secret = stable 256-bit AES key. Single-secret
  // deployment; rotation = re-encrypt all rows under a new secret.
  const bytes = new TextEncoder().encode(secret);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
