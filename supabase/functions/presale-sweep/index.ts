// Melo — presale-sweep Edge Function (scheduled, every 15 min)
// =============================================================
// Half of "be the first to know". This half DISCOVERS: it finds newly-listed
// shows by artists people follow, and it learns when their presales open.
// The other half (presale-fire) does the firing, off the schedule this one
// writes, without touching Ticketmaster at all.
//
// WHY CITY-SWEEP AND NOT ARTIST-KEYWORD:
// The obvious build queries TM once per watched artist. That scales with
// ARTISTS — hundreds — so it can only run hourly inside a 5,000/day budget,
// and hourly is not "first". This queries once per distinct HOME CITY and
// matches artists locally. That scales with CITIES — a couple of dozen — so
// a 15-minute cadence costs roughly a tenth as much and catches strictly more,
// because it sees every artist in the city, not just the ones we thought to
// ask about.
//
// WHY IT DOESN'T POLL FOR "PRESALE IS LIVE":
// TM publishes `sales.presales[].startDateTime` the moment a presale is
// announced, usually days ahead. Once that's known, firing at the right second
// is a clock problem, not an API problem — so presale-fire reads the schedule
// table every minute and spends nothing. Polling to catch the moment would be
// both more expensive and less accurate.
//
// TWO PUSHES PER TOUR, MAXIMUM:
//   1. "Radiohead just announced a tour — 12 dates" (+ presale time if known)
//   2. "Radiohead presale is live now" — fired to the second by presale-fire
// Tour dates are collapsed per artist; a 30-date announcement is one push, not
// thirty. That is the same storm the daily digest exists to prevent.
//
// Schedule (Dashboard -> Integrations -> Cron):
//   */15 * * * *
//
// Deploy:
//   supabase functions deploy presale-sweep --no-verify-jwt
//
// docs/initiatives/2026-07-16-notification-digest.md

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { sendApnsBatch, isApnsConfigured } from '../_shared/apns.ts';
import { sentRefsByUser } from '../_shared/sent.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TM_KEY = Deno.env.get('TICKETMASTER_KEY');

// One TM call per city per run, and the budget fixes the total at 25 (25 x 96
// runs/day = 2,400, leaving tour-alerts its 1,000 and headroom for the app
// inside the 5,000/day free tier).
//
// The first live run swept 25 of 25 — i.e. it hit the cap, so cities beyond
// the top 25 were never swept AT ALL. That's worse than it sounds: a city
// that's never swept never gets its presales into the schedule, so
// presale-fire can never fire for anyone living there. Simply raising the cap
// would break the budget.
//
// So the 25 splits: the busiest markets every single run, and the long tail on
// rotation. Total calls unchanged; coverage goes from "top 25 only, forever"
// to "everywhere, within a few runs".
const HOT_CITIES_PER_RUN = 15;
const ROTATING_CITIES_PER_RUN = 10;

// Announcements per user per run. Collapsed per artist already, so this is
// "three different artists you follow announced something in the last quarter
// hour" — genuinely rare, and a sane ceiling if a festival lineup drops.
const MAX_PUSHES_PER_USER = 3;

// How far into the past a presale is still worth storing.
//
// Ticketmaster returns every presale an event ever had, so the first version
// wrote all of them and then pruned ~99% straight back out: 2,795 rows
// upserted, 2,771 deleted, every 15 minutes, for about 24 useful rows. Pure
// churn against the one index presale-fire reads 1,440 times a day.
//
// presale-fire only ever looks at `starts_at` within [now - 5min, now + 30s],
// so anything older than that can never be selected. The grace is wider than
// fire's own lookback so a slow or skipped sweep can't drop a presale that
// opened between runs. The 7-day prune stays as the ageing-out path for rows
// written legitimately and since passed.
const STORE_GRACE_MIN = 20;

// Melo's genre labels -> Ticketmaster's classification names. Kept in step with
// tour-alerts' copy of the same map. Used in REVERSE here: the city sweep
// already returns every event's classification, so an event's genre is matched
// back to a Melo label locally, at no extra API cost.
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
const TM_TO_MELO_GENRE = new Map<string, string>(
  Object.entries(GENRE_TM_MAP).map(([melo, tm]) => [tm.toLowerCase(), melo]),
);

interface TmEvt {
  id: string;
  artist: string;
  genre: string;      // Melo label, '' when TM's classification doesn't map
  venue: string;
  city: string;
  date: string;
  ticketUrl: string;
  presales: Array<{ name: string; startsAt: Date; endsAt: Date | null }>;
}

