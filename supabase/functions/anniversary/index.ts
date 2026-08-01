// Melo — anniversary Edge Function (scheduled)
// ============================================
// "One year ago tonight, you were at Coldplay."
//
// The structural problem with a concert app is sparseness: the median user goes
// to a handful of shows a year, so there is no reason to open it on the other
// ~360 days. This is the cheapest answer — resurface the library the user
// already built, on the one day it lands hardest. It costs nothing to run and
// it's the reason the app stays installed between shows.
//
// Tapping opens the show AND its "One year ago" recap cut (lib/recapCuts.js
// buildAnniversary), which exists but until now was never surfaced by anything.
//
// Schedule: 15:00 UTC daily.
//   That hour matters. At 15:00 UTC it is mid-morning across the Americas and
//   late afternoon in Europe, so "today" in UTC and "today" for the user are the
//   SAME calendar day — which is what lets this compare month/day directly
//   without per-user timezone bookkeeping. Running it near 00:00 UTC would
//   resurface shows a day early for everyone west of Greenwich.
//
// Required env: APNS_* (see _shared/apns.ts). No new secrets.
// Deploy: supabase functions deploy anniversary --no-verify-jwt

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { sendApnsBatch, isApnsConfigured } from '../_shared/apns.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Mirrors yearsAgo() in src/web/lib/anniversary.js — including the leap-day
 *  fallback, so a Feb 29 show doesn't vanish for three years out of four. */
function yearsAgo(showDate: string, today: string): number {
  if (!showDate || showDate.length < 10) return 0;
  const [sy, sm, sd] = showDate.slice(0, 10).split('-');
  const [ty, tm, td] = today.split('-');
  const years = Number(ty) - Number(sy);
  if (!Number.isFinite(years) || years < 1) return 0;
  if (sm === tm && sd === td) return years;
  if (sm === '02' && sd === '29' && tm === '02' && td === '28' && !isLeap(Number(ty))) return years;
  return 0;
}

serve(async () => {
  if (!isApnsConfigured()) return json({ error: 'APNs not configured' }, 500);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const now = new Date();
  const today = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  const mmdd = today.slice(5);

  // Only rows whose month-day matches, plus the Feb 28 window that catches
  // leap-day shows. Filtering in SQL keeps this from scanning every show ever.
  const patterns = [`%-${mmdd}`];
  if (mmdd === '02-28' && !isLeap(now.getUTCFullYear())) patterns.push('%-02-29');

  const rows: any[] = [];
  for (const pat of patterns) {
    const { data, error } = await admin
      .from('shows')
      .select('id, user_id, artist, venue, date, setlist, photos, videos, score, status, wishlist')
      .like('date', pat);
    if (error) return json({ error: error.message }, 500);
    rows.push(...(data || []));
  }

  // Attended only, and genuinely in a past year.
  const eligible = rows
    .map((r) => ({ row: r, years: yearsAgo(r.date, today) }))
    .filter(({ row, years }) => {
      if (years < 1) return false;
      const status = row.status || (row.wishlist ? 'wishlist' : 'attended');
      return status === 'attended';
    });
  if (!eligible.length) return json({ sent: 0, reason: 'no anniversaries today', today });

  // One per user. Milestone years win outright — "ten years ago" is a different
  // feeling from "one" — then whichever night has the most to show.
  const weight = ({ row, years }: { row: any; years: number }) =>
    (years % 5 === 0 ? 100 : 0)
    + ((row.photos || []).length + (row.videos || []).length) * 3
    + (row.setlist || []).filter(Boolean).length
    + years;

  const bestByUser = new Map<string, { row: any; years: number }>();
  for (const e of eligible) {
    const cur = bestByUser.get(e.row.user_id);
    if (!cur || weight(e) > weight(cur)) bestByUser.set(e.row.user_id, e);
  }

  const userIds = [...bestByUser.keys()];
  const [{ data: sentRows }, { data: tokenRows }] = await Promise.all([
    admin.from('notifications_sent').select('user_id, ref').eq('kind', 'anniversary').in('user_id', userIds),
    admin.from('device_tokens').select('user_id, token').in('user_id', userIds),
  ]);

  // Dedup ref includes the YEAR, so the same show can resurface every year but
  // never twice in one — a plain show id would silence it forever after the
  // first anniversary.
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

  for (const [userId, { row, years }] of bestByUser) {
    const ref = `${row.id}:${today.slice(0, 4)}`;
    if (already.has(`${userId}|${ref}`)) continue;
    const tokens = tokensByUser.get(userId) || [];
    if (!tokens.length) continue;

    const ago = years === 1 ? 'One year ago' : `${years} years ago`;
    const where = row.venue ? ` at ${row.venue}` : '';
    const results = await sendApnsBatch(tokens, {
      title: `${ago} tonight`,
      body: `You saw ${row.artist}${where}. Tap to relive it.`,
      data: { kind: 'anniversary', showId: row.id },
    });

    if (results.some((r) => r.ok)) {
      sent += 1;
      inserts.push({ user_id: userId, kind: 'anniversary', ref });
    }
    results
      .filter((r) => r.reason === 'Unregistered' || r.reason === 'BadDeviceToken')
      .forEach((r) => dead.push({ userId, token: r.token }));
  }

  if (inserts.length) await admin.from('notifications_sent').insert(inserts);
  for (const d of dead) {
    await admin.from('device_tokens').delete().eq('user_id', d.userId).eq('token', d.token);
  }

  return json({ sent, candidates: bestByUser.size, today });
});
