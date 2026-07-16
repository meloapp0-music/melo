// Public show page — melo.show/s/<token>
// =======================================
// A Cloudflare Pages Function (server-rendered, so link previews work — a
// client-rendered SPA cannot produce per-show Open Graph tags; scrapers don't
// run JS).
//
// Reads through `get_public_show(token)` (migration 0016), a SECURITY DEFINER
// RPC that hard-filters on an unguessable token. No token => no row. The `shows`
// table's RLS is untouched and `anon` still cannot read it directly.
//
// Requires two Pages environment variables (Cloudflare dashboard → Settings →
// Environment variables):
//   SUPABASE_URL       e.g. https://aptwdtteplznxmtxnopx.supabase.co
//   SUPABASE_ANON_KEY  the anon key (safe to expose — RLS is the guard)
//
// NOTE: this folder only compiles via `npx wrangler pages deploy marketing/`.
// A manual dashboard drag-and-drop silently ignores /functions and the page
// will 404. See docs/initiatives/2026-06-23-public-share-pages.md.

const APP_STORE_URL = 'https://apps.apple.com/us/app/melo-concert-tracker/id6763952800';
const ORANGE = '#E8573A';

// Every value below is owner-authored free text (artist, venue, notes, setlist
// rows). It is interpolated into HTML, so it MUST be escaped — this is the one
// place a stored XSS could reach a logged-out visitor.
// Exported only so the render can be unit-tested. Cloudflare Pages routes on
// `onRequest*` exports and ignores the rest, so this changes no behaviour.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// Only ever emit URLs we minted. Guards against a poisoned row pointing at
// javascript: or data: in an href/src.
export const safeUrl = (u) => {
  const s = String(u ?? '');
  return /^https:\/\//i.test(s) ? s : '';
};

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

