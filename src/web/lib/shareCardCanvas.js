// shareCardCanvas.js — native Canvas 2D renderers for the share-card styles.
//
// Why this exists: html2canvas mis-rasterizes the cards in the iOS WKWebview
// (letter-spaced text breaks mid-word, fonts race, gradients/shadows bleed) and
// NONE of it reproduces in desktop Chromium, so every fix was blind. Canvas
// output is identical on every platform — reliable on device AND verifiable on
// desktop. The on-screen PREVIEW still uses the React components; this draws the
// EXPORT only. See docs/initiatives/2026-06-25-share-cards-native-canvas.md.

import QRCode from 'qrcode';
import { vibeStyle } from '../store';

const INSTALL_URL = 'https://apps.apple.com/us/app/melo-concert-tracker/id6763952800';

// ---- shared helpers ---------------------------------------------------------

function rrPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Manual letter-spacing — draw glyph by glyph (ctx.letterSpacing isn't on older
// iOS). ctx.textAlign must be 'left'. Returns the end x.
function fillSpaced(ctx, text, x, y, spacing) {
  let cx = x;
  for (const ch of [...String(text)]) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  return cx - spacing;
}
function spacedWidth(ctx, text, spacing) {
  let w = 0;
  for (const ch of [...String(text)]) w += ctx.measureText(ch).width + spacing;
  return Math.max(0, w - spacing);
}

// Shrink-to-fit a single line: lower the px size until it fits maxW.
function fitFont(ctx, text, weight, size, family, maxW, min = 40) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (ctx.measureText(text).width > maxW && s > min) {
    s -= 3;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  return s;
}

function loadImg(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Draw an image as cover-fit inside a rounded rect.
function drawCover(ctx, img, x, y, w, h, r) {
  ctx.save();
  rrPath(ctx, x, y, w, h, r);
  ctx.clip();
  const ir = img.width / img.height, br = w / h;
  let dw, dh, dx, dy;
  if (ir > br) { dh = h; dw = h * ir; dx = x - (dw - w) / 2; dy = y; }
  else { dw = w; dh = w / ir; dx = x; dy = y - (dh - h) / 2; }
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

// Warm generative fill for a photo slot that has no image.
function drawWarmField(ctx, x, y, w, h, r) {
  ctx.save();
  rrPath(ctx, x, y, w, h, r); ctx.clip();
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#3A2233'); g.addColorStop(1, '#1A1320');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.restore();
}

async function ensureFonts() {
  if (!document.fonts || !document.fonts.load) return;
  const specs = [
    '400 1em Outfit', '500 1em Outfit', '600 1em Outfit', '700 1em Outfit', '800 1em Outfit',
    '400 1em "DM Sans"', '500 1em "DM Sans"', '600 1em "DM Sans"', '700 1em "DM Sans"',
  ];
  try { await Promise.all(specs.map((s) => document.fonts.load(s).catch(() => {}))); } catch { /* noop */ }
  try { await document.fonts.ready; } catch { /* noop */ }
}

async function makeQr(url, dark = '#140C07') {
  try {
    const u = await QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark, light: '#FFFFFF' } });
    return await loadImg(u);
  } catch { return null; }
}

function fmtDate(d) {
  if (!d) return '';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  } catch { return d; }
}

const OUTFIT = 'Outfit, system-ui, sans-serif';
const DM = '"DM Sans", system-ui, sans-serif';

