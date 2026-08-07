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

const LOVED_MIN_SCORE = 7;

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
    .select('event_id, presale_name, artist, venue, city, ticket_url, starts_at, ends_at, first_seen')
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

  // ---- Something is opening. Now it's worth resolving watchers.
  // Same derivation as tour-alerts and presale-sweep — wishlist + going +
  // attended-and-loved, plus explicit favourites — so all three agree on who
  // follows whom.
  const wanted = new Set(live.map((r) => (r.artist || '').trim().toLowerCase()));
  const watchers = new Map<string, Set<string>>();
  const addWatcher = (artist: string, userId: string) => {
    const k = (artist || '').trim().toLowerCase();
    if (!k || !wanted.has(k)) return;
    const s = watchers.get(k) || new Set<string>();
    s.add(userId);
    watchers.set(k, s);
  };

  const { data: rows } = await admin
    .from('shows')
    .select('user_id, artist, score, status, wishlist');
  for (const r of rows || []) {
    if (!r.artist) continue;
    const isWishlist = r.status === 'wishlist' || r.wishlist === true;
    const isGoing = r.status === 'going';
    const isAttended = !isWishlist && !isGoing;
    const score = typeof r.score === 'number' ? r.score : Number(r.score) || 0;
    if (isWishlist || isGoing || (isAttended && score >= LOVED_MIN_SCORE)) {
      addWatcher(r.artist, r.user_id);
    }
  }
  const { data: profRows } = await admin.from('profiles').select('id, fav_artists');
  for (const p of profRows || []) {
    for (const a of (Array.isArray(p.fav_artists) ? p.fav_artists : [])) addWatcher(a, p.id);
  }
  if (watchers.size === 0) {
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

  const { data: sentRows } = await admin
    .from('notifications_sent').select('user_id, ref').eq('kind', 'presale_live');
  const sentByUser = new Map<string, Set<string>>();
  for (const s of sentRows || []) {
    const set = sentByUser.get(s.user_id) || new Set<string>();
    set.add(s.ref);
    sentByUser.set(s.user_id, set);
  }

  // ---- Fire.
  let pushed = 0;
  const sentInsertBuffer: Array<{ user_id: string; kind: string; ref: string }> = [];

  for (const r of live) {
    const users = watchers.get((r.artist || '').trim().toLowerCase());
    if (!users) continue;
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
