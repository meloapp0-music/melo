// Melo — tour-alerts Edge Function (scheduled)
// =============================================
// Daily cron that turns Melo's wishlist from a black hole into the
// app's main re-engagement loop. For each user with wishlisted
// artists, it queries Ticketmaster for newly-announced shows.
//
// TWO DELIVERY MODES, deliberately different:
//
//   DIGEST (discovery) — tour_alert / city_match / genre_alert used to fire
//   one push EACH, up to five back-to-back in the same run. That burst was
//   the whole complaint: "it's nauseating to get notification after
//   notification when it could be a specific time once or twice a day."
//   They now accumulate and leave as ONE push per user per day, landing on
//   the discovery surface which re-queries live.
//
//   INDIVIDUAL (personal + urgent) — preshow_* and postshow_rate still send
//   one push each. These are about a show you already committed to, they're
//   time-critical, and there are at most a handful. Digesting them would be
//   the wrong trade.
//
// Time-critical presales are NOT handled here — a once-daily poll cannot know
// "the second a presale opens". See the presale-watch function, which runs on
// a much tighter interval and stays individual by design.
//
// docs/initiatives/2026-07-16-notification-digest.md
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

// Cap how many TM lookups we make per run. Each artist (or genre) = one
// Discovery call. Free tier is 5,000 req/day; we leave plenty of
// headroom for the in-app callers.
const MAX_LOOKUPS_PER_RUN = 1000;

// Cap INDIVIDUAL pushes per user per run. Since the digest landed this only
// governs the personal/urgent kinds (preshow_*, postshow_rate) — the three
// discovery kinds no longer send one push each, so they no longer compete for
// this budget. It stays as a backstop against a user with 100 Going shows.
const MAX_NOTIFS_PER_USER = 5;

// How many discovery hits one digest may carry. This is a COLLECTION cap, not
// a push cap — they all arrive in a single notification, so it can be far
// larger than the individual budget above without any change in how many times
// the phone buzzes. Bounds the insert buffer and keeps "+N more" honest.
const MAX_DIGEST_ITEMS = 20;

// Genre-wide discovery is far more prolific than named-artist watches (one
// query can surface dozens of shows), so it keeps a sub-cap within the digest
// so a single prolific genre can't fill the whole thing and crowd out the
// named-artist watches the user explicitly asked for.
const MAX_GENRE_NOTIFS_PER_USER = 8;