export function page({ show, token, origin }) {
  const artist = esc(show.artist);
  const venue = esc(show.venue || '');
  const city = esc(show.city || '');
  const dateLabel = esc(formatDate(show.date));
  const where = [venue, city].filter(Boolean).join(' · ');

  const photos = (show.photos || []).map(safeUrl).filter(Boolean);
  const videos = (show.videos || []).map(safeUrl).filter(Boolean);
  const setlist = (show.setlist || []).filter(Boolean);
  const vibes = (show.vibes || []).filter(Boolean);
  const openers = (show.openers || []).filter(Boolean);

  const score = show.score == null ? null : Number(show.score);
  const scoreLabel = score == null ? '' : (Number.isInteger(score) ? String(score) : score.toFixed(1));

  const ownerName = esc(show.owner_display_name || show.owner_username || 'A Melo user');
  const ownerHandle = show.owner_username ? `@${esc(show.owner_username)}` : '';
  const ownerAvatar = safeUrl(show.owner_avatar_url);
  const ownerColor = /^#[0-9a-f]{3,8}$/i.test(show.owner_avatar_color || '') ? show.owner_avatar_color : ORANGE;

  // --- Link preview -------------------------------------------------------
  const title = `${show.artist}${where ? ` — ${show.venue || show.city}` : ''}`;
  const descBits = [
    dateLabel,
    where,
    score != null ? `Rated ${scoreLabel}/10` : '',
    setlist.length ? `${setlist.length} songs` : '',
  ].filter(Boolean);
  const description = `${ownerName.replace(/&#39;/g, "'")} saw ${show.artist}. ${descBits.join(' · ')}`;

  // og:image — a real photo from the night beats a generic card. Falls back to
  // the marketing card so a preview is never blank.
  const ogImage = photos[0] || `${origin}/og-share.png`;

  // og:video — the payoff. iMessage autoplays this INSIDE the link bubble,
  // muted + looping, which is as close to "video playing on the share card" as
  // anything can get. ONE clip only (bandwidth), and only .mp4 — .mov/.webm are
  // not reliably handled by scrapers.
  const ogVideo = videos.find((v) => /\.mp4($|\?)/i.test(v)) || '';

  const canonical = `${origin}/s/${encodeURIComponent(token)}`;

  const photoGrid = photos.length ? `
    <section class="sec">
      <h2>Photos</h2>
      <div class="grid">
        ${photos.map((p) => (
          // Drop a dead image, and if that empties the grid, drop the whole
          // section — an orphan "Photos" heading over nothing reads as broken.
          `<img class="ph" src="${esc(p)}" alt="" loading="lazy" onerror="var g=this.parentElement;this.remove();if(g&&!g.children.length&&g.closest('.sec'))g.closest('.sec').remove()" />`
        )).join('')}
      </div>
    </section>` : '';

  // Tap-to-play, deliberately. `preload="none"` means ZERO video bytes leave
  // Storage until a human presses play — bots and link-preview scrapers cost
  // nothing. The poster is the show's own photo, so the frame still looks alive.
  const videoBlock = videos.length ? `
    <section class="sec">
      <h2>${videos.length === 1 ? 'Video' : 'Videos'}</h2>
      ${videos.map((v) => `
        <video class="vid" controls playsinline preload="none"${photos[0] ? ` poster="${esc(photos[0])}"` : ''}>
          <source src="${esc(v)}" />
        </video>`).join('')}
    </section>` : '';

  const setlistBlock = setlist.length ? `
    <section class="sec">
      <h2>Setlist</h2>
      <ol class="setlist">
        ${setlist.map((s) => `<li>${esc(s)}</li>`).join('')}
      </ol>
    </section>` : '';

  const vibesBlock = vibes.length ? `
    <div class="vibes">${vibes.map((v) => `<span class="vibe">${esc(v)}</span>`).join('')}</div>` : '';

  const openersBlock = openers.length
    ? `<div class="openers">with ${openers.map((o) => esc(o)).join(' · ')}</div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${esc(title)} · Melo</title>
<link rel="canonical" href="${esc(canonical)}" />
<meta name="description" content="${esc(description)}" />

<meta property="og:type" content="article" />
<meta property="og:site_name" content="Melo" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${esc(canonical)}" />
<meta property="og:image" content="${esc(ogImage)}" />
<meta name="twitter:card" content="${ogVideo ? 'player' : 'summary_large_image'}" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(ogImage)}" />
${ogVideo ? `
<meta property="og:video" content="${esc(ogVideo)}" />
<meta property="og:video:secure_url" content="${esc(ogVideo)}" />
<meta property="og:video:type" content="video/mp4" />
<meta property="og:video:width" content="1080" />
<meta property="og:video:height" content="1920" />` : ''}

<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400..700&family=Outfit:wght@600;700;800;900&display=swap" rel="stylesheet" />
<style>
  :root { --orange:${ORANGE}; --cream:#FAF8F5; --ink:#2B1D12; --muted:#8B7D70; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--cream); color:var(--ink);
    font-family:'DM Sans',system-ui,-apple-system,sans-serif; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:620px; margin:0 auto; padding:24px 20px 40px; }
  .brand { display:flex; align-items:center; gap:8px; margin-bottom:24px; }
  .brand-mark { font-family:'Outfit',sans-serif; font-weight:800; font-size:20px; letter-spacing:-0.02em; }
  .hero { border-radius:20px; overflow:hidden; position:relative; margin-bottom:20px;
    background:linear-gradient(150deg,#C9622F,#8E3B1E); min-height:180px; display:flex; align-items:flex-end; }
  .hero img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
  .hero-scrim { position:absolute; inset:0;
    background:linear-gradient(180deg,rgba(20,12,6,.05),rgba(20,12,6,.78)); }
  .hero-txt { position:relative; padding:20px; color:#fff; width:100%; }
  h1 { font-family:'Outfit',sans-serif; font-weight:900; font-size:30px; line-height:1.08;
    letter-spacing:-0.03em; margin:0 0 6px; }
  .where { font-size:14.5px; opacity:.92; font-weight:600; }
  .openers { font-size:13px; opacity:.8; margin-top:4px; }
  .score { position:absolute; top:16px; right:16px; background:rgba(255,255,255,.94);
    color:var(--ink); font-family:'Outfit',sans-serif; font-weight:800; font-size:17px;
    border-radius:12px; padding:6px 11px; }
  .who { display:flex; align-items:center; gap:10px; margin-bottom:22px; }
  .av { width:36px; height:36px; border-radius:50%; background-size:cover; background-position:center;
    display:flex; align-items:center; justify-content:center; color:#fff; font-weight:800; font-size:15px;
    font-family:'Outfit',sans-serif; flex:none; }
  .who-name { font-weight:700; font-size:14.5px; }
  .who-sub { font-size:12.5px; color:var(--muted); }
  .sec { margin-bottom:26px; }
  h2 { font-family:'Outfit',sans-serif; font-size:16px; font-weight:800; margin:0 0 10px;
    letter-spacing:-0.01em; }
  .grid { display:grid; grid-template-columns:repeat(2,1fr); gap:8px; }
  .ph { width:100%; aspect-ratio:1; object-fit:cover; border-radius:14px; display:block; background:#EFE9E1; }
  .vid { width:100%; border-radius:14px; display:block; background:#000; margin-bottom:10px; }
  .setlist { margin:0; padding-left:22px; }
  .setlist li { padding:5px 0; font-size:14.5px; border-bottom:1px solid rgba(90,60,30,.07); }
  .vibes { display:flex; flex-wrap:wrap; gap:6px; margin:0 0 26px; }
  .vibe { background:#fff; border:1px solid rgba(90,60,30,.1); border-radius:999px;
    padding:5px 11px; font-size:12.5px; font-weight:600; }
  .cta { display:block; text-align:center; background:var(--orange); color:#fff; text-decoration:none;
    font-weight:800; font-family:'Outfit',sans-serif; font-size:16px; padding:15px; border-radius:14px;
    box-shadow:0 6px 20px rgba(232,87,58,.3); }
  .cta-sub { text-align:center; color:var(--muted); font-size:12.5px; margin-top:10px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="brand"><span class="brand-mark">melo</span></div>

  <div class="hero">
    ${photos[0]
      // A stored photo URL can 404 (owner removed the object, array kept the
      // URL). Drop the <img> so the gradient shows through instead of a broken
      // icon — the hero must never look broken to a stranger.
      ? `<img src="${esc(photos[0])}" alt="" onerror="this.remove()" />`
      : ''}
    <div class="hero-scrim"></div>
    ${scoreLabel ? `<div class="score">${esc(scoreLabel)}</div>` : ''}
    <div class="hero-txt">
      <h1>${artist}</h1>
      <div class="where">${[where, dateLabel].filter(Boolean).join(' · ')}</div>
      ${openersBlock}
    </div>
  </div>

  <div class="who">
    <div class="av" style="${ownerAvatar ? `background-image:url('${esc(ownerAvatar)}')` : `background:${esc(ownerColor)}`}">
      ${ownerAvatar ? '' : esc(ownerName.slice(0, 1).toUpperCase())}
    </div>
    <div>
      <div class="who-name">${ownerName} was there</div>
      ${ownerHandle ? `<div class="who-sub">${ownerHandle}</div>` : ''}
    </div>
  </div>

  ${vibesBlock}
  ${videoBlock}
  ${setlistBlock}
  ${photoGrid}

  <a class="cta" href="${APP_STORE_URL}">Track your own shows — get Melo</a>
  <div class="cta-sub">Melo · where concerts live forever</div>
</div>
</body>
</html>`;
}