serve(async (_req) => {
  const start = Date.now();
  if (!TM_KEY) return ok({ skipped: true, reason: 'no-tm-key' });
  if (!isApnsConfigured()) return ok({ skipped: true, reason: 'no-apns' });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // ---- Who follows what. EXPLICIT TASTE ONLY.
  //
  // Deliberately NOT the wishlist/going/attended-and-loved set that tour-alerts
  // derives. These are interruptive, time-critical pushes, so they fire only on
  // signals the user actually chose: the artists and genres they entered in
  // Music Taste. Inferring "you scored them 8, so you must want a 7am presale
  // alert" is exactly the kind of guess that makes people disable
  // notifications altogether.
  const { data: profRows, error: profErr } = await admin
    .from('profiles')
    .select('id, fav_artists, fav_genres, home_city');
  if (profErr) return err({ error: profErr.message }, 500);

  const watchers = new Map<string, Set<string>>();       // lower(artist) -> users
  const genreFollowers = new Map<string, Set<string>>(); // Melo genre -> users
  const userCity = new Map<string, string>();            // user -> home city

  for (const p of profRows || []) {
    for (const a of (Array.isArray(p.fav_artists) ? p.fav_artists : [])) {
      const k = (a || '').trim().toLowerCase();
      if (!k) continue;
      const s = watchers.get(k) || new Set<string>();
      s.add(p.id);
      watchers.set(k, s);
    }
    for (const g of (Array.isArray(p.fav_genres) ? p.fav_genres : [])) {
      const k = (g || '').trim();
      if (!k) continue;
      const s = genreFollowers.get(k) || new Set<string>();
      s.add(p.id);
      genreFollowers.set(k, s);
    }
    const hc = (p.home_city || '').trim();
    if (hc) userCity.set(p.id, hc);
  }

  // Home city still falls back to the most-attended city when the profile
  // doesn't name one — that's not a taste inference, it's just where someone
  // demonstrably goes to shows, and a genre follow is meaningless without a
  // city to scope it to.
  const { data: showRows } = await admin
    .from('shows')
    .select('user_id, city, status, wishlist');
  const cityCounts = new Map<string, Map<string, number>>();
  for (const r of showRows || []) {
    const isWishlist = r.status === 'wishlist' || r.wishlist === true;
    const isGoing = r.status === 'going';
    if (isWishlist || isGoing || !r.city) continue;
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

  // Distinct cities to sweep, weighted by how many users sit in each.
  const cityUsers = new Map<string, number>();
  for (const city of userCity.values()) {
    cityUsers.set(city, (cityUsers.get(city) || 0) + 1);
  }
  if (cityUsers.size === 0 || (watchers.size === 0 && genreFollowers.size === 0)) {
    return ok({
      cities: 0, artists: watchers.size, genres: genreFollowers.size,
      elapsedMs: Date.now() - start,
    });
  }

  // ---- Tokens + what's already been announced.
  const { data: tokenRows } = await admin
    .from('device_tokens').select('user_id, token, platform');
  const tokensByUser = new Map<string, string[]>();
  for (const t of tokenRows || []) {
    if (t.platform !== 'ios') continue;
    const l = tokensByUser.get(t.user_id) || [];
    l.push(t.token);
    tokensByUser.set(t.user_id, l);
  }

  // The dedup read moved BELOW the sweep. It used to run here as a plain
  // select over the whole 'tour_alert' namespace, which PostgREST silently
  // caps at 1,000 rows — so the set came back truncated, almost everything
  // looked unsent, and the same events re-pushed on every single run. Now the
  // sweep collects candidates first and we look up only those refs.

  // ---- Choose this run's cities: hot ones always, the tail on rotation.
  const ranked = [...cityUsers.entries()].sort((a, b) => b[1] - a[1]);
  const hot = ranked.slice(0, HOT_CITIES_PER_RUN);
  const tail = ranked.slice(HOT_CITIES_PER_RUN);

  // The offset advances one slice per 15-minute slot, so consecutive runs pick
  // up where the last left off and the whole tail is covered every
  // ceil(tail / ROTATING) runs. Derived from the clock rather than stored,
  // which means it needs no state and self-corrects after a missed run.
  let rotating: typeof tail = [];
  if (tail.length > 0) {
    const slices = Math.ceil(tail.length / ROTATING_CITIES_PER_RUN);
    const slot = Math.floor(Date.now() / (15 * 60_000)) % slices;
    const from = slot * ROTATING_CITIES_PER_RUN;
    rotating = tail.slice(from, from + ROTATING_CITIES_PER_RUN);
    // Wrap, so the last (short) slice still gets a full budget rather than
    // wasting calls on a partial run.
    if (rotating.length < ROTATING_CITIES_PER_RUN) {
      rotating = rotating.concat(tail.slice(0, ROTATING_CITIES_PER_RUN - rotating.length));
    }
  }
  const cities = [...hot, ...rotating];
  const now = new Date();

  // user -> artist -> events newly seen this run
  const newByUser = new Map<string, Map<string, TmEvt[]>>();
  const scheduleRows = new Map<string, Record<string, unknown>>();
  let lookups = 0;
  let matched = 0;

  for (const [city] of cities) {
    lookups++;
    const events = await searchCity(city);
    const cityKey = city.trim().toLowerCase();
    for (const ev of events) {
      // Two ways to qualify, both explicit choices the user made:
      //   1. they named this artist in Music Taste
      //   2. they follow this genre AND this is their home city
      // The genre half is city-scoped because "any Rock show anywhere" is not
      // a thing anyone wants pushed to their lock screen.
      const users = new Set<string>(
        watchers.get(ev.artist.trim().toLowerCase()) || [],
      );
      if (ev.genre) {
        for (const uid of genreFollowers.get(ev.genre) || []) {
          if ((userCity.get(uid) || '').trim().toLowerCase() === cityKey) users.add(uid);
        }
      }
      if (users.size === 0) continue;
      matched++;

      // Every presale of a matched event goes into the schedule regardless of
      // whether anyone gets an announcement push — presale-fire needs the row
      // even for an event the user was told about days ago.
      for (const p of ev.presales) {
        scheduleRows.set(`${ev.id}|${p.name}`, {
          event_id: ev.id,
          presale_name: p.name,
          artist: ev.artist,
          genre: ev.genre,
          venue: ev.venue,
          city: ev.city,
          ticket_url: ev.ticketUrl,
          starts_at: p.startsAt.toISOString(),
          ends_at: p.endsAt ? p.endsAt.toISOString() : null,
        });
      }

      // Collected unfiltered — the sent-check happens after the sweep, once we
      // know which refs to ask about.
      for (const userId of users) {
        const byArtist = newByUser.get(userId) || new Map<string, TmEvt[]>();
        const list = byArtist.get(ev.artist) || [];
        list.push(ev);
        byArtist.set(ev.artist, list);
        newByUser.set(userId, byArtist);
      }
    }
  }

  // Write the schedule before pushing. If the push half fails, the schedule is
  // still correct and presale-fire still works — the reverse would mean telling
  // someone a presale is coming and then never firing it.
  if (scheduleRows.size) {
    const { error: schedErr } = await admin
      .from('presale_schedule')
      .upsert([...scheduleRows.values()], { onConflict: 'event_id,presale_name' });
    if (schedErr) console.error('[presale-sweep] schedule upsert failed', schedErr);
  }

  // ---- Retention. The first live run wrote 3,428 rows and nothing ever
  // removed them. presale-fire reads this table 1,440 times a day off the
  // starts_at index, so letting it grow forever slowly taxes the one query
  // that has to stay fast.
  //
  // Keyed on starts_at because that's the indexed column and it's the only one
  // fire cares about — anything that started more than a week ago is far
  // outside fire's five-minute lookback and can never be selected again.
  // Cleanup runs after the upsert so a failure here can never cost us the
  // schedule write, which is the part that actually matters.
  let pruned = 0;
  {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
    const { data: gone, error: pruneErr } = await admin
      .from('presale_schedule')
      .delete()
      .lt('starts_at', cutoff)
      .select('event_id');
    if (pruneErr) console.error('[presale-sweep] prune failed', pruneErr);
    else pruned = (gone || []).length;
  }

  // ---- Now the dedup lookup, restricted to the events this run actually
  // found. Bounded by `matched` rather than by the size of the table, so it
  // stays correct as notifications_sent grows — which is exactly what the
  // unbounded select got wrong.
  const candidateIds = [...new Set(
    [...newByUser.values()].flatMap((m) => [...m.values()].flat()).map((e) => e.id),
  )];
  const sentByUser = await sentRefsByUser(admin, 'tour_alert', candidateIds);

  // ---- Announce. One push per artist, however many dates they announced.
  let pushed = 0;
  let suppressed = 0;
  const sentInsertBuffer: Array<{ user_id: string; kind: string; ref: string }> = [];

  for (const [userId, byArtist] of newByUser) {
    const tokens = tokensByUser.get(userId) || [];
    if (!tokens.length) continue;
    const sent = sentByUser.get(userId) || new Set<string>();
    let userPushes = 0;

    for (const [artist, evsAll] of byArtist) {
      if (userPushes >= MAX_PUSHES_PER_USER) break;
      const evs = evsAll.filter((e) => !sent.has(e.id));
      suppressed += evsAll.length - evs.length;
      if (!evs.length) continue;

      const title = evs.length > 1
        ? `${artist} just announced a tour 🎤`
        : `${artist} just announced a show 🎤`;

      // Lead with the soonest upcoming presale if there is one — it's the part
      // that's time-critical and the reason someone opens this immediately.
      const upcoming = evs
        .flatMap((e) => e.presales)
        .filter((p) => p.startsAt > now)
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];

      const dates = evs.length > 1 ? `${evs.length} dates` : `${evs[0].venue || evs[0].city}`;
      const body = upcoming
        ? `${dates} · presale ${formatWhen(upcoming.startsAt)}`
        : dates;

      const results = await sendApnsBatch(tokens, {
        title,
        body,
        data: { kind: 'tour_drop', artist, eventId: evs[0].id, ticketUrl: evs[0].ticketUrl },
      });
      const okCount = results.filter((r) => r.ok).length;
      await pruneDeadTokens(admin, userId, results);
      // Only record on acceptance, so an undeliverable announcement is retried
      // by the next sweep rather than permanently suppressed.
      if (okCount === 0) continue;

      pushed += okCount;
      userPushes++;
      for (const e of evs) sentInsertBuffer.push({ user_id: userId, kind: 'tour_alert', ref: e.id });
    }
  }

  if (sentInsertBuffer.length) {
    const { error: insErr } = await admin
      .from('notifications_sent')
      .upsert(sentInsertBuffer, { onConflict: 'user_id,kind,ref', ignoreDuplicates: true });
    if (insErr) console.error('[presale-sweep] sent upsert failed', insErr);
  }

  // totalCities vs cities is the coverage check: if totalCities keeps climbing
  // past what the rotation covers in a reasonable number of runs, the budget
  // needs revisiting — that's the signal, not a guess.
  const elapsedMs = Date.now() - start;
  const stats = {
    totalCities: ranked.length,
    cities: cities.length,
    rotationRuns: tail.length ? Math.ceil(tail.length / ROTATING_CITIES_PER_RUN) : 0,
    lookups, matched, scheduled: scheduleRows.size, pruned, suppressed, pushed, elapsedMs,
  };
  console.log('[presale-sweep]', stats);
  return ok(stats);
});

