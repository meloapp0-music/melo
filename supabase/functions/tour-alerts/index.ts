// Melo — tour-alerts Edge Function (scheduled)
// =============================================
// Daily cron that turns Melo's wishlist from a black hole into the
// app's main re-engagement loop. For each user with wishlisted
// artists, it queries Ticketmaster for newly-announced shows and
// sends an APNs push for any that haven't been notified about yet.
//
// Schedule (set up after deploy):
//   supabase functions schedule create tour-alerts --cron "0 17 * * *"
//   # 17:00 UTC = ~1pm ET, ~10am PT — late enough that everyone
//   # outside Asia is awake.
//
// Required env (Supabase secrets):
//   TICKETMASTER_KEY     — same Discovery API key the client uses
//                          (server-only here, read once per run)
//   APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_AUTH_KEY
//                        — see _shared/apns.ts
//
// Deploy:
//   supabase functions deploy tour-alerts --no-verify-jwt

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { sendApnsBatch, isApnsConfigured } from '../_shared/apns.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TM_KEY = Deno.env.get('TICKETMASTER_KEY');

// Cap how many TM lookups we make per run. Each artist = one
// Discovery call. Free tier is 5,000 req/day; we leave plenty of
// headroom for the in-app callers.
const MAX_LOOKUPS_PER_RUN = 1000;

// Cap notifications per user per run so a user with 100 wishlist
// hits doesn't get a notification storm.
const MAX_NOTIFS_PER_USER = 5;

