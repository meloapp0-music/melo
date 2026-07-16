// melo.show/tonight — the daily post artifact
// ===========================================
// A full-bleed 9:16 page listing tonight's shows in a city. Open it on a phone,
// screenshot, post. The screenshot IS the artifact — no image generation, no
// Canvas-in-Deno, no design work at post time.
//
//   /tonight            -> Chicago (the default; see the initiative note on why
//                          posting stays one-city even though the code isn't)
//   /tonight?city=Austin -> any city, because it costs nothing to parameterize
//
// Requires one env var on the Worker: TICKETMASTER_KEY. (The same key already
// ships in the app bundle as VITE_TICKETMASTER_KEY, so this exposes nothing new.)
//
// Routed from worker.js — melo.show is a Worker with static assets, not a Pages
// project, so there is no `functions/` convention. Deploy:
//   cd marketing && npx wrangler deploy

const DEFAULT_CITY = 'Chicago';
const ORANGE = '#E8573A';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const safeUrl = (u) => (/^https:\/\//i.test(String(u ?? '')) ? String(u) : '');

// Ticketmaster prefixes listing state into the NAME — "*SOLD OUT* Hunx and His
// Punx", "*JUST ANNOUNCED* …". Real results, and they make a post look scraped
// rather than curated. The show is still on, so keep it and drop the marker.
const cleanName = (s) => String(s ?? '')
  .replace(/\*[^*]{2,24}\*/g, '')
  .replace(/\s{2,}/g, ' ')
  .trim();

function page({ city, shows, total, dateLabel, failed }) {
  const rows = shows.map((s, i) => `
    <li class="row">
      <span class="rank">${i + 1}</span>
      <span class="art"${s.image ? ` style="background-image:url('${esc(s.image)}')"` : ''}></span>
      <span class="txt">
        <span class="artist">${esc(s.artist)}</span>
        <span class="venue">${esc(s.venue || city)}</span>
      </span>
    </li>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex" />
<title>Tonight in ${esc(city)} · Melo</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400..700&family=Outfit:wght@600;700;800;900&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #140C07;
    color: #FBF6EE;
    font-family: 'DM Sans', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    min-height: 100dvh;
  }
  /* Full-bleed 9:16-ish so a phone screenshot IS the post — no cropping. */
  .card {
    min-height: 100dvh;
    display: flex; flex-direction: column;
    padding: calc(env(safe-area-inset-top, 0px) + 44px) 28px calc(env(safe-area-inset-bottom, 0px) + 32px);
    background:
      radial-gradient(120% 60% at 50% 0%, rgba(232,87,58,0.30), transparent 62%),
      linear-gradient(180deg, #241408, #140C07 60%);
  }
  .eyebrow {
    font-size: 12px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase;
    color: ${ORANGE}; margin-bottom: 10px;
  }
  h1 {
    font-family: 'Outfit', sans-serif; font-weight: 900; font-size: 44px; line-height: 0.98;
    letter-spacing: -0.035em; margin-bottom: 8px;
  }
  .date { font-size: 15px; color: rgba(251,246,238,0.58); font-weight: 600; }
  .count {
    display: inline-block; margin-top: 18px; margin-bottom: 22px;
    font-size: 12.5px; font-weight: 700; color: #FBF6EE;
    background: rgba(232,87,58,0.18); border: 1px solid rgba(232,87,58,0.42);
    border-radius: 999px; padding: 6px 12px;
  }
  ul { list-style: none; display: flex; flex-direction: column; gap: 14px; flex: 1; }
  .row { display: flex; align-items: center; gap: 13px; }
  .rank {
    font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 13px;
    color: rgba(251,246,238,0.32); width: 16px; flex: none;
  }
  .art {
    width: 52px; height: 52px; border-radius: 11px; flex: none;
    background: linear-gradient(135deg, #8A4326, #46200F);
    background-size: cover; background-position: center;
  }
  .txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .artist {
    font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 19px; letter-spacing: -0.02em;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .venue {
    font-size: 13px; color: rgba(251,246,238,0.55); font-weight: 600;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .foot {
    margin-top: 26px; padding-top: 18px;
    border-top: 1px solid rgba(251,246,238,0.10);
    display: flex; align-items: center; justify-content: space-between;
  }
  .mark { font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 19px; letter-spacing: -0.02em; }
  .tag { font-size: 11.5px; color: rgba(251,246,238,0.42); font-weight: 600; }
  .empty { flex: 1; display: flex; align-items: center; color: rgba(251,246,238,0.5); font-size: 15px; }
  .more { margin-top: 12px; font-size: 12.5px; color: rgba(251,246,238,0.42); font-weight: 600; }
</style>
</head>
<body>
  <div class="card">
    <div class="eyebrow">Tonight</div>
    <h1>${esc(city)}</h1>
    <div class="date">${esc(dateLabel)}</div>
    ${shows.length
      // The badge states the TRUE total, not the number of rows that fit — a
      // post claiming "7 shows" on a 12-show night is just wrong. When the list
      // is trimmed for legibility, say so rather than silently under-count.
      ? `<div class="count">${total} ${total === 1 ? 'show' : 'shows'} on tonight</div>
         <ul>${rows}</ul>
         ${total > shows.length
           ? `<div class="more">+ ${total - shows.length} more across the city</div>` : ''}`
      // A LOOKUP FAILURE MUST NOT LOOK LIKE A QUIET NIGHT. Ticketmaster
      // rate-limits (429s on quota) and has outages; rendering "quiet one" then
      // would put a lie on a card meant for posting — on a night with 9 real
      // shows. Say which one it is.
      : failed
        ? `<div class="empty">Couldn’t load tonight’s shows — try again in a bit.</div>`
        : `<div class="empty">Nothing listed tonight — quiet one.</div>`}
    <div class="foot">
      <span class="mark">melo</span>
      <span class="tag">melo.show · where concerts live forever</span>
    </div>
  </div>
</body>
</html>`;
}

export async function handleTonight(request, env) {
  const url = new URL(request.url);
  const city = (url.searchParams.get('city') || DEFAULT_CITY).slice(0, 40);
  // How many fit the frame without shrinking the type — a screenshot is only
  // good if it's readable.
  const limit = Math.min(Number(url.searchParams.get('limit')) || 7, 12);

  const key = env.TICKETMASTER_KEY;
  if (!key) return new Response('TICKETMASTER_KEY is not set on this Pages project.', { status: 500 });

  // Cloudflare runs in UTC, and this is the bug that matters: a naive UTC "day"
  // ends at 23:59Z = 6:59pm in Chicago, so it silently drops the evening shows —
  // i.e. all the ones anybody cares about. (Measured: 2 shows vs 9 for the same
  // night.) So resolve the CITY's local day and convert that window to UTC.
  // Intl gives us the real offset, so DST is handled rather than hardcoded.
  const tz = url.searchParams.get('tz') || 'America/Chicago';
  const now = new Date();

  const offsetMs = (() => {
    try {
      const p = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }).formatToParts(now).reduce((a, x) => (a[x.type] = x.value, a), {});
      // Hour can come back as "24" at midnight in some ICU builds.
      const hour = p.hour === '24' ? 0 : Number(p.hour);
      const asIfUTC = Date.UTC(+p.year, +p.month - 1, +p.day, hour, +p.minute, +p.second);
      return asIfUTC - now.getTime();
    } catch { return 0; } // unknown tz → fall back to UTC rather than 500
  })();

  // "Today" as the city experiences it.
  const localNow = new Date(now.getTime() + offsetMs);
  const y = localNow.getUTCFullYear();
  const m = localNow.getUTCMonth();
  const d = localNow.getUTCDate();
  const startUtc = new Date(Date.UTC(y, m, d, 0, 0, 0) - offsetMs);
  const endUtc = new Date(Date.UTC(y, m, d, 23, 59, 59) - offsetMs);
  const iso = (dt) => dt.toISOString().replace(/\.\d{3}Z$/, 'Z');

  const params = new URLSearchParams({
    apikey: key,
    city,
    classificationName: 'music',
    startDateTime: iso(startUtc),
    endDateTime: iso(endUtc),
    sort: 'date,asc',
    size: '50',
  });

  let shows = [];
  let total = 0;
  // Distinguishes "the lookup broke" from "genuinely nothing on" — see page().
  let failed = false;
  try {
    const res = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`);
    if (!res.ok) {
      // 429 (daily quota) is the realistic one, and it must not read as a quiet
      // night on a card built for posting.
      failed = true;
    } else {
      const data = await res.json();
      const live = (data?._embedded?.events || [])
        // Never post a dead show. TM keeps cancelled/postponed listings in the
        // feed and some also carry it in the NAME ("*CANCELLED* Los de la
        // Homan" — a real result on the first live run). Both get dropped:
        // being wrong about your own city is the fastest way to lose a local
        // audience.
        .filter((ev) => {
          const code = ev?.dates?.status?.code;
          if (code && code !== 'onsale' && code !== 'offsale') return false;
          return !/cancell?ed|postponed|rescheduled/i.test(ev?.name || '');
        })
        .map((ev) => ({
          artist: cleanName(ev._embedded?.attractions?.[0]?.name || ev.name || ''),
          venue: cleanName(ev._embedded?.venues?.[0]?.name || ''),
          image: safeUrl(
            (ev.images || []).find((i) => i.ratio === '16_9' && i.width >= 640)?.url
            || (ev.images || [])[0]?.url || ''
          ),
        }))
        .filter((s) => s.artist);
      // Count AFTER filtering (so cancelled listings never inflate it) but
      // BEFORE the display slice (so the number is the truth, not the layout).
      total = live.length;
      shows = live.slice(0, limit);
    }
  } catch {
    failed = true; // network/parse — same rule: say so, don't fake a quiet night
  }

  const dateLabel = localNow.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  });

  return new Response(page({ city, shows, total, dateLabel, failed }), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Short — it's a daily artifact, and a stale one is useless. Never cache a
      // failure: a 429 pinned for 15 min would outlast the thing that caused it.
      'cache-control': failed ? 'no-store' : 'public, max-age=900',
      'x-content-type-options': 'nosniff',
    },
  });
}