// Settings' TasteEditor stores genres as free-text labels (see
// TASTE_GENRES in src/web/components/TasteEditor.jsx). Map the ones with a
// confident, stable Ticketmaster Discovery `classificationName` match;
// anything absent (e.g. "Indie", which isn't a standalone top-level TM
// genre) falls back to a `keyword` search in searchTmByGenre — approximate
// rather than a strict category filter, but still functional instead of
// silently dropping the genre. Values verified against Festivals.jsx's
// existing GENRES mapping (already proven live) plus TM's well-established
// public taxonomy for the rest.
const GENRE_TM_MAP: Record<string, string> = {
  'Rock': 'Rock',
  'Pop': 'Pop',
  'Hip-Hop': 'Hip-Hop/Rap',
  'Country': 'Country',
  'Electronic': 'Dance/Electronic',
  'R&B': 'R&B',
  'Metal': 'Metal',
  'Latin': 'Latin',
  'Folk': 'Folk',
  'Jazz': 'Jazz',
  'Alternative': 'Alternative',
};

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

  // Explicit taste from onboarding/settings. This is what lets a
  // BRAND-NEW user (zero logged shows) still get "artist in your city"
  // alerts from day one, and lets any user's chosen home city override
  // the city we'd otherwise infer from their attended shows.
  const { data: profRows } = await admin
    .from('profiles')
    .select('id, fav_artists, fav_genres, home_city');
  const prefs = new Map<string, { favArtists: string[]; favGenres: string[]; homeCity: string }>();
  for (const p of profRows || []) {
    const fav = Array.isArray(p.fav_artists) ? p.fav_artists.filter(Boolean) : [];
    const gen = Array.isArray(p.fav_genres) ? p.fav_genres.filter(Boolean) : [];
    const hc = (p.home_city || '').trim();
    if (fav.length > 0 || gen.length > 0 || hc) {
      prefs.set(p.id, { favArtists: fav, favGenres: gen, homeCity: hc });
    }
  }

  // Resolve each user's home city + finalize watch list + going shows.
  // byUser: user_id -> { homeCity, artists, genres, going }. Union of users
  // with shows-derived signal and users with explicit taste.
  const byUser = new Map<string, { homeCity: string; artists: string[]; genres: string[]; going: GoingShow[] }>();
  for (const u of new Set<string>([...agg.keys(), ...prefs.keys()])) {
    const a = agg.get(u);
    const p = prefs.get(u);
    let inferredCity = '';
    let best = 0;
    if (a) {
      for (const [c, n] of a.cityCounts) {
        if (n > best) { best = n; inferredCity = c; }
      }
    }
    const homeCity = p?.homeCity || inferredCity;
    // Taste-derived favorites (named artists AND genres) only power "in YOUR
    // CITY" alerts — so only watch them when we actually have a city.
    // Otherwise genres would fire a firehose of every matching show
    // worldwide. Shows-derived `watch` (wishlist/going/loved) keeps its
    // existing global behavior since those are explicit actions.
    const favForWatch = homeCity ? (p?.favArtists || []) : [];
    const artists = [...new Set([...(a?.watch || []), ...favForWatch])];
    const genres = homeCity ? [...new Set(p?.favGenres || [])] : [];
    const going = a?.going || [];
    if (artists.length === 0 && genres.length === 0 && going.length === 0) continue;
    byUser.set(u, { homeCity, artists, genres, going });
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
    .in('kind', ['tour_alert', 'genre_alert', 'digest', 'preshow_week', 'preshow_day', 'preshow_today', 'postshow_rate']);
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
  let digests = 0;
  const sentInsertBuffer: Array<{ user_id: string; kind: string; ref: string }> = [];

  for (const [userId, { homeCity, artists, genres, going }] of byUser) {
    if (lookups >= MAX_LOOKUPS_PER_RUN) break;

    const tokens = tokensByUser.get(userId) || [];
    const sent = sentByUser.get(userId) || new Set();
    let userNotifs = 0;

    // The digest. The three discovery kinds (tour_alert / city_match /
    // genre_alert) used to fire one push EACH — up to five back-to-back at
    // ~1pm, which is the "notification after notification" storm this run
    // exists to kill. They accumulate here instead and leave as one push.
    //
    // Nothing is recorded to notifications_sent until that push is accepted,
    // so a failed digest re-surfaces every event tomorrow rather than
    // silently swallowing the lot. Same rule the individual kinds already
    // follow, applied to the batch.
    const digest: Array<{ kind: string; ref: string; artist: string }> = [];

    // --- Show reminders for Going shows (no TM lookup needed) ---
    // Pre-show: 1 week / 1-2 days / day-of. Post-show: the day AFTER,
    // nudge them to rate it — the Going->Rated loop, the single biggest
    // "keep logging" driver. Each fires once per show (deduped by kind).
    // Cron runs ~midday, so day-of lands the day of the show and the
    // post-show prompt lands the day after.
    for (const show of going) {
      if (userNotifs >= MAX_NOTIFS_PER_USER) break;
      const d = daysUntil(show.date);
      let kind = '';
      let title = '';
      let body = '';
      if (d === -1) {
        // Day after the show — convert intent into a logged, rated show.
        kind = 'postshow_rate';
        title = `How was ${show.artist}? 🎶`;
        body = `Rate your show${show.venue ? ' at ' + show.venue : ''}, add photos, and lock it into your year.`;
      } else if (d === 0) {
        kind = 'preshow_today';
        title = `Tonight: ${show.artist} 🎶`;
        // Tapping deep-links to the Show Day card (showtime, weather,
        // directions, bag policy) on ShowDetail.
        body = `${show.venue ? show.venue + ' · ' : ''}Tap for showtime, weather, directions & bag policy.`;
      } else if (d >= 1 && d <= 2) {
        kind = 'preshow_day';
        title = d === 1 ? `${show.artist} is tomorrow! 🎶` : `${show.artist} is in 2 days! 🎶`;
        body = `Tap for showtime, weather, directions & the venue's bag policy.`;
      } else if (d >= 6 && d <= 8) {
        kind = 'preshow_week';
        title = `${show.artist} is 1 week away 🎟️`;
        body = `${show.venue ? show.venue + ' · ' : ''}Got your tickets sorted?`;
      }
      if (!kind) continue;
      const key = `${kind}|${show.id}`;
      if (sent.has(key)) continue;

      let delivered = false;
      if (tokens.length > 0 && isApnsConfigured()) {
        const results = await sendApnsBatch(tokens, {
          title,
          body,
          data: { kind, artist: show.artist, showId: show.id },
        });
        const okCount = results.filter((r) => r.ok).length;
        pushed += okCount;
        delivered = okCount > 0;
        await pruneDeadTokens(admin, userId, results);
      }
      // Only mark as sent once APNs actually ACCEPTS the push. Recording a
      // skipped/failed send is the bug that silently suppressed every
      // reminder while no live device token existed — leave it unrecorded so
      // it retries on a later run, once the user has a deliverable token.
      if (!delivered) continue;
      sentInsertBuffer.push({ user_id: userId, kind, ref: show.id });
      sent.add(key);
      userNotifs++;
    }

    for (const artist of artists) {
      if (lookups >= MAX_LOOKUPS_PER_RUN) break;
      if (digest.length >= MAX_DIGEST_ITEMS) break;

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

      // Into the digest rather than out as its own push. Dedup still uses the
      // single 'tour_alert' namespace so an event that would have fired the
      // "playing your city" copy is never also surfaced as a tour announcement.
      digest.push({ kind: 'tour_alert', ref: ev.id, artist });
      sent.add(`tour_alert|${ev.id}`);
    }

    // --- Genre-wide city discovery: "notify me when ANY artist in these
    //     genres plays my city" — not just artists I've explicitly named.
    //     One Discovery query per selected genre, then ROUND-ROBIN the
    //     results (one pick per genre per pass) so a genre with many
    //     touring acts can't crowd out a quieter one — each selected genre
    //     gets a fair shot at the (small) per-run notification budget.
    //     Genre order is shuffled each run so whichever genre the user
    //     picked first doesn't always win ties.
    if (genres.length > 0 && homeCity) {
      const shuffled = [...genres].sort(() => Math.random() - 0.5);
      const perGenre = new Map<string, TmGenreEvent[]>();
      for (const genre of shuffled) {
        if (lookups >= MAX_LOOKUPS_PER_RUN) break;
        lookups++;
        const events = await searchTmByGenre(genre, homeCity);
        // A show can match both a named-artist watch AND a genre pick —
        // check both namespaces so it's never pushed twice for the same event.
        const candidates = events.filter(
          (e) => !sent.has(`tour_alert|${e.id}`) && !sent.has(`genre_alert|${e.id}`)
        );
        if (candidates.length) perGenre.set(genre, candidates);
      }

      let genreNotifs = 0;
      let progress = true;
      while (progress && genreNotifs < MAX_GENRE_NOTIFS_PER_USER && digest.length < MAX_DIGEST_ITEMS) {
        progress = false;
        for (const genre of shuffled) {
          if (genreNotifs >= MAX_GENRE_NOTIFS_PER_USER || digest.length >= MAX_DIGEST_ITEMS) break;
          const queue = perGenre.get(genre);
          if (!queue || queue.length === 0) continue;
          const ev = queue.shift()!;
          progress = true;

          // Into the same digest as the named-artist watches. The round-robin
          // above still matters: it decides WHICH genre picks make the digest
          // when one genre has far more touring acts than another.
          digest.push({ kind: 'genre_alert', ref: ev.id, artist: ev.artist });
          sent.add(`genre_alert|${ev.id}`);
          genreNotifs++;
        }
      }
    }

    // ---- One push, not five. ----
    // Everything the three discovery kinds found leaves as a single
    // notification. No digest is sent on an empty day: a digest that fires
    // with nothing in it trains people to ignore the one that matters (same
    // principle daily-post already follows).
    //
    // Deduped per user per UTC day so a manual re-invoke can't double-buzz
    // someone. The events inside are already deduped by their own kind, so a
    // second run the same day would find nothing new anyway — this guards the
    // case where it does.
    if (digest.length > 0 && tokens.length > 0 && isApnsConfigured()) {
      const dayRef = new Date().toISOString().slice(0, 10);
      if (!sent.has(`digest|${dayRef}`)) {
        const names = [...new Set(digest.map((d) => d.artist))].filter(Boolean);
        const lead = names.slice(0, 2);
        const rest = digest.length - lead.length;
        const title = `${digest.length} show${digest.length === 1 ? '' : 's'} near you 🎟️`;
        const body = rest > 0 ? `${lead.join(', ')} + ${rest} more` : lead.join(', ');

        const results = await sendApnsBatch(tokens, {
          title,
          body,
          // No event list in the payload — APNs caps at ~4KB and the
          // destination re-queries live on open, so it's always fresher than
          // anything we could have stuffed in here.
          data: { kind: 'digest', count: digest.length, artists: lead },
        });
        const okCount = results.filter((r) => r.ok).length;
        pushed += okCount;
        await pruneDeadTokens(admin, userId, results);

        if (okCount > 0) {
          digests++;
          // The digest itself AND every event it carried, recorded together
          // and only on acceptance. A failed digest leaves all of them
          // unrecorded so tomorrow's run surfaces them again — losing a
          // notification is recoverable, silently swallowing twenty is not.
          sentInsertBuffer.push({ user_id: userId, kind: 'digest', ref: dayRef });
          for (const d of digest) {
            sentInsertBuffer.push({ user_id: userId, kind: d.kind, ref: d.ref });
          }
        }
      }
    }
  }

  // Bulk record only what we ACTUALLY delivered. Every row here was
  // buffered after APNs accepted the push (see the per-notification
  // `delivered` gates above) — a skipped or failed send records nothing
  // and retries on a later run. Skip-on-conflict because the primary key
  // is (user_id, kind, ref).
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
  console.log('[tour-alerts]', { users: byUser.size, lookups, pushed, digests, recorded, elapsedMs });
  return ok({ users: byUser.size, lookups, pushed, digests, recorded, elapsedMs });
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

// Genre discovery isn't scoped to one named artist, so each event carries
// its own resolved headliner name (unlike TmEvent, which is always about
// the single artist searchTm() was called for).
interface TmGenreEvent {
  id: string;
  artist: string;
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

// Genre-wide city discovery: any artist playing `city` in `genre`, not one
// named artist. Uses GENRE_TM_MAP's classificationName when we have a
// confident match; falls back to a keyword search (still scoped to the
// music segment) for a genre label with no stable TM classification (e.g.
// "Indie") so it degrades to approximate matching instead of doing nothing.
async function searchTmByGenre(genre: string, city: string): Promise<TmGenreEvent[]> {
  try {
    const params = new URLSearchParams({
      apikey: TM_KEY!,
      city,
      classificationName: 'music',
      sort: 'date,asc',
      size: '20',
    });
    const tmGenre = GENRE_TM_MAP[genre];
    if (tmGenre) params.set('classificationName', tmGenre);
    else params.set('keyword', genre);

    const url = `https://app.ticketmaster.com/discovery/v2/events.json?${params}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    const events = data?._embedded?.events || [];
    return events
      .map((ev: any) => {
        const venue = ev?._embedded?.venues?.[0] || {};
        const attractions = ev?._embedded?.attractions || [];
        return {
          id: ev.id || '',
          artist: attractions[0]?.name || ev.name || genre,
          city: venue.city?.name || '',
          state: venue.state?.stateCode || venue.state?.name || '',
          venue: venue.name || '',
          date: ev?.dates?.start?.localDate || '',
          ticketUrl: ev.url || '',
        };
      })
      .filter((e: TmGenreEvent) => e.id && e.date);
  } catch (err) {
    console.warn('[tour-alerts] TM genre search failed for', genre, err);
    return [];
  }
}

// (formatDate lived here. It only ever served the per-event discovery pushes,
// which are now one digest carrying a count and two names — no dates. Removed
// rather than left dead; the presale watcher needs times, not calendar dates,
// so it carries its own.)

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
