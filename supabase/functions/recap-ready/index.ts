// Melo — recap-ready Edge Function (scheduled)
// ============================================
// THE ARRIVAL. The design handoff frames the recap as a post-log gift: "the
// morning after a user logs a show, melo auto-cuts their photos and clips …
// into a 15–20 second vertical reel built for sharing." Without this, the recap
// is a button people have to know to hunt for. With it, it shows up.
//
// Runs daily and pushes each user ONE notification per show they logged
// yesterday that has enough material to make a reel sing:
//     "melo made you a recap ✨  ·  Coldplay — 6 songs, 3 photos. Tap to watch."
// Tapping deep-links straight into the reel for that show.
//
// Schedule: 15:00 UTC ≈ 10am Chicago — "the morning after", per the handoff.
//   Dashboard → Integrations → Cron (there is NO `supabase functions schedule`
//   command; see the daily-post header).
//
// Required env: APNS_* (see _shared/apns.ts). No new secrets.
// Deploy: supabase functions deploy recap-ready --no-verify-jwt

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { sendApnsBatch, isApnsConfigured } from '../_shared/apns.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Never storm someone who logged a whole festival overnight — one recap nudge
// per person per run, the best-material show.
const MAX_PER_USER = 1;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

/** Mirrors canRecap() in lib/recap.js — enough to make a reel worth watching. */
function worthRecapping(row: any) {
  const songs = (row.setlist || []).filter(Boolean).length;
  const media = (row.photos || []).length + (row.videos || []).length;
  return songs >= 3 || media >= 2 || (row.score || 0) > 0;
}

/** How rich the reel will be — used to pick the best show and to write copy
 *  that tells the user what's actually in it. */
function richness(row: any) {
  const songs = (row.setlist || []).filter(Boolean).length;
  const photos = (row.photos || []).length;
  const videos = (row.videos || []).length;
  return { songs, photos, videos, weight: songs + photos * 2 + videos * 3 };
}

serve(async () => {
  if (!isApnsConfigured()) return json({ error: 'APNs not configured' }, 500);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Shows logged in the last day. `created_at` (when they LOGGED it), not
  // `date` (when the show was) — someone logging a 2019 show today still
  // deserves the recap moment.
  const since = new Date(Date.now() - 26 * 3600 * 1000).toISOString();
  const { data: rows, error } = await admin
    .from('shows')
    .select('id, user_id, artist, setlist, photos, videos, score, status, wishlist, created_at')
    .gte('created_at', since);
  if (error) return json({ error: error.message }, 500);

  // Attended shows only — a recap of a show you haven't been to yet is nonsense.
  const eligible = (rows || []).filter((r) => {
    const status = r.status || (r.wishlist ? 'wishlist' : 'attended');
    return status === 'attended' && worthRecapping(r);
  });
  if (!eligible.length) return json({ sent: 0, reason: 'nothing logged worth recapping' });

  // Best show per user.
  const bestByUser = new Map<string, any>();
  for (const r of eligible) {
    const cur = bestByUser.get(r.user_id);
    if (!cur || richness(r).weight > richness(cur).weight) bestByUser.set(r.user_id, r);
  }

  const userIds = [...bestByUser.keys()];
  const [{ data: sentRows }, { data: tokenRows }] = await Promise.all([
    admin.from('notifications_sent').select('user_id, ref').eq('kind', 'recap_ready').in('user_id', userIds),
    admin.from('device_tokens').select('user_id, token').in('user_id', userIds),
  ]);

  const already = new Set((sentRows || []).map((s: any) => `${s.user_id}|${s.ref}`));
  const tokensByUser = new Map<string, string[]>();
  for (const t of tokenRows || []) {
    const list = tokensByUser.get(t.user_id) || [];
    list.push(t.token);
    tokensByUser.set(t.user_id, list);
  }

  let sent = 0;
  const inserts: Array<{ user_id: string; kind: string; ref: string }> = [];
  const dead: Array<{ userId: string; token: string }> = [];

  for (const [userId, show] of bestByUser) {
    if (already.has(`${userId}|${show.id}`)) continue;
    const tokens = tokensByUser.get(userId) || [];
    if (!tokens.length) continue;

    // Copy names what's IN the reel — the specificity is what earns the tap.
    const { songs, photos, videos } = richness(show);
    const bits = [
      songs ? `${songs} song${songs === 1 ? '' : 's'}` : '',
      photos ? `${photos} photo${photos === 1 ? '' : 's'}` : '',
      videos ? `${videos} clip${videos === 1 ? '' : 's'}` : '',
    ].filter(Boolean);

    const results = await sendApnsBatch(tokens, {
      title: 'melo made you a recap ✨',
      body: `${show.artist} — ${bits.join(', ')}. Tap to watch.`,
      data: { kind: 'recap_ready', showId: show.id },
    });

    if (results.some((r) => r.ok)) {
      sent += 1;
      inserts.push({ user_id: userId, kind: 'recap_ready', ref: show.id });
    }
    results
      .filter((r) => r.reason === 'Unregistered' || r.reason === 'BadDeviceToken')
      .forEach((r) => dead.push({ userId, token: r.token }));
    if (sent >= MAX_PER_USER * bestByUser.size) { /* structural cap; keeps the loop honest */ }
  }

  if (inserts.length) await admin.from('notifications_sent').insert(inserts);
  for (const d of dead) {
    await admin.from('device_tokens').delete().eq('user_id', d.userId).eq('token', d.token);
  }

  return json({ sent, candidates: bestByUser.size });
});
