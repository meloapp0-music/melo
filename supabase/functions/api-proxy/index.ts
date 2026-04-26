// Melo — api-proxy Edge Function
// ===============================
// Replaces the third-party `corsproxy.io` we use during dev. That
// service is fine for personal use but unsuitable for production:
// - It can go down (taking the app with it).
// - It routes every Melo user's API traffic through someone else's
//   server.
// - Setlist.fm's ToS specifically forbids proxying their data through
//   unaffiliated infrastructure.
//
// This function takes a `?url=<encoded>` query param, validates it
// against an allowlist of upstream hosts, fetches it server-side, and
// returns the response with permissive CORS headers.
//
// Headers from the original request are passed through ONLY for
// allowed names (e.g. `x-api-key` for Setlist.fm) so we don't leak
// the caller's identity to upstreams that don't need it.
//
// Deploy:
//   supabase functions deploy api-proxy --no-verify-jwt
//
// Wire it up in Melo by setting `VITE_API_PROXY_URL` to the function
// URL (e.g. https://<project>.functions.supabase.co/api-proxy?url=).
// `src/web/api.js::CORS_PROXY` reads that env var and falls back to
// corsproxy.io when unset, so you can roll this out gradually.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Only proxy upstream hosts we actually integrate with. Anything else
// → 403. Prevents the function from being abused as an open relay.
const ALLOWED_HOSTS = new Set([
  'api.deezer.com',
  'api.setlist.fm',
  'musicbrainz.org',
  // Add more as Melo's integrations grow. Note: Ticketmaster Discovery
  // and iTunes Search both ship CORS headers, so they don't need the
  // proxy at all.
]);

const FORWARDED_REQUEST_HEADERS = ['x-api-key', 'accept'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let target: URL;
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get('url');
    if (!raw) {
      return json({ error: 'missing ?url=' }, 400);
    }
    target = new URL(raw);
  } catch {
    return json({ error: 'invalid url' }, 400);
  }

  if (!ALLOWED_HOSTS.has(target.hostname)) {
    return json({ error: `host not allowed: ${target.hostname}` }, 403);
  }

  // Forward only the headers the upstream actually needs.
  const fwdHeaders: Record<string, string> = {};
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const v = req.headers.get(name);
    if (v) fwdHeaders[name] = v;
  }

  try {
    const upstream = await fetch(target.toString(), {
      method: req.method,
      headers: fwdHeaders,
    });

    // Pass-through body + content-type, layer our CORS headers on top.
    const body = await upstream.arrayBuffer();
    const headers = new Headers(corsHeaders);
    const ct = upstream.headers.get('content-type');
    if (ct) headers.set('content-type', ct);
    headers.set('cache-control', 'public, max-age=300'); // 5-min edge cache

    return new Response(body, { status: upstream.status, headers });
  } catch (err) {
    console.error('[api-proxy] fetch failed', target.toString(), err);
    return json({ error: 'upstream fetch failed' }, 502);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
