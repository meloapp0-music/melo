// Melo — presale-watch Edge Function (scheduled, frequent)
// =========================================================
// The urgent half of the notification split. tour-alerts runs once a day and
// bundles discovery into a single digest — which is right for "there are shows
// near you", and useless for "the presale opens in forty minutes". A once-daily
// poll cannot know that. This runs hourly and stays INDIVIDUAL by design:
// a presale is the one alert where being late is the same as not sending it.
//
// Scope is deliberately narrow — presales for artists the user actually
// watches. Newly-announced shows stay in the daily digest: a show announced at
// 2pm loses nothing by being reported at 5pm, whereas a presale does.
//
// THE EFFICIENCY THAT MAKES AN HOURLY CRON AFFORDABLE:
// tour-alerts queries per user, per artist. Here the watch sets are inverted
// into artist -> Set<userId> FIRST, so an artist five hundred people watch
// costs one Ticketmaster call, not five hundred. Without that inversion this
// cadence would be impossible inside the API budget.
//
// Schedule (Dashboard -> Integrations -> Cron):
//   0 * * * *          # hourly, on the hour
//
// Required env (Supabase secrets):
//   TICKETMASTER_KEY
//   APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_AUTH_KEY
//
// Deploy:
//   supabase functions deploy presale-watch --no-verify-jwt
//
// docs/initiatives/2026-07-16-notification-digest.md

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { sendApnsBatch, isApnsConfigured } from '../_shared/apns.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TM_KEY = Deno.env.get('TICKETMASTER_KEY');

// Ticketmaster's free tier is 5,000 requests/day. tour-alerts already reserves
// up to 1,000 of those, and the in-app callers need headroom. At hourly that
// leaves this ~150/run (150 x 24 = 3,600). When the union of watched artists
// grows past this the fix is a rotation across runs or a paid tier — NOT a
// higher cap, which would starve the app's own lookups.
const MAX_LOOKUPS_PER_RUN = 150;

// How far ahead a presale counts as "imminent". An hour is enough warning to
// actually do something about it — set a reminder, get to a laptop.
const LOOKAHEAD_MIN = 60;

// How far BACK to look. The cron is hourly, so a presale that opened at :05
// would otherwise be missed entirely by the :00 runs either side. Overlapping
// the window guarantees every presale is seen by at least one run; the dedup
// key is what stops the overlap becoming a double push.
const LOOKBACK_MIN = 75;

// Per user per run. Presales cluster (an artist announcing a tour opens twenty
// dates at once), and twenty pushes for one announcement is exactly the storm
// the digest was built to end.
const MAX_PUSHES_PER_USER = 3;

const LOVED_MIN_SCORE = 7;

interface Presale {
  eventId: string;
  artist: string;
  venue: string;
  city: string;
  name: string;
  startsAt: Date;
  ticketUrl: string;
}

