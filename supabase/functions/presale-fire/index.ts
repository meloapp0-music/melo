// Melo — presale-fire Edge Function (scheduled, every minute)
// ============================================================
// The other half of "be the first to know". presale-sweep discovers WHEN a
// presale opens and writes it to public.presale_schedule; this fires at that
// moment.
//
// It makes ZERO Ticketmaster calls. That's the entire point: polling an API
// every minute to catch a moment you were already told about is both more
// expensive and less accurate than reading a clock. A 5,000/day budget cannot
// support a one-minute poll; it supports this indefinitely.
//
// MOST MINUTES THIS DOES ALMOST NOTHING. The first query is one indexed lookup
// on starts_at, and when it returns nothing — which is nearly always — the
// function returns without touching another table. The expensive work of
// resolving who watches whom only happens on the rare minute a presale
// actually opens.
//
// Schedule (Dashboard -> Integrations -> Cron):
//   * * * * *
//
// Deploy:
//   supabase functions deploy presale-fire --no-verify-jwt
//
// docs/initiatives/2026-07-16-notification-digest.md

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { sendApnsBatch, isApnsConfigured } from '../_shared/apns.ts';
import { sentRefsByUser } from '../_shared/sent.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// How far back to look. The cron is every minute, so one minute would in
// principle do — but a skipped or slow invocation would silently drop a
// presale forever. Five minutes of overlap makes a missed run recoverable;
// the per-user dedup key is what stops the overlap double-pushing.
const LOOKBACK_MIN = 5;

// Clock skew guard. Firing 30s early is invisible to a user and beats being
// systematically 30s late on the one alert where late is the same as never.
const SKEW_SEC = 30;

