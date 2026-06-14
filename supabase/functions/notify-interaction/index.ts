// Melo — notify-interaction Edge Function
// =======================================
// Real-time push to a show's owner when a friend reacts to or comments
// on it. Called fire-and-forget by the client (social.js) after the
// reaction/comment write. Per
// docs/initiatives/2026-06-14-social-feed-likes-comments.md.
//
// Flow: verify the actor via JWT → load the show (service role) → bail
// if the actor owns it (no self-notify) → confirm the actor may
// actually see the show (can_view_shows) so this can't be abused to
// ping strangers → send APNs to the owner's iOS tokens.
//   * comment → always notifies (each comment is a distinct event)
//   * reaction → deduped per (owner, actor, show) so toggling a like
//     on/off can't spam.
//
// Deploy:
//   supabase functions deploy notify-interaction --no-verify-jwt

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

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) return json({ error: 'invalid session' }, 401);
    const me = userData.user.id;

    let body: { showId?: string; kind?: string };
    try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
    const showId = body?.showId;
    const kind = body?.kind === 'comment' ? 'comment' : 'reaction';
    if (!showId) return json({ error: 'missing showId' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Resolve the show owner.
    const { data: show } = await admin
      .from('shows')
      .select('user_id, artist')
      .eq('id', showId)
      .maybeSingle();
    if (!show) return json({ ok: true, skipped: 'no-show' });
    const owner = show.user_id;
    if (owner === me) return json({ ok: true, skipped: 'self' });

    // Authorization: the actor must actually be allowed to view this
    // show (friendship/visibility/blocks via can_view_shows). Stops the
    // endpoint being used to ping arbitrary users.
    const { data: canView } = await admin.rpc('can_view_shows', { viewer: me, owner });
    if (!canView) return json({ ok: true, skipped: 'not-allowed' });

    // Anti-spam:
    //  • reaction → one push ever per (owner, actor, show) so toggling
    //    a like can't notify repeatedly.
    //  • comment → coalesce to one push per (owner, actor, show) per
    //    5 min so a viewer can't notification-bomb the owner by posting
    //    comment after comment. (The comments themselves still save;
    //    only the push is throttled.)
    if (kind === 'reaction') {
      const { data: already } = await admin
        .from('notifications_sent')
        .select('ref')
        .eq('user_id', owner)
        .eq('kind', 'reaction')
        .eq('ref', `${showId}|${me}`)
        .maybeSingle();
      if (already) return json({ ok: true, deduped: true });
    } else {
      const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: recent } = await admin
        .from('notifications_sent')
        .select('sent_at')
        .eq('user_id', owner)
        .eq('kind', 'comment_push')
        .eq('ref', `${showId}|${me}`)
        .gte('sent_at', since)
        .maybeSingle();
      if (recent) return json({ ok: true, throttled: true });
    }

    const { data: prof } = await admin
      .from('profiles')
      .select('display_name, username')
      .eq('id', me)
      .maybeSingle();
    const name = prof?.display_name || (prof?.username ? `@${prof.username}` : 'Someone');
    const artist = show.artist || 'your show';

    const { data: tokRows } = await admin
      .from('device_tokens')
      .select('token, platform')
      .eq('user_id', owner);
    const tokens = (tokRows || []).filter((t) => t.platform === 'ios').map((t) => t.token);

    let sent = 0;
    if (tokens.length > 0 && isApnsConfigured()) {
      const results = await sendApnsBatch(tokens, {
        title: kind === 'comment'
          ? `${name} commented on ${artist} 💬`
          : `${name} liked your ${artist} show ❤️`,
        body: kind === 'comment' ? 'Tap to read and reply.' : 'Tap to see.',
        data: { kind: kind === 'comment' ? 'show_comment' : 'show_reaction', showId, fromUserId: me },
      });
      sent = results.filter((r) => r.ok).length;
      const dead = results
        .filter((r) => !r.ok && (r.status === 410 || r.reason === 'Unregistered' || r.reason === 'BadDeviceToken'))
        .map((r) => r.token);
      if (dead.length) {
        await admin.from('device_tokens').delete().eq('user_id', owner).in('token', dead);
      }
    }

    if (kind === 'reaction') {
      await admin
        .from('notifications_sent')
        .upsert(
          { user_id: owner, kind: 'reaction', ref: `${showId}|${me}` },
          { onConflict: 'user_id,kind,ref', ignoreDuplicates: true },
        );
    } else {
      // Slide the comment cooldown window forward.
      await admin
        .from('notifications_sent')
        .upsert(
          { user_id: owner, kind: 'comment_push', ref: `${showId}|${me}`, sent_at: new Date().toISOString() },
          { onConflict: 'user_id,kind,ref' },
        );
    }

    return json({ ok: true, sent });
  } catch (err) {
    console.error('[notify-interaction] error', err);
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
