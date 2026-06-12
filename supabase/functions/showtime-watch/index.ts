// Melo — showtime-watch Edge Function (scheduled, show-hours only)
// ================================================================
// Day-of delay alerts: every run re-checks Ticketmaster's local start
// time for each user's Going shows happening today and pushes
// "⏰ Showtime update" when the time CHANGES from the latest one we saw
// today — including a revert back to the original time (so a bogus
// interim time is always corrected).
//
// Honest scope: this catches delays/reschedules that reach
// Ticketmaster's event data. A delay the venue only posts on Instagram
// never hits any public API — nothing can watch that reliably.
//
// Sighting scheme (no schema change): rows in notifications_sent with
// kind 'showtime' and ref `${showId}|${date}|${localTime}`.
//   * Reads are bounded to TODAY's window (gte sent_at) — never trips
//     PostgREST's 1k default row cap, and a rescheduled show (same row
//     id, new date) starts from a fresh baseline instead of treating a
//     weeks-old time as a day-of change.
//   * "Current time" = the latest sighting by sent_at, not set
//     membership — reverts are pushable.
//   * A changed-time sighting is recorded ONLY after APNs accepts ≥1
//     push (same delivered-gate rule as tour-alerts), so a transient
//     APNs failure retries on the next run instead of being lost.
//   * Rows older than 2 days are pruned each run.
//
// Schedule (Dashboard → Integrations → Cron → Create job):
//   name:     showtime-watch
//   schedule: */30 21-23,0-5 * * *
//   (every 30 min, 21:00–05:30 UTC ≈ 4pm Central – 10:30pm Pacific —
//   show hours coast to coast)
//
// Deploy:
//   supabase functions deploy showtime-watch --no-verify-jwt

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { sendApnsBatch, isApnsConfigured } from '../_shared/apns.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TM_KEY = Deno.env.get('TICKETMASTER_KEY');

// Shared TM budget: the Discovery free tier is 5,000 req/day, split
// between in-app callers, tour-alerts (caps at 1,000/run, 1 run/day)
// and this watch (up to 18 runs/day). 100/run keeps our worst case at
// 1,800/day so the in-app callers keep their headroom. Lookups are per
// distinct (artist, venue, date) with a show today, so real usage is
// far below the cap until Melo is much bigger.
const MAX_LOOKUPS_PER_RUN = 100;