serve(async (_req) => {
  const start = Date.now();
  if (!TM_KEY) {
    console.warn('[tour-alerts] TICKETMASTER_KEY not set — exiting');
    return ok({ skipped: true, reason: 'no-tm-key' });
  }
  if (!isApnsConfigured()) {
    console.warn('[tour-alerts] APNs not configured — running dry');
    // Continue anyway: still record what we *would* send so a later
    // backfill can replay. (Implementation: notifications_sent
    // inserts are gated below; we skip them in dry-run.)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // ---- Pull every user's shows once. We derive two things per user,
  //      both purely from their logged history (no GPS, no location
  //      permission — mirrors inferHomeCity + topArtists in store.js):
  //        * home city = most-common city among ATTENDED shows
  //        * watch set = "artists you care about": attended-and-loved
  //                      (score >= 7), plus Going, plus Wishlist.
  const { data: rows, error: wlErr } = await admin
    .from('shows')
    .select('id, user_id, artist, city, venue, date, score, status, wishlist');
  if (wlErr) {
    console.error('[tour-alerts] shows query failed', wlErr);
    return err({ error: wlErr.message }, 500);
  }

  const LOVED_MIN_SCORE = 7;
  // user_id -> { cityCounts, watch, going }
  const agg = new Map<string, {
    cityCounts: Map<string, number>;
    watch: Set<string>;
    going: GoingShow[];
  }>();
  for (const r of rows || []) {
    if (!r.artist) continue;
    const isWishlist = r.status === 'wishlist' || r.wishlist === true;
    const isGoing = r.status === 'going';
    const isAttended = !isWishlist && !isGoing;
    const a = agg.get(r.user_id) || { cityCounts: new Map(), watch: new Set(), going: [] };
    if (isAttended && r.city) {
      a.cityCounts.set(r.city, (a.cityCounts.get(r.city) || 0) + 1);
    }
    const score = typeof r.score === 'number' ? r.score : Number(r.score) || 0;
    if (isWishlist || isGoing || (isAttended && score >= LOVED_MIN_SCORE)) {
      a.watch.add(r.artist);
    }
    // Going shows with a future date → pre-show reminder candidates.
    if (isGoing && r.id && r.date) {
      a.going.push({ id: r.id, artist: r.artist, venue: r.venue || '', date: r.date });
    }
    agg.set(r.user_id, a);
  }

  // Resolve each user's home city + finalize watch list + going shows.
  // byUser: user_id -> { homeCity, artists, going }
  const byUser = new Map<string, { homeCity: string; artists: string[]; going: GoingShow[] }>();
  for (const [u, a] of agg) {
    if (a.watch.size === 0 && a.going.length === 0) continue;
    let homeCity = '';
    let best = 0;
    for (const [c, n] of a.cityCounts) {
      if (n > best) { best = n; homeCity = c; }
    }
    byUser.set(u, { homeCity, artists: [...a.watch], going: a.going });
  }

  // Pull device tokens once.
  const { data: tokenRows, error: tokErr } = await admin
    .from('device_tokens')
    .select('user_id, token, platform');
  if (tokErr) {
    console.error('[tour-alerts] tokens read failed', tokErr);
    return err({ error: tokErr.message }, 500);
  }
  const tokensByUser = new Map<string, string[]>();
  for (const t of tokenRows || []) {
    if (t.platform !== 'ios') continue; // APNs-only for v1
    const list = tokensByUser.get(t.user_id) || [];
    list.push(t.token);
    tokensByUser.set(t.user_id, list);
  }

  // Pull what we've already notified so we don't repeat. We manage
  // several kinds here; key the per-user set as `${kind}|${ref}` so
  // each kind dedups in its own namespace.
  const { data: sentRows, error: sentErr } = await admin
    .from('notifications_sent')
    .select('user_id, kind, ref')
    .in('kind', ['tour_alert', 'preshow_week', 'preshow_day', 'preshow_today']);
  if (sentErr) {
    console.error('[tour-alerts] sent read failed', sentErr);
    return err({ error: sentErr.message }, 500);
  }
  const sentByUser = new Map<string, Set<string>>();
  for (const s of sentRows || []) {
    const set = sentByUser.get(s.user_id) || new Set();
    set.add(`${s.kind}|${s.ref}`);
    sentByUser.set(s.user_id, set);
  }

  // ---- For each user, look up their wishlist artists and diff.
  let lookups = 0;
  let pushed = 0;
  let recorded = 0;
  const sentInsertBuffer: Array<{ user_id: string; kind: string; ref: string }> = [];

  for (const [userId, { homeCity, artists, going }] of byUser) {
    if (lookups >= MAX_LOOKUPS_PER_RUN) break;

    const tokens = tokensByUser.get(userId) || [];
    const sent = sentByUser.get(userId) || new Set();
    let userNotifs = 0;

    // --- Pre-show reminders for Going shows (no TM lookup needed) ---
    // Day-of ("tonight"), ~1-2 days out, and ~1 week out. Each fires
    // once per show (deduped by kind). The cron runs ~midday, so the
    // day-of ping lands the day of the show.
    for (const show of going) {
      if (userNotifs >= MAX_NOTIFS_PER_USER) break;
      const d = daysUntil(show.date);
      let kind = '';
      let title = '';
      let body = '';
      if (d === 0) {
        kind = 'preshow_today';
        title = `Tonight: ${show.artist} 🎶`;
        body = `${show.venue ? show.venue + ' · ' : ''}Have your tickets ready and check the venue guidelines. Enjoy the show!`;
      } else if (d >= 1 && d <= 2) {
        kind = 'preshow_day';
        title = d === 1 ? `${show.artist} is tomorrow! 🎶` : `${show.artist} is in 2 days! 🎶`;
        body = `Double-check your tickets and the venue guidelines before you head out.`;
      } else if (d >= 6 && d <= 8) {
        kind = 'preshow_week';
        title = `${show.artist} is 1 week away 🎟️`;
        body = `${show.venue ? show.venue + ' · ' : ''}Got your tickets sorted?`;
      }
      if (!kind) continue;
      const key = `${kind}|${show.id}`;
      if (sent.has(key)) continue;

      if (tokens.length > 0 && isApnsConfigured()) {
        const results = await sendApnsBatch(tokens, {
          title,
          body,
          data: { kind, artist: show.artist, showId: show.id },
        });
        pushed += results.filter((r) => r.ok).length;
        await pruneDeadTokens(admin, userId, results);
      }
      sentInsertBuffer.push({ user_id: userId, kind, ref: show.id });
      sent.add(key);
      userNotifs++;
    }

    for (const artist of artists) {
      if (lookups >= MAX_LOOKUPS_PER_RUN) break;
      if (userNotifs >= MAX_NOTIFS_PER_USER) break;

      lookups++;
      // With a home city we filter TM to that metro, so every result
      // is "playing your city". Without one (brand-new user with no
      // attended shows) we fall back to a global tour-announcement
      // lookup so they're no worse off than before.
      const events = await searchTm(artist, homeCity || null);
      if (!events.length) continue;

      const candidates = events.filter((e) => !sent.has(`tour_alert|${e.id}`));
      if (!candidates.length) continue;
      const ev = candidates[0];

      const inHomeCity =
        !!homeCity && ev.city.toLowerCase().includes(homeCity.toLowerCase());

      // "Playing your city" is the higher-value alert. Fall back to the
      // original tour-announcement copy when we can't place it locally.
      const title = inHomeCity
        ? `${artist} is playing ${homeCity} 🎟️`
        : `${artist} just announced a tour 🎤`;
      const body = inHomeCity
        ? `${ev.venue ? ev.venue + ' · ' : ''}${formatDate(ev.date)} — tickets available`
        : `${ev.city}${ev.state ? ', ' + ev.state : ''} · ${formatDate(ev.date)}`;

      if (tokens.length > 0 && isApnsConfigured()) {
        const results = await sendApnsBatch(tokens, {
          title,
          body,
          data: {
            kind: inHomeCity ? 'city_match' : 'tour_alert',
            artist,
            eventId: ev.id,
            ticketUrl: ev.ticketUrl,
          },
        });
        pushed += results.filter((r) => r.ok).length;
        await pruneDeadTokens(admin, userId, results);
      }

      // Single dedup namespace ('tour_alert') so the same event is
      // never notified twice regardless of which copy fired.
      sentInsertBuffer.push({ user_id: userId, kind: 'tour_alert', ref: ev.id });
      sent.add(`tour_alert|${ev.id}`);
      userNotifs++;
    }
  }

  // Bulk record what we sent, even in dry-run mode if APNs isn't
  // configured — that way a future backfill won't double-push the
  // same events. Skip-on-conflict because the primary key is
  // (user_id, kind, ref).
  if (sentInsertBuffer.length) {
    const { error: insErr } = await admin
      .from('notifications_sent')
      .upsert(sentInsertBuffer, { onConflict: 'user_id,kind,ref', ignoreDuplicates: true });
    if (insErr) {
      console.error('[tour-alerts] sent upsert failed', insErr);
    } else {
      recorded = sentInsertBuffer.length;
    }
  }

  const elapsedMs = Date.now() - start;
  console.log('[tour-alerts]', { users: byUser.size, lookups, pushed, recorded, elapsedMs });
  return ok({ users: byUser.size, lookups, pushed, recorded, elapsedMs });
});

// -------------------- helpers --------------------

interface GoingShow {
  id: string;
  artist: string;
  venue: string;
  date: string;
}

interface TmEvent {
  id: string;
  city: string;
  state: string;
  venue: string;
  date: string;
  ticketUrl: string;
}

// Whole days from today (local) until an ISO date (YYYY-MM-DD).
// Negative = in the past.
function daysUntil(iso: string): number {
  if (!iso) return NaN;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(iso + 'T00:00:00');
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

// Delete APNs tokens Apple reported as dead (410 / Unregistered /
// BadDeviceToken) so we stop pushing to them.
// deno-lint-ignore no-explicit-any
async function pruneDeadTokens(admin: any, userId: string, results: Array<{ token: string; ok: boolean; status?: number; reason?: string }>) {
  const dead = results
    .filter((r) => !r.ok && (r.status === 410 || r.reason === 'Unregistered' || r.reason === 'BadDeviceToken'))
    .map((r) => r.token);
  if (dead.length) {
    await admin.from('device_tokens').delete().eq('user_id', userId).in('token', dead);
  }
}

async function searchTm(artist: string, hintCity: string | null): Promise<TmEvent[]> {
  try {
    const params = new URLSearchParams({
      apikey: TM_KEY!,
      keyword: artist,
      classificationName: 'music',
      sort: 'date,asc',
      size: '20',
    });
    if (hintCity) params.set('city', hintCity);
    const url = `https://app.ticketmaster.com/discovery/v2/events.json?${params}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    const events = data?._embedded?.events || [];
    const lc = artist.toLowerCase();
    // Defensive name match — TM keyword search returns plenty of
    // junk for short artist names.
    return events
      .filter((ev: any) => {
        const attractions = ev?._embedded?.attractions || [];
        if (!attractions.length) return false;
        return attractions.some((a: any) =>
          (a.name || '').toLowerCase().includes(lc) || lc.includes((a.name || '').toLowerCase())
        );
      })
      .map((ev: any) => {
        const venue = ev?._embedded?.venues?.[0] || {};
        return {
          id: ev.id || '',
          city: venue.city?.name || '',
          state: venue.state?.stateCode || venue.state?.name || '',
          venue: venue.name || '',
          date: ev?.dates?.start?.localDate || '',
          ticketUrl: ev.url || '',
        };
      })
      .filter((e: TmEvent) => e.id);
  } catch (err) {
    console.warn('[tour-alerts] TM search failed for', artist, err);
    return [];
  }
}

function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return iso;
  }
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