// -------------------- helpers --------------------

async function searchCity(city: string): Promise<TmEvt[]> {
  try {
    const params = new URLSearchParams({
      apikey: TM_KEY!,
      city,
      classificationName: 'music',
      sort: 'date,asc',
      size: '200',
    });
    const res = await fetch(
      `https://app.ticketmaster.com/discovery/v2/events.json?${params}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const events = data?._embedded?.events || [];
    const out: TmEvt[] = [];
    for (const ev of events) {
      const attraction = ev?._embedded?.attractions?.[0];
      const artist = (attraction?.name || '').trim();
      if (!ev.id || !artist) continue;
      const venue = ev?._embedded?.venues?.[0] || {};
      // Only presales that can still matter. TM hands back every presale an
      // event ever had — storing the historical ones meant writing thousands
      // of rows a run and pruning them straight back out.
      const floor = Date.now() - STORE_GRACE_MIN * 60_000;
      const presales: TmEvt['presales'] = [];
      for (const p of (ev?.sales?.presales || [])) {
        const startsAt = p?.startDateTime ? new Date(p.startDateTime) : null;
        if (!startsAt || Number.isNaN(startsAt.getTime())) continue;
        if (startsAt.getTime() < floor) continue;
        const endsAtRaw = p?.endDateTime ? new Date(p.endDateTime) : null;
        const endsAt = endsAtRaw && !Number.isNaN(endsAtRaw.getTime()) ? endsAtRaw : null;
        // Already closed — nothing to tell anyone, and fire would skip it too.
        if (endsAt && endsAt.getTime() < Date.now()) continue;
        presales.push({ name: (p?.name || 'Presale').trim(), startsAt, endsAt });
      }
      // TM's classification comes back on the event we already fetched, so
      // mapping it to a Melo genre label costs nothing. Unmapped genres (TM's
      // taxonomy is wider than Melo's list) fall through as '' and simply
      // never match a genre follow — better than guessing.
      const tmGenre = (ev?.classifications?.[0]?.genre?.name || '').trim().toLowerCase();
      const genre = TM_TO_MELO_GENRE.get(tmGenre) || '';

      out.push({
        id: ev.id,
        artist,
        genre,
        venue: venue.name || '',
        city: venue.city?.name || city,
        date: ev?.dates?.start?.localDate || '',
        ticketUrl: ev.url || '',
        presales,
      });
    }
    return out;
  } catch (e) {
    console.warn('[presale-sweep] TM city sweep failed for', city, e);
    return [];
  }
}

/** "in 40 min" / "Thu 10:00" — short enough for a notification body. */
function formatWhen(d: Date): string {
  const mins = Math.round((d.getTime() - Date.now()) / 60_000);
  if (mins <= 90) return `in ${Math.max(1, mins)} min`;
  try {
    return d.toLocaleString('en-US', {
      weekday: 'short', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

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
