// Melo — setlistfm-proxy Edge Function
// =====================================
// Proxies a single api.setlist.fm request on behalf of an
// authenticated user. Decrypts that user's stored API key
// in-memory, attaches it as `x-api-key`, forwards the request,
// returns the JSON response.
//
// Pairs with `setlistfm-set-key` (writes the ciphertext) and the
// migration `0003_pre_launch.sql` (defines the bytea column).
//
// Request body:
//   { path: 'search/setlists', query: 'artistName=Goose&p=1' }
// Response body: whatever Setlist.fm returned (passed through).
//
// Deploy:
//   supabase functions deploy setlistfm-proxy --no-verify-jwt
//
// Note: the same MELO_SETTINGS_ENC_KEY secret used by
// setlistfm-set-key MUST be set, otherwise decryption fails.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ENC_KEY = Deno.env.get('MELO_SETTINGS_ENC_KEY');
// Optional shared fallback key — used when a user has not configured their
// own Setlist.fm key. Lets the app work out-of-the-box for everyone. If
// unset, the proxy reverts to the original "no key configured" 400.
const FALLBACK_KEY = Deno.env.get('MELO_SETLISTFM_FALLBACK_KEY');

const SETLISTFM_BASE = 'https://api.setlist.fm/rest/1.0';

// Path allowlist. Setlist.fm has a small public surface; pin the
// proxy to just what Melo uses. Prevents this function from being
// abused as an open relay or for endpoints we haven't audited.
const ALLOWED_PATHS = new Set([
  'search/setlists',
  'search/artists',
]);

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
    console.error('[setlistfm-proxy] MELO_SETTINGS_ENC_KEY not set');
    return json({ error: 'server misconfigured: encryption key missing' }, 500);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'missing Authorization header' }, 401);

    // Identify the caller from the JWT.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user?.id) {
      return json({ error: 'invalid session' }, 401);
    }
    const userId = userData.user.id;

    let body: { path?: string; query?: string };
    try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
    const path = (body?.path || '').replace(/^\/+|\/+$/g, '');
    const query = body?.query || '';

    if (!ALLOWED_PATHS.has(path)) {
      return json({ error: `path not allowed: ${path}` }, 403);
    }

    // Fetch the user's encrypted key with the service role.
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: row, error: rowErr } = await adminClient
      .from('user_settings')
      .select('setlist_fm_key_encrypted')
      .eq('user_id', userId)
      .maybeSingle();
    if (rowErr) {
      console.error('[setlistfm-proxy] settings read failed', rowErr);
      return json({ error: rowErr.message }, 500);
    }

    // Resolve the API key. Order:
    //  1. User's own encrypted key, if they've configured one
    //  2. Server-side shared FALLBACK_KEY, if set
    //  3. 400 with "no key configured" — same as before
    let apiKey: string | undefined;
    if (row?.setlist_fm_key_encrypted) {
      try {
        apiKey = await decryptAesGcm(row.setlist_fm_key_encrypted as string, ENC_KEY);
      } catch (err) {
        console.error('[setlistfm-proxy] decrypt failed', err);
        return json({ error: 'decrypt failed (key rotated?)' }, 500);
      }
    } else if (FALLBACK_KEY) {
      apiKey = FALLBACK_KEY;
    }
    if (!apiKey) {
      return json({ error: 'no setlist.fm key configured' }, 400);
    }

    const target = `${SETLISTFM_BASE}/${path}${query ? `?${query}` : ''}`;
    const upstream = await fetch(target, {
      headers: {
        Accept: 'application/json',
        'x-api-key': apiKey,
        // Setlist.fm asks for a User-Agent identifying the client.
        'User-Agent': 'Melo/1.0 (+https://melo.app)',
      },
    });

    // Setlist.fm returns HTTP 404 when a search simply has no matches —
    // that's "zero results", not an error. Passing the 404 through makes
    // the browser log a phantom "Failed to load resource" and the client
    // treat an empty search as a failure. Normalize it to a 200 with an
    // empty list so a no-results search reads as exactly that.
    if (upstream.status === 404) {
      const emptyKey = path === 'search/artists' ? 'artist' : 'setlist';
      return json({ [emptyKey]: [], total: 0, itemsPerPage: 0, page: 1 }, 200);
    }

    const respBody = await upstream.arrayBuffer();
    const headers = new Headers(corsHeaders);
    const ct = upstream.headers.get('content-type');
    if (ct) headers.set('content-type', ct);
    return new Response(respBody, { status: upstream.status, headers });
  } catch (err) {
    console.error('[setlistfm-proxy] unexpected error', err);
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
// Inverse of setlistfm-set-key/encryptAesGcm. Same scheme:
// hex bytea coming back from PostgREST = "\\xIVCT".

async function decryptAesGcm(stored: string | Uint8Array, secret: string): Promise<string> {
  const bytes = bytesFromBytea(stored);
  if (bytes.length < 12 + 16) throw new Error('ciphertext too short');
  const iv = bytes.slice(0, 12);
  const ct = bytes.slice(12);
  const key = await deriveKey(secret);
  const pt = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct),
  );
  return new TextDecoder().decode(pt);
}

async function deriveKey(secret: string): Promise<CryptoKey> {
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

// PostgREST returns bytea as a hex-encoded string starting with `\x`,
// or sometimes as a base64 string depending on settings. Handle both.
function bytesFromBytea(stored: string | Uint8Array): Uint8Array {
  if (stored instanceof Uint8Array) return stored;
  if (typeof stored !== 'string') throw new Error('unexpected bytea shape');
  if (stored.startsWith('\\x') || stored.startsWith('\\\\x')) {
    const hex = stored.replace(/^\\\\?x/, '');
    return hexToBytes(hex);
  }
  // Assume base64.
  const bin = atob(stored);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}
