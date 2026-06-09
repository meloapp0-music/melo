// Melo — notify-friend-request Edge Function
// ==========================================
// Real-time push when someone sends you a friend request. Called by the
// client (friendships.js requestFriend) right after the request row is
// created. Unlike tour-alerts (daily cron), this fires immediately —
// friend requests should feel instant.
//
// Flow: verify the caller (the requester) via JWT → look up the
// recipient's iOS device tokens with the service role → send APNs
// "{name} sent you a friend request". Deduped per (recipient, requester)
// so re-requests don't spam.
//
// Deploy:
//   supabase functions deploy notify-friend-request --no-verify-jwt
//
// Required env: SUPABASE_URL, SUPABASE_ANON_KEY,
//   SUPABASE_SERVICE_ROLE_KEY, and the APNS_* secrets (see _shared/apns.ts).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { sendApnsBatch, isApnsConfigured } from '../_shared/apns.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'missing Authorization' }, 401);

    // Identify the requester from their JWT.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) return json({ error: 'invalid session' }, 401);
    const me = userData.user.id;

    let body: { toUserId?: string };
    try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
    const toUserId = body?.toUserId;
    if (!toUserId || toUserId === me) return json({ ok: true, skipped: true });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Dedup: one friend-request push per (recipient, requester). If we've
    // already notified, skip (re-requests after a decline are rare and
    // shouldn't re-spam).
    const ref = me;
    const { data: already } = await admin
      .from('notifications_sent')
      .select('ref')
      .eq('user_id', toUserId)
      .eq('kind', 'friend_request')
      .eq('ref', ref)
      .maybeSingle();
    if (already) return json({ ok: true, deduped: true });

    // Requester display name for the copy.
    const { data: prof } = await admin
      .from('profiles')
      .select('display_name, username')
      .eq('id', me)
      .maybeSingle();
    const name = prof?.display_name || (prof?.username ? `@${prof.username}` : 'Someone');

    // Recipient's iOS device tokens.
    const { data: tokRows } = await admin
      .from('device_tokens')
      .select('token, platform')
      .eq('user_id', toUserId);
    const tokens = (tokRows || []).filter((t) => t.platform === 'ios').map((t) => t.token);

    let sent = 0;
    if (tokens.length > 0 && isApnsConfigured()) {
      const results = await sendApnsBatch(tokens, {
        title: `${name} sent you a friend request 👋`,
        body: `Tap to see their concerts and accept.`,
        data: { kind: 'friend_request', fromUserId: me },
      });
      sent = results.filter((r) => r.ok).length;
      // Prune dead tokens.
      const dead = results
        .filter((r) => !r.ok && (r.status === 410 || r.reason === 'Unregistered' || r.reason === 'BadDeviceToken'))
        .map((r) => r.token);
      if (dead.length) {
        await admin.from('device_tokens').delete().eq('user_id', toUserId).in('token', dead);
      }
    }

    // Record so we don't re-notify for the same requester.
    await admin
      .from('notifications_sent')
      .upsert(
        { user_id: toUserId, kind: 'friend_request', ref },
        { onConflict: 'user_id,kind,ref', ignoreDuplicates: true },
      );

    return json({ ok: true, sent });
  } catch (err) {
    console.error('[notify-friend-request] error', err);
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