// ---- Ticket -----------------------------------------------------------------
// Collectible stub: warm bleed framing a cream ticket with a photo window,
// setlist, perforation, barcode + serial, and the scan lockup.
function drawTicket(ctx, show, { flags, photoImgs, qrImg, handle }) {
  const W = 1080, H = 1920;

  // warm ember bleed
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, '#4B1D10');
  bg.addColorStop(0.5, '#C0492C');
  bg.addColorStop(1, '#7C2E1A');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // cream ticket
  const tx = 30, ty = 30, tw = W - 60, th = H - 60;
  ctx.save();
  ctx.shadowColor = 'rgba(40,20,10,0.40)'; ctx.shadowBlur = 70; ctx.shadowOffsetY = 26;
  rrPath(ctx, tx, ty, tw, th, 44);
  ctx.fillStyle = '#FAF8F5'; ctx.fill();
  ctx.restore();

  const cx0 = tx + 56;          // content left
  const cx1 = tx + tw - 56;     // content right
  const cw = cx1 - cx0;
  let y = ty + 58;

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // header: wordmark + I WAS THERE pill
  ctx.fillStyle = '#3D2C1E';
  ctx.font = `800 46px ${OUTFIT}`;
  ctx.fillText('melo', cx0, y + 38);
  ctx.font = `700 20px ${OUTFIT}`;
  const pls = 20 * 0.16;
  const ptw = spacedWidth(ctx, 'I WAS THERE', pls);
  const pPadX = 18, pillH = 48, pillW = ptw + pPadX * 2;
  const pillX = cx1 - pillW, pillY = y + 6;
  ctx.strokeStyle = '#E8573A'; ctx.lineWidth = 2.5;
  rrPath(ctx, pillX, pillY, pillW, pillH, pillH / 2); ctx.stroke();
  ctx.fillStyle = '#E8573A';
  fillSpaced(ctx, 'I WAS THERE', pillX + pPadX, pillY + 31, pls);

  y += 52;

  // photo window — grid: tall left + 2 stacked right
  const pwTop = y + 32, pwH = 548, pwW = cw, gap = 14;
  const leftW = Math.round((pwW - gap) * 1.35 / 2.35);
  const rightW = pwW - gap - leftW;
  const rightX = cx0 + leftW + gap;
  const rowH = (pwH - gap) / 2;
  const slot = (img, x, yy, w, h) => (img ? drawCover(ctx, img, x, yy, w, h, 18) : drawWarmField(ctx, x, yy, w, h, 18));
  slot(photoImgs[0], cx0, pwTop, leftW, pwH);
  slot(photoImgs[1], rightX, pwTop, rightW, rowH);
  slot(photoImgs[2], rightX, pwTop + rowH + gap, rightW, rowH);
  // rating badge (top-right of the photo window)
  if (flags.rating && show.score != null) {
    ctx.font = `800 30px ${OUTFIT}`;
    const sTxt = String(show.score);
    const starW = ctx.measureText('★ ').width;
    const bw = starW + ctx.measureText(sTxt).width + 32;
    const bh = 56, bxr = cx0 + pwW - 18 - bw, byr = pwTop + 18;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    rrPath(ctx, bxr, byr, bw, bh, 18); ctx.fill();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFC75F'; ctx.fillText('★', bxr + 16, byr + bh / 2 + 1);
    ctx.fillStyle = '#3D2C1E'; ctx.fillText(sTxt, bxr + 16 + starW, byr + bh / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }
  y = pwTop + pwH;

  // title
  y += 30;
  const artist = show.artist || '';
  const ts = fitFont(ctx, artist, 800, artist.length > 13 ? 92 : 116, OUTFIT, cw, 56);
  ctx.fillStyle = '#3D2C1E';
  ctx.fillText(artist, cx0, y + ts * 0.8);
  y += ts * 0.8 + 6;

  // venue
  if (flags.venue && show.venue) {
    y += 30;
    ctx.fillStyle = '#6B5A4E';
    ctx.font = `600 34px ${DM}`;
    ctx.fillText(show.venue + (show.city ? ` · ${show.city}` : ''), cx0, y + 26);
    y += 26;
  }
  // date
  if (flags.date && show.date) {
    y += 18;
    ctx.fillStyle = '#E8573A';
    ctx.font = `700 32px ${OUTFIT}`;
    ctx.fillText(fmtDate(show.date), cx0, y + 26);
    y += 26;
  }
  // vibes — outlined chips
  const vibes = show.vibes || [];
  if (flags.vibes && vibes.length) {
    y += 26;
    const chipH = 56, chSize = 30;
    let chx = cx0;
    ctx.font = `700 ${chSize}px ${DM}`;
    ctx.textBaseline = 'middle';
    for (const v of vibes) {
      const st = vibeStyle(v);
      const c = st.color || '#E8573A';
      const tw2 = ctx.measureText(v).width;
      const padX = 24, chipW = tw2 + padX * 2;
      if (chx + chipW > cx1) break;
      if (st.bg) { ctx.fillStyle = st.bg; rrPath(ctx, chx, y, chipW, chipH, chipH / 2); ctx.fill(); }
      ctx.strokeStyle = c; ctx.lineWidth = 2;
      rrPath(ctx, chx, y, chipW, chipH, chipH / 2); ctx.stroke();
      ctx.fillStyle = c;
      ctx.fillText(v, chx + padX, y + chipH / 2 + 1);
      chx += chipW + 12;
    }
    ctx.textBaseline = 'alphabetic';
    y += chipH;
  }

  // ----- bottom-anchored block (perforation + barcode/serial + scan lockup) ---
  const contentBottom = ty + th - 48;
  // scan lockup (right)
  const qrSize = 150;
  const qrX = cx1 - qrSize, qrY = contentBottom - 92 - qrSize;
  if (qrImg) {
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
    ctx.fillStyle = '#3D2C1E';
    ctx.font = `700 27px ${OUTFIT}`;
    ctx.textAlign = 'center';
    ctx.fillText('Scan to get Melo', qrX + qrSize / 2, qrY + qrSize + 38);
    ctx.fillStyle = 'rgba(61,44,30,0.6)';
    ctx.font = `600 22px ${DM}`;
    ctx.fillText(handle ? `melo.show · @${handle}` : 'melo.show', qrX + qrSize / 2, qrY + qrSize + 72);
    ctx.textAlign = 'left';
  }
  // barcode + serial (left)
  const barBottom = contentBottom - 60;
  const barH = 76, barTop = barBottom - barH - 40;
  let bxx = cx0;
  for (let i = 0; i < 40 && bxx < qrX - 60; i++) {
    const seed = (i * 13 + (artist.charCodeAt(i % (artist.length || 1)) || 5)) % 7;
    const bw = (seed % 3) + 2;
    ctx.globalAlpha = seed === 0 ? 0.18 : 1;
    ctx.fillStyle = '#3D2C1E';
    ctx.fillRect(bxx, barTop, bw, barH);
    bxx += bw + 3;
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#3D2C1E';
  ctx.font = `700 19px ${OUTFIT}`;
  const serial = `NO. ${(show.date || '').replace(/-/g, '')} · ${(show.city || '').toUpperCase()}`;
  fillSpaced(ctx, serial, cx0, barTop + barH + 32, 19 * 0.12);
  ctx.fillStyle = 'rgba(61,44,30,0.55)';
  ctx.font = `500 18px ${DM}`;
  ctx.fillText('General admission · one night only', cx0, barTop + barH + 62);

  // perforation row above the barcode
  const perfY = barTop - 44;
  ctx.font = `700 20px ${OUTFIT}`;
  const perfLabel = 'ADMIT ONE · GA';
  const als = 20 * 0.22;
  const aw = spacedWidth(ctx, perfLabel, als);
  const acx = cx0 + cw / 2;
  ctx.strokeStyle = 'rgba(61,44,30,0.22)'; ctx.lineWidth = 3;
  ctx.setLineDash([3, 9]);
  ctx.beginPath(); ctx.moveTo(cx0, perfY); ctx.lineTo(acx - aw / 2 - 22, perfY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(acx + aw / 2 + 22, perfY); ctx.lineTo(cx1, perfY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(61,44,30,0.4)';
  fillSpaced(ctx, perfLabel, acx - aw / 2, perfY + 7, als);

  // ----- setlist (fills the space between vibes and the perforation) ----------
  const setlist = show.setlist || [];
  if (flags.setlist && setlist.length) {
    y += 30;
    ctx.fillStyle = '#9B8A7E';
    ctx.font = `700 19px ${OUTFIT}`;
    fillSpaced(ctx, 'SETLIST', cx0, y + 16, 19 * 0.2);
    y += 30;
    const tracks = setlist.slice(0, 6);
    tracks.forEach((t, i) => {
      if (i) {
        ctx.strokeStyle = 'rgba(61,44,30,0.10)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx0, y); ctx.lineTo(cx1, y); ctx.stroke();
      }
      const rowH2 = 64;
      const midY = y + rowH2 / 2;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#E8573A';
      ctx.font = `800 24px ${OUTFIT}`;
      ctx.fillText(String(i + 1).padStart(2, '0'), cx0, midY + 1);
      ctx.fillStyle = '#3D2C1E';
      const tsz = fitFont(ctx, t, 700, 37, OUTFIT, cw - 58, 24);
      ctx.font = `700 ${tsz}px ${OUTFIT}`;
      ctx.fillText(t, cx0 + 58, midY + 1);
      ctx.textBaseline = 'alphabetic';
      y += rowH2;
    });
    if (setlist.length > tracks.length) {
      ctx.fillStyle = '#9B8A7E';
      ctx.font = `700 23px ${OUTFIT}`;
      ctx.fillText(`+ ${setlist.length - tracks.length} more songs ›`, cx0, y + 32);
    }
  }
}

// ---- dispatcher -------------------------------------------------------------
const DRAWERS = { ticket: drawTicket };

// Render the chosen style to a PNG Blob. Returns null when there's no canvas
// renderer for that style yet (caller should fall back to renderShowCard).
export async function renderStyledCard(show, opts = {}) {
  const { style = 'vibe', format = '9x16', flags = {}, photos = true, handle } = opts;
  const draw = DRAWERS[style];
  if (!draw) return null;

  await ensureFonts();
  const W = 1080, H = format === '1x1' ? 1080 : 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  const urls = photos ? (show.photos || []).slice(0, 3) : [];
  const [p0, p1, p2, qrImg] = await Promise.all([
    loadImg(urls[0]), loadImg(urls[1] || urls[0]), loadImg(urls[2] || urls[1] || urls[0]), makeQr(INSTALL_URL),
  ]);

  draw(ctx, show, { flags, photoImgs: [p0, p1, p2], qrImg, handle, format });

  return await new Promise((res) => canvas.toBlob((b) => res(b), 'image/png', 0.95));
}

export function hasCanvasStyle(style) { return !!DRAWERS[style]; }
