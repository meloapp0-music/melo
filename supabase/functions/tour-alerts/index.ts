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

  // ---- Pull every wishlist row (status='wishlist' OR legacy
  //      `wishlist=true` for pre-0002 rows). One query, joined to
  //      the user's device tokens so we know who to push.
  const { data: rows, error: wlErr } = await admin
    .from('shows')
    .select('user_id, artist, city')
    // status column was added in 0002; OR with legacy boolean for safety.
    .or('status.eq.wishlist,wishlist.eq.true');
  if (wlErr) {
    console.error('[tour-alerts] wishlist query failed', wlErr);
    return err({ error: wlErr.message }, 500);
  }

  // user_id -> { artists: Set<string>, city?: string }
  // We pick "their" city as the most-common city across attended
  // shows separately, but for the cron we just use a per-row hint.
  const byUser = new Map<string, { artists: Map<string, string | null> }>();
  for (const r of rows || []) {
    const u = byUser.get(r.user_id) || { artists: new Map() };
    if (!u.artists.has(r.artist)) u.artists.set(r.artist, r.city || null);
    byUser.set(r.user_id, u);
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

  // Pull what we've already notified so we don't repeat.
  const { data: sentRows, error: sentErr } = await admin
    .from('notifications_sent')
    .select('user_id, ref')
    .eq('kind', 'tour_alert');
  if (sentErr) {
    console.error('[tour-alerts] sent read failed', sentErr);
    return err({ error: sentErr.message }, 500);
  }
  const sentByUser = new Map<string, Set<string>>();
  for (const s of sentRows || []) {
    const set = sentByUser.get(s.user_id) || new Set();
    set.add(s.ref);
    sentByUser.set(s.user_id, set);
  }

  // ---- For each user, look up their wishlist artists and diff.
  let lookups = 0;
  let pushed = 0;
  let recorded = 0;
  const sentInsertBuffer: Array<{ user_id: string; kind: string; ref: string }> = [];

  for (const [userId, { artists }] of byUser) {
    if (lookups >= MAX_LOOKUPS_PER_RUN) break;

    const tokens = tokensByUser.get(userId) || [];
    const sent = sentByUser.get(userId) || new Set();
    let userNotifs = 0;

    for (const [artist, hintCity] of artists) {
      if (lookups >= MAX_LOOKUPS_PER_RUN) break;
      if (userNotifs >= MAX_NOTIFS_PER_USER) break;

      lookups++;
      const events = await searchTm(artist, hintCity);
      if (!events.length) continue;

      // Push the first event we haven't notified about yet.
      // Prefer one in the user's hint city if present.
      const candidates = events
        .sort((a, b) => {
          const aH = hintCity && a.city.toLowerCase().includes(hintCity.toLowerCase()) ? -1 : 0;
          const bH = hintCity && b.city.toLowerCase().includes(hintCity.toLowerCase()) ? -1 : 0;
          return aH - bH;
        })
        .filter((e) => !sent.has(e.id));
      if (!candidates.length) continue;

      const ev = candidates[0];

      if (tokens.length > 0 && isApnsConfigured()) {
        const results = await sendApnsBatch(tokens, {
          title: `${artist} just announced a tour 🎤`,
          body: `${ev.city}${ev.state ? ', ' + ev.state : ''} · ${formatDate(ev.date)}`,
          data: { kind: 'tour_alert', artist, eventId: ev.id, ticketUrl: ev.ticketUrl },
        });
        const okCount = results.filter((r) => r.ok).length;
        pushed += okCount;
        // Prune dead tokens. Apple uses 410 Unregistered + reasons
        // `BadDeviceToken`/`Unregistered` for stale tokens.
        const dead = results
          .filter((r) => !r.ok && (r.status === 410 || r.reason === 'Unregistered' || r.reason === 'BadDeviceToken'))
          .map((r) => r.token);
        if (dead.length) {
          await admin.from('device_tokens').delete()
            .eq('user_id', userId)
            .in('token', dead);
        }
      }

      sentInsertBuffer.push({ user_id: userId, kind: 'tour_alert', ref: ev.id });
      sent.add(ev.id);
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

interface TmEvent {
  id: string;
  city: string;
  state: string;
  date: string;
  ticketUrl: string;
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