serve(async (_req) => {
  const start = Date.now();
  if (!TM_KEY) {
    console.warn('[presale-watch] TICKETMASTER_KEY not set — exiting');
    return ok({ skipped: true, reason: 'no-tm-key' });
  }
  if (!isApnsConfigured()) {
    console.warn('[presale-watch] APNs not configured — exiting');
    return ok({ skipped: true, reason: 'no-apns' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // ---- Build artist -> watchers, the inversion the whole design rests on.
  // Watch set matches tour-alerts exactly (wishlist + going + attended-and-
  // loved), so the two functions never disagree about who cares about whom.
  const { data: rows, error: showErr } = await admin
    .from('shows')
    .select('user_id, artist, score, status, wishlist');
  if (showErr) {
    console.error('[presale-watch] shows query failed', showErr);
    return err({ error: showErr.message }, 500);
  }

  const watchers = new Map<string, Set<string>>(); // artist -> user_ids
  const addWatcher = (artist: string, userId: string) => {
    const key = (artist || '').trim();
    if (!key) return;
    const set = watchers.get(key) || new Set<string>();
    set.add(userId);
    watchers.set(key, set);
  };

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

  // Explicit favourites, so a brand-new user with nothing logged still gets
  // presale alerts for the artists they named at onboarding.
  const { data: profRows } = await admin
    .from('profiles')
    .select('id, fav_artists');
  for (const p of profRows || []) {
    const fav = Array.isArray(p.fav_artists) ? p.fav_artists.filter(Boolean) : [];
    for (const a of fav) addWatcher(a, p.id);
  }

  if (watchers.size === 0) {
    return ok({ artists: 0, pushed: 0, elapsedMs: Date.now() - start });
  }

  // ---- Tokens and dedup, pulled once.
  const { data: tokenRows } = await admin
    .from('device_tokens')
    .select('user_id, token, platform');
  const tokensByUser = new Map<string, string[]>();
  for (const t of tokenRows || []) {
    if (t.platform !== 'ios') continue;
    const list = tokensByUser.get(t.user_id) || [];
    list.push(t.token);
    tokensByUser.set(t.user_id, list);
  }

  const { data: sentRows } = await admin
    .from('notifications_sent')
    .select('user_id, ref')
    .eq('kind', 'presale');
  const sentByUser = new Map<string, Set<string>>();
  for (const s of sentRows || []) {
    const set = sentByUser.get(s.user_id) || new Set<string>();
    set.add(s.ref);
    sentByUser.set(s.user_id, set);
  }

  // ---- Sweep. Artists most-watched first, so if the lookup cap bites it
  // bites the long tail rather than the artists most people care about.
  const now = new Date();
  const windowStart = new Date(now.getTime() - LOOKBACK_MIN * 60_000);
  const windowEnd = new Date(now.getTime() + LOOKAHEAD_MIN * 60_000);

  const ordered = [...watchers.entries()].sort((a, b) => b[1].size - a[1].size);

  let lookups = 0;
  let pushed = 0;
  let found = 0;
  const pushesByUser = new Map<string, number>();
  const sentInsertBuffer: Array<{ user_id: string; kind: string; ref: string }> = [];

  for (const [artist, users] of ordered) {
    if (lookups >= MAX_LOOKUPS_PER_RUN) break;
    lookups++;

    const presales = await findPresales(artist, windowStart, windowEnd);
    if (!presales.length) continue;
    found += presales.length;

    for (const ps of presales) {
      const ref = `${ps.eventId}|${ps.name}`;
      const open = ps.startsAt <= now;
      const minsAway = Math.max(0, Math.round((ps.startsAt.getTime() - now.getTime()) / 60_000));

      for (const userId of users) {
        const sent = sentByUser.get(userId) || new Set<string>();
        if (sent.has(ref)) continue;
        if ((pushesByUser.get(userId) || 0) >= MAX_PUSHES_PER_USER) continue;
        const tokens = tokensByUser.get(userId) || [];
        if (!tokens.length) continue;

        const title = open
          ? `Presale open now: ${ps.artist} 🎟️`
          : `${ps.artist} presale in ${minsAway} min 🎟️`;
        const where = [ps.venue, ps.city].filter(Boolean).join(' · ');
        const body = [where, ps.name].filter(Boolean).join(' — ') || 'Tap for tickets';

        const results = await sendApnsBatch(tokens, {
          title,
          body,
          data: {
            kind: 'presale',
            artist: ps.artist,
            eventId: ps.eventId,
            ticketUrl: ps.ticketUrl,
          },
        });
        const okCount = results.filter((r) => r.ok).length;
        await pruneDeadTokens(admin, userId, results);
        // Same rule as every other alert in this codebase: record only what
        // APNs accepted, so an undeliverable push retries on the next run
        // instead of being permanently suppressed. The window overlap means
        // there IS a next run before the presale opens.
        if (okCount === 0) continue;

        pushed += okCount;
        sent.add(ref);
        sentByUser.set(userId, sent);
        pushesByUser.set(userId, (pushesByUser.get(userId) || 0) + 1);
        sentInsertBuffer.push({ user_id: userId, kind: 'presale', ref });
      }
    }
  }

  if (sentInsertBuffer.length) {
    const { error: insErr } = await admin
      .from('notifications_sent')
      .upsert(sentInsertBuffer, { onConflict: 'user_id,kind,ref', ignoreDuplicates: true });
    if (insErr) console.error('[presale-watch] sent upsert failed', insErr);
  }

  const elapsedMs = Date.now() - start;
  console.log('[presale-watch]', { artists: watchers.size, lookups, found, pushed, elapsedMs });
  return ok({ artists: watchers.size, lookups, found, pushed, elapsedMs });
});

// -------------------- helpers --------------------

/**
 * Ticketmaster Discovery events for an artist, reduced to the presales whose
 * start falls inside the window. `sales.presales[]` is where the interesting
 * data lives — an event typically carries several (artist presale, venue
 * presale, cardholder presale), each with its own start, and each separately
 * worth knowing about.
 */
async function findPresales(artist: string, from: Date, to: Date): Promise<Presale[]> {
  try {
    const params = new URLSearchParams({
      apikey: TM_KEY!,
      keyword: artist,
      classificationName: 'music',
      sort: 'date,asc',
      size: '20',
    });
    const res = await fetch(
      `https://app.ticketmaster.com/discovery/v2/events.json?${params}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const events = data?._embedded?.events || [];
    const lc = artist.toLowerCase();
    const out: Presale[] = [];

    for (const ev of events) {
      // Same defensive name match tour-alerts uses — TM keyword search returns
      // a lot of junk for short artist names.
      const attractions = ev?._embedded?.attractions || [];
      const matches = attractions.some((a: any) => {
        const n = (a?.name || '').toLowerCase();
        return n.includes(lc) || lc.includes(n);
      });
      if (!matches) continue;

      const venue = ev?._embedded?.venues?.[0] || {};
      const presales = ev?.sales?.presales || [];
      for (const p of presales) {
        const startsAt = p?.startDateTime ? new Date(p.startDateTime) : null;
        if (!startsAt || Number.isNaN(startsAt.getTime())) continue;
        if (startsAt < from || startsAt > to) continue;
        // Already finished by the time we looked — nothing to tell anyone.
        const endsAt = p?.endDateTime ? new Date(p.endDateTime) : null;
        if (endsAt && !Number.isNaN(endsAt.getTime()) && endsAt < new Date()) continue;

        out.push({
          eventId: ev.id || '',
          artist: attractions[0]?.name || artist,
          venue: venue.name || '',
          city: venue.city?.name || '',
          name: (p?.name || 'Presale').trim(),
          startsAt,
          ticketUrl: ev.url || '',
        });
      }
    }
    return out.filter((p) => p.eventId);
  } catch (err) {
    console.warn('[presale-watch] TM lookup failed for', artist, err);
    return [];
  }
}

// Deliberately identical to tour-alerts'. Two crons pruning the same table on
// different criteria would mean a token one considers dead the other keeps
// pushing to — the reason codes are what APNs actually documents, and a bare
// 400 covers failures that have nothing to do with the token being invalid.
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
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function err(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
