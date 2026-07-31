// Public profile page — melo.show/@username
// =========================================
// The concert résumé, and the cheapest acquisition loop in the app: people put
// it in their bio and it markets Melo continuously without anyone paying for it.
//
// Server-rendered so link previews work — a client-rendered SPA cannot produce
// per-profile Open Graph tags, and scrapers don't run JS.
//
// PRIVACY, and how this differs from the show page. A share token is
// unguessable, so /s/<token> is safe by obscurity plus opt-in. A profile URL is
// @username — guessable BY DESIGN. So this reads through
// `get_public_profile()` (migration 0021), which hard-filters on an explicit
// `public_profile` flag that defaults to FALSE. An un-published username
// returns nothing, and the page 404s. No RLS policy was added to `profiles` or
// `shows`; `anon` still cannot read either table directly.
//
// Requires the same two env vars as the show route: SUPABASE_URL,
// SUPABASE_ANON_KEY.
//
// docs/initiatives/2026-07-30-public-profile.md

import { esc, safeUrl } from './show.js';

const APP_STORE_URL = 'https://apps.apple.com/us/app/melo-concert-tracker/id6763952800';

const initial = (s) => (String(s || '?').trim()[0] || '?').toUpperCase();

function page({ p, shows, origin }) {
  const name = esc(p.display_name || p.username);
  const handle = esc(p.username);
  const avatar = safeUrl(p.avatar_url);
  const colour = /^#[0-9a-f]{3,8}$/i.test(String(p.avatar_color || '')) ? p.avatar_color : '#E8573A';

  const stats = [
    [p.show_count, p.show_count === 1 ? 'show' : 'shows'],
    [p.artist_count, p.artist_count === 1 ? 'artist' : 'artists'],
    [p.city_count, p.city_count === 1 ? 'city' : 'cities'],
  ].filter(([n]) => Number(n) > 0);

  const top = (p.top_artists || []).map(esc);
  const since = p.first_year ? `Logging shows since ${esc(String(p.first_year))}` : '';

  // The stub drawer, server-side: overlapping ticket stubs, newest in front.
  const drawer = (shows || []).map((s, i) => `
    <li class="stub" style="--i:${i}">
      <span class="stub-artist">${esc(s.artist || '')}</span>
      <span class="stub-meta">${esc([s.venue, s.city].filter(Boolean).join(' · '))}</span>
      <span class="stub-date">${esc(String(s.date || '').slice(0, 10))}</span>
    </li>`).join('');

  const title = `${name} on melo`;
  const desc = stats.length
    ? `${stats.map(([n, l]) => `${n} ${l}`).join(' · ')}${top.length ? ` · Most seen: ${top[0]}` : ''}`
    : 'Concerts, kept forever.';

  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta property="og:title" content="${title}"><meta property="og:description" content="${desc}">
<meta property="og:type" content="profile"><meta property="og:url" content="${esc(origin)}/@${handle}">
<meta name="twitter:card" content="summary">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(1200px 700px at 50% -5%,#EFE7DB,#E4DACB);
  font-family:'DM Sans',system-ui,sans-serif;color:#3D2C1E;min-height:100vh}
.wrap{max-width:560px;margin:0 auto;padding:44px 20px 60px}
.hero{text-align:center;margin-bottom:30px}
.av{width:88px;height:88px;border-radius:50%;margin:0 auto 14px;display:flex;align-items:center;
  justify-content:center;font-family:'Outfit';font-weight:800;font-size:36px;color:#fff;
  background:${colour};background-size:cover;background-position:center;
  box-shadow:0 10px 26px rgba(61,44,30,.28)}
h1{font-family:'Outfit';font-weight:800;font-size:31px;letter-spacing:-.03em;margin:0}
.handle{font-weight:600;color:#9B8A7E;margin-top:2px}
.since{font-size:13px;color:#9B8A7E;margin-top:8px}
.stats{display:flex;justify-content:center;gap:26px;margin:24px 0 6px}
.stat b{display:block;font-family:'Outfit';font-weight:800;font-size:27px;letter-spacing:-.02em}
.stat span{font-size:12px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9B8A7E}
.tops{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;margin-top:20px}
.top{background:#fff;border:1.5px solid rgba(61,44,30,.08);border-radius:999px;
  padding:7px 14px;font-weight:700;font-size:13.5px}
h2{font-family:'Outfit';font-weight:800;font-size:13px;letter-spacing:.13em;text-transform:uppercase;
  color:#9B8A7E;margin:38px 0 14px;text-align:center}
/* The drawer: stubs overlap like a shoebox, newest in front. */
.drawer{list-style:none;padding:0;margin:0}
.stub{position:relative;background:#F3E8CC;border-radius:9px;padding:13px 15px;margin-top:-8px;
  box-shadow:0 5px 14px rgba(61,44,30,.17);border-left:4px solid ${colour};
  transform:rotate(calc((var(--i) % 3 - 1) * .5deg))}
.stub:first-child{margin-top:0}
.stub-artist{display:block;font-family:'Outfit';font-weight:800;font-size:17px;color:#2C1912}
.stub-meta{display:block;font-size:12.5px;color:#7A5A44;margin-top:1px}
.stub-date{position:absolute;top:13px;right:15px;font-size:11.5px;font-weight:700;color:#9B8A7E}
.cta{display:block;text-align:center;margin:36px auto 0;max-width:280px;
  background:linear-gradient(135deg,#F4A261,#E8573A);color:#fff;text-decoration:none;
  font-family:'Outfit';font-weight:700;font-size:15px;border-radius:15px;padding:14px 22px;
  box-shadow:0 8px 22px rgba(232,87,58,.4)}
.foot{text-align:center;font-size:12px;color:#9B8A7E;margin-top:16px}
@media(prefers-color-scheme:dark){
  body{background:radial-gradient(1200px 700px at 50% -5%,#2A1D13,#160D07);color:#FBF6EE}
  .top{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.1);color:#FBF6EE}
}
</style></head><body>
<div class="wrap">
  <div class="hero">
    <div class="av"${avatar ? ` style="background-image:url('${avatar}')"` : ''}>${avatar ? '' : initial(name)}</div>
    <h1>${name}</h1>
    <div class="handle">@${handle}</div>
    ${since ? `<div class="since">${since}</div>` : ''}
    ${stats.length ? `<div class="stats">${stats.map(([n, l]) => `<div class="stat"><b>${esc(String(n))}</b><span>${esc(l)}</span></div>`).join('')}</div>` : ''}
    ${top.length ? `<div class="tops">${top.map((a) => `<span class="top">${a}</span>`).join('')}</div>` : ''}
  </div>
  ${drawer ? `<h2>The drawer</h2><ul class="drawer">${drawer}</ul>` : ''}
  <a class="cta" href="${APP_STORE_URL}">Keep your own shows →</a>
  <div class="foot">melo · where concerts live forever</div>
</div></body></html>`;
}

export async function handleProfile(username, env, origin) {
  const base = env.SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY;
  if (!base || !key) return new Response('Not configured', { status: 500 });

  const rpc = (fn, body) => fetch(`${base}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  try {
    const res = await rpc('get_public_profile', { p_username: username });
    if (!res.ok) return new Response('Not found', { status: 404 });
    const rows = await res.json();
    const p = Array.isArray(rows) ? rows[0] : null;
    // No row means the username doesn't exist OR hasn't opted in. Deliberately
    // the same 404 either way — distinguishing them would leak which handles
    // are taken.
    if (!p) return new Response('Not found', { status: 404 });

    let shows = [];
    try {
      const sres = await rpc('get_public_profile_shows', { p_username: username, p_limit: 24 });
      if (sres.ok) shows = await sres.json();
    } catch { /* the page is worth rendering without the drawer */ }

    return new Response(page({ p, shows, origin }), {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=300',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