function notFound() {
  return new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Show not found · Melo</title>
<meta name="robots" content="noindex" />
<style>body{margin:0;background:#FAF8F5;color:#2B1D12;font-family:system-ui,-apple-system,sans-serif;
display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px}
a{color:#E8573A;font-weight:700}</style></head>
<body><div><h1 style="font-size:22px;margin:0 0 8px">This show isn't shared</h1>
<p style="color:#8B7D70;margin:0 0 18px">The link may have expired, or its owner stopped sharing it.</p>
<a href="${APP_STORE_URL}">Get Melo</a></div></body></html>`,
    { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}

export async function onRequestGet(context) {
  const { params, env, request } = context;
  const token = params.token;
  if (!token || typeof token !== 'string' || token.length > 64) return notFound();

  const SUPABASE_URL = env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response('Share pages are not configured.', { status: 500 });
  }

  let rows;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_public_show`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ p_token: token }),
    });
    if (!res.ok) return notFound();
    rows = await res.json();
  } catch {
    return new Response('Temporarily unavailable.', { status: 503 });
  }

  const show = Array.isArray(rows) ? rows[0] : rows;
  if (!show || !show.artist) return notFound();

  const origin = new URL(request.url).origin;
  return new Response(page({ show, token, origin }), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Short cache: a revoked token must stop serving quickly, but a viral
      // link shouldn't hammer the RPC. Scrapers get a fresh-enough page.
      'cache-control': 'public, max-age=300',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
    },
  });
}
