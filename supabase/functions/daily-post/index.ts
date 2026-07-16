// Melo — daily-post Edge Function (scheduled)
// ===========================================
// A FOUNDER/OPS TOOL, not a product feature. It pushes ONE person (the account
// named by DAILY_POST_USER_ID) a daily nudge that tonight's city card is ready
// to post, deep-linking to melo.show/tonight — open, screenshot, post.
//
// Why it's scoped to one user and not shipped to everyone: a daily "here's
// what's on" push to the whole base is a digest nobody asked for, and Melo's
// other pushes are all EARNED (a tour you want announced, your show is
// tomorrow, someone reacted). Notification fatigue is how an app gets deleted.
// The product version of this idea is taste-triggered — "an artist you love is
// playing your city tonight" — which is a different, opt-in feature. See
// docs/initiatives/2026-07-16-tonight-in-your-city.md.
//
// Inert unless DAILY_POST_USER_ID is set, so deploying it changes nothing for
// anyone else.
//
// Schedule (17:00 UTC ≈ noon Chicago CDT — enough runway to post before doors):
//   supabase functions schedule create daily-post --cron "0 17 * * *"
//
// Required env (Supabase secrets):
//   DAILY_POST_USER_ID   — the auth user id to notify. UNSET = no-op.
//   TICKETMASTER_KEY     — the Discovery key (already used by tour-alerts)
//   APNS_*               — see _shared/apns.ts
//   DAILY_POST_CITY      — optional, default "Chicago"
//   DAILY_POST_TZ        — optional, default "America/Chicago"
//
// Deploy:
//   supabase functions deploy daily-post --no-verify-jwt

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { sendApnsBatch, isApnsConfigured } from '../_shared/apns.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TM_KEY = Deno.env.get('TICKETMASTER_KEY');
const USER_ID = Deno.env.get('DAILY_POST_USER_ID');
const CITY = Deno.env.get('DAILY_POST_CITY') || 'Chicago';
const TZ = Deno.env.get('DAILY_POST_TZ') || 'America/Chicago';
const POST_URL = 'https://melo.show/tonight';

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

/** The city's local day as a UTC window.
 *
 *  Deno on Supabase runs in UTC, and this is NOT a nicety: a naive UTC "today"
 *  ends at 23:59Z = 6:59pm in Chicago, which silently drops every evening show —
 *  i.e. all the ones worth posting. (Measured on the sibling Pages Function: 2
 *  shows vs 9 for the same night.) Intl gives the real offset, so DST is handled
 *  rather than hardcoded. */
function localDayWindow(tz: string, now = new Date()) {
  let offsetMs = 0;
  try {
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(now).reduce((a: Record<string, string>, x) => (a[x.type] = x.value, a), {});
    const hour = p.hour === '24' ? 0 : Number(p.hour);
    offsetMs = Date.UTC(+p.year, +p.month - 1, +p.day, hour, +p.minute, +p.second) - now.getTime();
  } catch { /* unknown tz -> UTC */ }

  const local = new Date(now.getTime() + offsetMs);
  const y = local.getUTCFullYear(), m = local.getUTCMonth(), d = local.getUTCDate();
  const iso = (dt: Date) => dt.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return {
    start: iso(new Date(Date.UTC(y, m, d, 0, 0, 0) - offsetMs)),
    end: iso(new Date(Date.UTC(y, m, d, 23, 59, 59) - offsetMs)),
    // Local calendar date — the dedup ref, so "once per local day" is honest.
    dayKey: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
  };
}

/** Tonight's music in `city`, minus the listings that would embarrass a post. */
async function fetchTonight(city: string, startDateTime: string, endDateTime: string) {
  const params = new URLSearchParams({
    apikey: TM_KEY!, city, classificationName: 'music',
    startDateTime, endDateTime, sort: 'date,asc', size: '50',
  });
  const res = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`);
  if (!res.ok) throw new Error(`ticketmaster ${res.status}`);
  const data = await res.json();
  return (data?._embedded?.events || [])
    // TM keeps cancelled listings in the feed AND prefixes state into the name
    // ("*CANCELLED* …"). Both would make the card wrong, and being wrong about
    // your own city is how a local audience stops trusting you.
    .filter((ev: any) => {
      const code = ev?.dates?.status?.code;
      if (code && code !== 'onsale' && code !== 'offsale') return false;
      return !/cancell?ed|postponed|rescheduled/i.test(ev?.name || '');
    })
    .map((ev: any) => ({
      artist: String(ev?._embedded?.attractions?.[0]?.name || ev?.name || '')
        .replace(/\*[^*]{2,24}\*/g, '').replace(/\s{2,}/g, ' ').trim(),
      venue: ev?._embedded?.venues?.[0]?.name || '',
    }))
    .filter((s: { artist: string }) => s.artist);
}

serve(async () => {
  if (!USER_ID) return json({ skipped: 'DAILY_POST_USER_ID not set — nothing to do' });
  if (!TM_KEY) return json({ error: 'TICKETMASTER_KEY not set' }, 500);
  if (!isApnsConfigured()) return json({ error: 'APNs not configured' }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { start, end, dayKey } = localDayWindow(TZ);

  let shows: Array<{ artist: string; venue: string }>;
  try {
    shows = await fetchTonight(CITY, start, end);
  } catch (e) {
    console.error('[daily-post] ticketmaster failed', e);
    return json({ error: String(e) }, 502);
  }

  // Nothing on = no push. A daily nudge that fires on an empty night trains you
  // to ignore it, which is the only way this tool can fail.
  if (shows.length === 0) return json({ sent: 0, reason: `nothing on in ${CITY} tonight` });

  // Once per local day, even if the cron double-fires.
  const ref = `${CITY}|${dayKey}`;
  const { data: already } = await admin
    .from('notifications_sent')
    .select('ref')
    .eq('user_id', USER_ID).eq('kind', 'daily_post').eq('ref', ref)
    .maybeSingle();
  if (already) return json({ sent: 0, reason: 'already sent today' });

  const { data: tokenRows, error: tokErr } = await admin
    .from('device_tokens')
    .select('token')
    .eq('user_id', USER_ID);
  if (tokErr) return json({ error: tokErr.message }, 500);

  const tokens = (tokenRows || []).map((t: { token: string }) => t.token).filter(Boolean);
  if (!tokens.length) return json({ sent: 0, reason: 'no device tokens for that user' });

  const headliner = shows[0]?.artist;
  const results = await sendApnsBatch(tokens, {
    title: `${shows.length} ${shows.length === 1 ? 'show' : 'shows'} in ${CITY} tonight`,
    body: headliner ? `${headliner} and more — tap to grab today's card` : 'Tap to grab today’s card',
    data: { kind: 'daily_post', url: POST_URL, city: CITY },
  });

  const ok = results.filter((r) => r.ok).length;
  if (ok > 0) {
    await admin.from('notifications_sent')
      .insert({ user_id: USER_ID, kind: 'daily_post', ref })
      .select();
  }

  // Prune tokens APNs says are dead, same as tour-alerts.
  const dead = results
    .filter((r) => r.reason === 'Unregistered' || r.reason === 'BadDeviceToken')
    .map((r) => r.token);
  if (dead.length) {
    await admin.from('device_tokens').delete().eq('user_id', USER_ID).in('token', dead);
  }

  return json({ sent: ok, shows: shows.length, city: CITY, dayKey });
});