serve(async (_req) => {
  const start = Date.now();
  if (!isApnsConfigured()) return ok({ skipped: true, reason: 'no-apns' });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const now = new Date();
  const from = new Date(now.getTime() - LOOKBACK_MIN * 60_000);
  const to = new Date(now.getTime() + SKEW_SEC * 1000);

  // ---- The only query that runs on a quiet minute.
  const { data: due, error: dueErr } = await admin
    .from('presale_schedule')
    .select('event_id, presale_name, artist, genre, venue, city, ticket_url, starts_at, ends_at, first_seen')
    .gte('starts_at', from.toISOString())
    .lte('starts_at', to.toISOString());
  if (dueErr) {
    console.error('[presale-fire] schedule read failed', dueErr);
    return err({ error: dueErr.message }, 500);
  }

  const live = (due || []).filter((r) => {
    // Already over by the time we got here.
    if (r.ends_at && new Date(r.ends_at) < now) return false;
    // We only learned about this presale AFTER it had already opened, so a
    // "it's live now" alert would be stale — the announcement push from
    // presale-sweep already covered it. Firing here would be a lie about
    // timing, which is the one thing this function exists to get right.
    if (r.first_seen && new Date(r.first_seen) > new Date(r.starts_at)) return false;
    return true;
  });

  if (live.length === 0) {
    return ok({ due: 0, pushed: 0, elapsedMs: Date.now() - start });
  }

  // ---- Something is opening. Now it's worth resolving who asked for it.
  //
  // EXPLICIT TASTE ONLY, matching presale-sweep: the artists and genres the
  // user entered in Music Taste. Not the wishlist/going/attended-and-loved set
  // tour-alerts derives — this is an interruptive push at whatever hour the
  // presale happens to open, and it should only ever fire on a signal someone
  // actually chose.
  const wanted = new Set(live.map((r) => (r.artist || '').trim().toLowerCase()));
  const wantedGenres = new Set(live.map((r) => (r.genre || '').trim()).filter(Boolean));

  const watchers = new Map<string, Set<string>>();
  const genreFollowers = new Map<string, Set<string>>();
  const userCity = new Map<string, string>();

  const { data: profRows } = await admin
    .from('profiles')
    .select('id, fav_artists, fav_genres, home_city');
  for (const p of profRows || []) {
    for (const a of (Array.isArray(p.fav_artists) ? p.fav_artists : [])) {
      const k = (a || '').trim().toLowerCase();
      if (!k || !wanted.has(k)) continue;
      const s = watchers.get(k) || new Set<string>();
      s.add(p.id);
      watchers.set(k, s);
    }
    for (const g of (Array.isArray(p.fav_genres) ? p.fav_genres : [])) {
      const k = (g || '').trim();
      if (!k || !wantedGenres.has(k)) continue;
      const s = genreFollowers.get(k) || new Set<string>();
      s.add(p.id);
      genreFollowers.set(k, s);
    }
    const hc = (p.home_city || '').trim();
    if (hc) userCity.set(p.id, hc);
  }

  // Home-city fallback, only for the genre followers who need one. Not a taste
  // inference — just where someone demonstrably goes to shows.
  if (genreFollowers.size > 0) {
    const { data: showRows } = await admin
      .from('shows')
      .select('user_id, city, status, wishlist');
    const cityCounts = new Map<string, Map<string, number>>();
    for (const r of showRows || []) {
      const isWishlist = r.status === 'wishlist' || r.wishlist === true;
      if (isWishlist || r.status === 'going' || !r.city) continue;
      const m = cityCounts.get(r.user_id) || new Map<string, number>();
      m.set(r.city, (m.get(r.city) || 0) + 1);
      cityCounts.set(r.user_id, m);
    }
    for (const [userId, counts] of cityCounts) {
      if (userCity.has(userId)) continue;
      let best = 0; let city = '';
      for (const [c, n] of counts) if (n > best) { best = n; city = c; }
      if (city) userCity.set(userId, city);
    }
  }

  if (watchers.size === 0 && genreFollowers.size === 0) {
    return ok({ due: live.length, pushed: 0, elapsedMs: Date.now() - start });
  }

  const { data: tokenRows } = await admin
    .from('device_tokens').select('user_id, token, platform');
  const tokensByUser = new Map<string, string[]>();
  for (const t of tokenRows || []) {
    if (t.platform !== 'ios') continue;
    const l = tokensByUser.get(t.user_id) || [];
    l.push(t.token);
    tokensByUser.set(t.user_id, l);
  }

  // Restricted to the refs actually due this minute. This was an unbounded
  // select, which PostgREST caps at 1,000 rows — as the table grew, the dedup
  // set would have started coming back truncated and presales would re-fire.
  // It hadn't bitten here yet only because `due` is almost always 0.
  const sentByUser = await sentRefsByUser(
    admin, 'presale_live', live.map((r) => `${r.event_id}|${r.presale_name}`),
  );

  // ---- Fire.
  let pushed = 0;
  const sentInsertBuffer: Array<{ user_id: string; kind: string; ref: string }> = [];

  for (const r of live) {
    // Same two routes as the sweep: the artist is in your Music Taste, or the
    // genre is AND it's your city.
    const users = new Set<string>(watchers.get((r.artist || '').trim().toLowerCase()) || []);
    const rowCity = (r.city || '').trim().toLowerCase();
    if (r.genre && rowCity) {
      for (const uid of genreFollowers.get(r.genre.trim()) || []) {
        if ((userCity.get(uid) || '').trim().toLowerCase() === rowCity) users.add(uid);
      }
    }
    if (users.size === 0) continue;
    const ref = `${r.event_id}|${r.presale_name}`;

    for (const userId of users) {
      const sent = sentByUser.get(userId) || new Set<string>();
      if (sent.has(ref)) continue;
      const tokens = tokensByUser.get(userId) || [];
      if (!tokens.length) continue;

      const where = [r.venue, r.city].filter(Boolean).join(' · ');
      const results = await sendApnsBatch(tokens, {
        title: `${r.artist} presale is live 🎟️`,
        body: [where, r.presale_name].filter(Boolean).join(' — ') || 'Tap to get tickets',
        data: {
          kind: 'presale_live',
          artist: r.artist,
          eventId: r.event_id,
          ticketUrl: r.ticket_url || '',
        },
      });
      const okCount = results.filter((x) => x.ok).length;
      await pruneDeadTokens(admin, userId, results);
      // Record only on acceptance. The five-minute lookback means there IS a
      // next run while the presale is still newly open, so an undeliverable
      // push retries instead of being lost.
      if (okCount === 0) continue;

      pushed += okCount;
      sent.add(ref);
      sentByUser.set(userId, sent);
      sentInsertBuffer.push({ user_id: userId, kind: 'presale_live', ref });
    }
  }

  if (sentInsertBuffer.length) {
    const { error: insErr } = await admin
      .from('notifications_sent')
      .upsert(sentInsertBuffer, { onConflict: 'user_id,kind,ref', ignoreDuplicates: true });
    if (insErr) console.error('[presale-fire] sent upsert failed', insErr);
  }

  const elapsedMs = Date.now() - start;
  console.log('[presale-fire]', { due: live.length, pushed, elapsedMs });
  return ok({ due: live.length, pushed, elapsedMs });
});

// -------------------- helpers --------------------

async function pruneDeadTokens(
  admin: any,
  userId: string,
  results: Array<{ token: string; ok: boolean; status?: number; reason?: string }>,
) {
  const dead = results
    .filter((r) => !r.ok && (r.status === 410 || r.reason === 'Unregistered' || r.reason === 'BadDeviceToken'))
    .map((r) => r.token);
  if (dead.length) {
    await admin.from('device_tokens').delete().eq('user_id', userId).in('token', dead);
  }
}

function ok(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
function err(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
