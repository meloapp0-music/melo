// Melo — jambase-proxy Edge Function
// ===================================
// Proxies a single api.data.jambase.com/v3 request on behalf of an
// authenticated user, attaching the server-side JamBase API key so it
// NEVER ships in the client bundle. Mirrors setlistfm-proxy.
//
// Why a proxy: JamBase uses a Bearer token that — unlike the Ticketmaster
// Discovery key — must stay SECRET. A leaked key burns the account's quota
// (and, on the paid tier, its bill). Security spine: keys live server-side.
//
// Request body:
//   { path: 'events', query: 'artistName=Congress&geoCityName=Chicago' }
// Response body: whatever JamBase returned (passed through).
//
// Setup (once you have a key from data.jambase.com):
//   supabase secrets set JAMBASE_KEY=<your key>
//   supabase functions deploy jambase-proxy
//
// Per docs/initiatives/2026-07-01-artist-tracking-anywhere.md.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const JAMBASE_KEY = Deno.env.get('JAMBASE_KEY');

const JAMBASE_BASE = 'https://api.data.jambase.com/v3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  // 501 (not 500) so the client can cleanly treat "JamBase not set up" as
  // "no results" rather than an error.
  if (!JAMBASE_KEY) {
    return json({ error: 'JamBase not configured (JAMBASE_KEY secret missing)' }, 501);
  }

  try {
    // Require a valid Supabase session so this can't be used as an open
    // relay that drains the JamBase quota.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'missing Authorization header' }, 401);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) return json({ error: 'invalid session' }, 401);

    let body: { path?: string; query?: string };
    try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
    const path = (body?.path || '').replace(/^\/+|\/+$/g, '');
    const query = body?.query || '';

    // Read-only allowlist — the two endpoints Melo uses.
    if (path !== 'events' && !path.startsWith('artists')) {
      return json({ error: `path not allowed: ${path}` }, 403);
    }

    const target = `${JAMBASE_BASE}/${path}${query ? `?${query}` : ''}`;
    const upstream = await fetch(target, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${JAMBASE_KEY}` },
    });

    const respBody = await upstream.arrayBuffer();
    const headers = new Headers(corsHeaders);
    const ct = upstream.headers.get('content-type');
    if (ct) headers.set('content-type', ct);
    return new Response(respBody, { status: upstream.status, headers });
  } catch (err) {
    console.error('[jambase-proxy] unexpected error', err);
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