serve(async (_req) => {
  const start = Date.now();
  if (!TM_KEY) {
    console.warn('[showtime-watch] TICKETMASTER_KEY not set — exiting');
    return ok({ skipped: true, reason: 'no-tm-key' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // "Today" per a US-centric clock (UTC−6): the late-evening runs land
  // after midnight UTC while it's still show night in the US, and
  // show.date is the user's local YYYY-MM-DD. Good enough for v1; a
  // per-user timezone would be the P2 refinement.
  const usNow = new Date(Date.now() - 6 * 3600_000);
  const todayStr = usNow.toISOString().slice(0, 10);
  // Start of that UTC−6 day expressed in UTC — bounds the sightings
  // read to today's watch.
  const windowStartIso = `${todayStr}T06:00:00Z`;

  const { data: rows, error: showsErr } = await admin
    .from('shows')
    .select('id, user_id, artist, venue, city, date, status')
    .eq('status', 'going')
    .eq('date', todayStr);
  if (showsErr) {
    console.error('[showtime-watch] shows query failed', showsErr);
    return err({ error: showsErr.message }, 500);
  }

  // Prune sightings older than 2 days so the table stays bounded (and
  // the windowed read below stays tiny). Best-effort.
  const pruneBefore = new Date(Date.now() - 48 * 3600_000).toISOString();
  await admin.from('notifications_sent').delete().eq('kind', 'showtime').lt('sent_at', pruneBefore);

  if (!rows || rows.length === 0) {
    return ok({ shows: 0, pushed: 0, elapsedMs: Date.now() - start });
  }

  // Device tokens (iOS only).
  const { data: tokenRows, error: tokErr } = await admin
    .from('device_tokens')
    .select('user_id, token, platform');
  if (tokErr) {
    console.error('[showtime-watch] tokens read failed', tokErr);
    return err({ error: tokErr.message }, 500);
  }
  const tokensByUser = new Map<string, string[]>();
  for (const t of tokenRows || []) {
    if (t.platform !== 'ios') continue;
    const list = tokensByUser.get(t.user_id) || [];
    list.push(t.token);
    tokensByUser.set(t.user_id, list);
  }

  // Latest sighting per (user, show, date) — today's window only.
  const { data: seenRows, error: seenErr } = await admin
    .from('notifications_sent')
    .select('user_id, ref, sent_at')
    .eq('kind', 'showtime')
    .gte('sent_at', windowStartIso);
  if (seenErr) {
    console.error('[showtime-watch] sightings read failed', seenErr);
    return err({ error: seenErr.message }, 500);
  }
  const latest = new Map<string, { time: string; at: string }>();
  for (const r of seenRows || []) {
    const parts = String(r.ref).split('|');
    if (parts.length !== 3) continue; // ignore any legacy/foreign refs
    const [showId, date, time] = parts;
    const k = `${r.user_id}|${showId}|${date}`;
    const cur = latest.get(k);
    const at = String(r.sent_at);
    if (!cur || at > cur.at) latest.set(k, { time, at });
  }

  // One TM lookup per (artist, venue, date) — multiple users at the
  // same show share it.
  const tmCache = new Map<string, string | null>();
  let lookups = 0;
  let pushed = 0;
  let recorded = 0;

  for (const show of rows) {
    if (!show.artist) continue;
    const cacheKey = `${show.artist}|${show.venue || ''}|${show.date}`.toLowerCase();
    let time: string | null;
    if (tmCache.has(cacheKey)) {
      time = tmCache.get(cacheKey)!;
    } else {
      if (lookups >= MAX_LOOKUPS_PER_RUN) break;
      lookups++;
      time = await fetchTmLocalTime(show.artist, show.venue || '', show.date);
      tmCache.set(cacheKey, time);
    }
    if (!time) continue;

    const k = `${show.user_id}|${show.id}|${show.date}`;
    const ref = `${show.id}|${show.date}|${time}`;
    const prior = latest.get(k);

    if (!prior) {
      // First sighting today = baseline. Record silently.
      const { error: insErr } = await admin
        .from('notifications_sent')
        .upsert({ user_id: show.user_id, kind: 'showtime', ref }, { onConflict: 'user_id,kind,ref', ignoreDuplicates: true });
      if (!insErr) {
        recorded++;
        latest.set(k, { time, at: new Date().toISOString() });
      }
      continue;
    }
    if (prior.time === time) continue; // unchanged

    // Time CHANGED since the last sighting today → alert. Skip (and
    // DON'T record) when we can't deliver, so the next run retries.
    const tokens = tokensByUser.get(show.user_id) || [];
    if (tokens.length === 0 || !isApnsConfigured()) continue;
    const results = await sendApnsBatch(tokens, {
      title: `⏰ Showtime update: ${show.artist}`,
      body: `Now ${formatTime(time)} (was ${formatTime(prior.time)})${show.venue ? ' · ' + show.venue : ''}`,
      data: { kind: 'showtime_change', artist: show.artist, showId: show.id },
    });
    const okCount = results.filter((r) => r.ok).length;
    const dead = results
      .filter((r) => !r.ok && (r.status === 410 || r.reason === 'Unregistered' || r.reason === 'BadDeviceToken'))
      .map((r) => r.token);
    if (dead.length) {
      await admin.from('device_tokens').delete().eq('user_id', show.user_id).in('token', dead);
    }
    if (okCount === 0) continue; // retry next run
    pushed += okCount;

    // Record with a fresh sent_at and WITHOUT ignoreDuplicates: a
    // revert to an earlier time reuses that time's PK row, and bumping
    // sent_at makes it the new "latest".
    const nowIso = new Date().toISOString();
    const { error: updErr } = await admin
      .from('notifications_sent')
      .upsert({ user_id: show.user_id, kind: 'showtime', ref, sent_at: nowIso }, { onConflict: 'user_id,kind,ref' });
    if (updErr) console.error('[showtime-watch] sighting upsert failed', updErr);
    recorded++;
    latest.set(k, { time, at: nowIso });
  }

  const elapsedMs = Date.now() - start;
  console.log('[showtime-watch]', { shows: rows.length, lookups, pushed, recorded, elapsedMs });
  return ok({ shows: rows.length, lookups, pushed, recorded, elapsedMs });
});

// -------------------- helpers --------------------

// TM Discovery: the event's local start time for artist on this date.
// Defensive on three fronts (keyword search returns junk for short
// artist names — same lesson as tour-alerts' searchTm):
//   * date-bounded query (±1 day in UTC absorbs timezone skew),
//   * attraction-name must match the artist,
//   * if the venue can't be matched and more than one candidate
//     remains, return null — a missed check beats watching the wrong
//     show.
async function fetchTmLocalTime(artist: string, venue: string, date: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      apikey: TM_KEY!,
      keyword: artist,
      classificationName: 'music',
      size: '20',
      sort: 'date,asc',
      startDateTime: `${addDays(date, -1)}T00:00:00Z`,
      endDateTime: `${addDays(date, 1)}T23:59:59Z`,
    });
    const res = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const lc = artist.toLowerCase();
    // deno-lint-ignore no-explicit-any
    const events = (data?._embedded?.events || []).filter((ev: any) => {
      if (ev?.dates?.start?.localDate !== date || !ev?.dates?.start?.localTime) return false;
      // deno-lint-ignore no-explicit-any
      const attractions = ev?._embedded?.attractions || [];
      if (!attractions.length) return false;
      // deno-lint-ignore no-explicit-any
      return attractions.some((a: any) => {
        const n = (a.name || '').toLowerCase();
        return n && (n.includes(lc) || lc.includes(n));
      });
    });
    if (events.length === 0) return null;

    const vlc = venue.toLowerCase();
    // deno-lint-ignore no-explicit-any
    const venueMatch = events.find((ev: any) => {
      const evVenue = (ev?._embedded?.venues?.[0]?.name || '').toLowerCase();
      return vlc && evVenue && (evVenue.includes(vlc) || vlc.includes(evVenue));
    });
    const match = venueMatch || (events.length === 1 ? events[0] : null);
    return match?.dates?.start?.localTime || null;
  } catch (e) {
    console.warn('[showtime-watch] TM lookup failed for', artist, e);
    return null;
  }
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// "22:00:00" → "10:00 PM"
function formatTime(t: string): string {
  const [hh, mm] = t.split(':').map(Number);
  if (Number.isNaN(hh)) return t;
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm || 0).padStart(2, '0')} ${ampm}`;
}

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
}
function err(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
}
