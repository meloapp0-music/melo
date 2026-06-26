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

function fillSpacedCentered(ctx, text, cx, y, spacing) {
  const w = spacedWidth(ctx, text, spacing);
  const prev = ctx.textAlign; ctx.textAlign = 'left';
  fillSpaced(ctx, text, cx - w / 2, y, spacing);
  ctx.textAlign = prev;
}

function drawEqualizer(ctx, cx, cy, bars, barW, gap, maxH, color) {
  const total = bars * barW + (bars - 1) * gap;
  let x = cx - total / 2;
  for (let i = 0; i < bars; i++) {
    const h = maxH * (0.4 + 0.6 * Math.abs(Math.sin(i * 1.7 + 0.6)));
    ctx.fillStyle = color;
    rrPath(ctx, x, cy - h / 2, barW, h, barW / 2); ctx.fill();
    x += barW + gap;
  }
}

// ---- Poster — editorial gig poster, photo-forward -----------------------------
function drawPoster(ctx, show, { flags, photoImgs, qrImg, handle }) {
  const W = 1080, H = 1920;
  if (photoImgs[0]) drawCover(ctx, photoImgs[0], 0, 0, W, H, 0);
  else { const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#3A2233'); g.addColorStop(1, '#160C12'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  const ov = ctx.createLinearGradient(0, 0, 0, H);
  ov.addColorStop(0, 'rgba(20,12,7,0.82)'); ov.addColorStop(0.34, 'rgba(20,12,7,0.30)');
  ov.addColorStop(0.64, 'rgba(20,12,7,0.50)'); ov.addColorStop(1, 'rgba(20,12,7,0.94)');
  ctx.fillStyle = ov; ctx.fillRect(0, 0, W, H);

  const cx0 = 58, cx1 = W - 58, cw = cx1 - cx0;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff'; ctx.font = `800 42px ${OUTFIT}`; ctx.fillText('melo', cx0, 96);
  ctx.font = `700 19px ${OUTFIT}`; ctx.fillStyle = 'rgba(255,255,255,0.85)';
  fillSpaced(ctx, 'I WAS THERE', cx1 - spacedWidth(ctx, 'I WAS THERE', 19 * 0.22), 92, 19 * 0.22);

  let y = 150;
  const artist = (show.artist || '').toUpperCase();
  const ts = fitFont(ctx, artist, 800, (show.artist || '').length > 13 ? 90 : 124, OUTFIT, cw, 54);
  ctx.fillStyle = '#fff';
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 48; ctx.shadowOffsetY = 10;
  ctx.fillText(artist, cx0, y + ts * 0.74); ctx.restore();
  y += ts * 0.74 + 12;

  const setlist = show.setlist || [];
  if (flags.setlist && setlist.length) {
    y += 44;
    ctx.fillStyle = '#F4A261'; ctx.font = `700 20px ${OUTFIT}`;
    fillSpaced(ctx, 'THE SETLIST', cx0, y, 20 * 0.24); y += 28;
    setlist.slice(0, 6).forEach((t, i) => {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx0, y); ctx.lineTo(cx1, y); ctx.stroke();
      const mid = y + 38; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `800 30px ${OUTFIT}`;
      ctx.fillText(String(i + 1).padStart(2, '0'), cx0, mid);
      ctx.fillStyle = '#fff'; const tz = fitFont(ctx, t, 700, 46, OUTFIT, cw - 72, 28); ctx.font = `700 ${tz}px ${OUTFIT}`;
      ctx.fillText(t, cx0 + 72, mid);
      ctx.textBaseline = 'alphabetic'; y += 76;
    });
    if (setlist.length > 6) { ctx.fillStyle = 'rgba(255,255,255,0.62)'; ctx.font = `700 28px ${OUTFIT}`; ctx.fillText(`+ ${setlist.length - 6} more ›`, cx0, y + 40); }
  }

  const bottom = H - 58;
  let qrLeft = cx1;
  if (qrImg) {
    const qs = 150; qrLeft = cx1 - qs;
    ctx.fillStyle = '#fff'; rrPath(ctx, qrLeft - 10, bottom - 34 - qs - 10, qs + 20, qs + 20, 14); ctx.fill();
    ctx.drawImage(qrImg, qrLeft, bottom - 34 - qs, qs, qs);
    ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.font = `600 21px ${DM}`; ctx.textAlign = 'center';
    ctx.fillText('get melo', qrLeft + qs / 2, bottom); ctx.textAlign = 'left';
  }
  drawEqualizer(ctx, cx0 + 75, bottom - 22, 9, 9, 7, 46, '#F4A261');
  let ly = bottom - 62;
  const vibes = show.vibes || [];
  if (flags.vibes && vibes.length) {
    const chipH = 44; ly -= chipH;
    ctx.font = `700 21px ${OUTFIT}`; ctx.textBaseline = 'middle'; let vx = cx0;
    for (const v of vibes) {
      const c = vibeStyle(v).color || '#F4A261';
      const up = v.toUpperCase(), sp = 21 * 0.12;
      const cwd = spacedWidth(ctx, up, sp) + 32;
      if (vx + cwd > qrLeft - 24) break;
      ctx.fillStyle = c; rrPath(ctx, vx, ly, cwd, chipH, chipH / 2); ctx.fill();
      ctx.fillStyle = '#fff'; fillSpaced(ctx, up, vx + 16, ly + chipH / 2 + 1, sp);
      vx += cwd + 10;
    }
    ctx.textBaseline = 'alphabetic'; ly -= 18;
  }
  const cityDate = [flags.venue && show.city ? show.city : '', flags.date && show.date ? fmtDate(show.date) : ''].filter(Boolean).join('  ·  ').toUpperCase();
  if (cityDate) { ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.font = `600 24px ${DM}`; fillSpaced(ctx, cityDate, cx0, ly, 24 * 0.06); ly -= 38; }
  if (flags.venue && show.venue) { ctx.fillStyle = '#fff'; ctx.font = `700 34px ${OUTFIT}`; ctx.fillText(show.venue, cx0, ly); }
}

// ---- Vibe — mood words over an artist word-wash -------------------------------
function drawVibe(ctx, show, { flags, qrImg, handle }) {
  const W = 1080, H = 1920;
  const vibes = show.vibes || [];
  const accent = vibeStyle(vibes[0]).color || '#F4A261';
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#241430'); bg.addColorStop(1, '#0A0610');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const rad = ctx.createRadialGradient(W * 0.5, 0, 0, W * 0.5, 0, W);
  rad.addColorStop(0, accent + '2E'); rad.addColorStop(1, 'transparent');
  ctx.fillStyle = rad; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(-W * 0.12, H * 0.05); ctx.rotate(-8 * Math.PI / 180);
  ctx.font = `800 168px ${OUTFIT}`;
  const wline = ((show.artist || 'melo') + '   ·   ').repeat(4);
  for (let r = 0; r < 7; r++) { ctx.fillStyle = r % 2 ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.075)'; ctx.fillText(wline, r % 2 ? -50 : 0, 150 + r * 178); }
  ctx.restore();
  const sc = ctx.createLinearGradient(0, H, 0, H * 0.42);
  sc.addColorStop(0, 'rgba(10,6,16,0.9)'); sc.addColorStop(1, 'transparent');
  ctx.fillStyle = sc; ctx.fillRect(0, 0, W, H);

  const cx0 = 58, cx1 = W - 58, cw = cx1 - cx0;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff'; ctx.font = `800 44px ${OUTFIT}`; ctx.fillText('melo', cx0, 96);
  ctx.font = `700 19px ${OUTFIT}`; ctx.fillStyle = 'rgba(255,255,255,0.85)';
  fillSpaced(ctx, 'I WAS THERE', cx1 - spacedWidth(ctx, 'I WAS THERE', 19 * 0.22), 92, 19 * 0.22);

  let y = 470;
  const artist = show.artist || '';
  const ts = fitFont(ctx, artist, 800, artist.length > 13 ? 104 : 132, OUTFIT, cw, 56);
  ctx.fillStyle = '#fff';
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 8;
  ctx.fillText(artist, cx0, y); ctx.restore();
  if (flags.venue || flags.date) {
    y += 50; ctx.font = `600 33px ${DM}`; let vx = cx0;
    if (flags.venue && show.venue) { ctx.fillStyle = 'rgba(255,255,255,0.92)'; const s = show.venue + (show.city ? ` · ${show.city}` : ''); ctx.fillText(s, vx, y); vx += ctx.measureText(s).width; }
    if (flags.venue && flags.date && show.date) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillText('  ·  ', vx, y); vx += ctx.measureText('  ·  ').width; }
    if (flags.date && show.date) { ctx.fillStyle = '#F4A261'; ctx.fillText(fmtDate(show.date), vx, y); }
  }

  const setlist = show.setlist || [];
  if (flags.setlist && setlist.length) {
    y += 96;
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = `700 21px ${OUTFIT}`;
    fillSpaced(ctx, 'THE SETLIST', cx0, y, 21 * 0.2); y += 26;
    setlist.slice(0, 6).forEach((t, i) => {
      if (i) { ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx0, y); ctx.lineTo(cx1, y); ctx.stroke(); }
      const mid = y + 36; ctx.textBaseline = 'middle';
      ctx.fillStyle = accent; ctx.font = `800 26px ${OUTFIT}`; ctx.fillText(String(i + 1).padStart(2, '0'), cx0, mid);
      ctx.fillStyle = '#fff'; const tz = fitFont(ctx, t, 700, 42, OUTFIT, cw - 64, 26); ctx.font = `700 ${tz}px ${OUTFIT}`; ctx.fillText(t, cx0 + 64, mid);
      ctx.textBaseline = 'alphabetic'; y += 70;
    });
    if (setlist.length > 6) { ctx.fillStyle = 'rgba(255,255,255,0.62)'; ctx.font = `700 24px ${OUTFIT}`; ctx.fillText(`+ ${setlist.length - 6} more ›`, cx0, y + 34); }
  }

  const bottom = H - 56;
  const qs = 138;
  if (qrImg) ctx.drawImage(qrImg, cx1 - qs, bottom - qs, qs, qs);
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = `600 24px ${DM}`; ctx.textBaseline = 'middle';
  ctx.fillText('melo.show' + (handle ? ` · @${handle}` : ''), cx0, bottom - qs / 2); ctx.textBaseline = 'alphabetic';
  if (flags.vibes && vibes.length) {
    const wy = bottom - qs - 44;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx0, wy - 96); ctx.lineTo(cx1, wy - 96); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = `700 18px ${OUTFIT}`; fillSpaced(ctx, 'THE VIBE', cx0, wy - 64, 18 * 0.24);
    const vsz = fitFont(ctx, vibes.map((v) => v.toUpperCase()).join('  '), 800, 60, OUTFIT, cw - 90, 30);
    ctx.font = `800 ${vsz}px ${OUTFIT}`; let mx = cx0;
    for (const v of vibes) { ctx.fillStyle = vibeStyle(v).color || '#fff'; const up = v.toUpperCase(); ctx.fillText(up, mx, wy); mx += ctx.measureText(up).width + vsz * 0.4; }
    drawEqualizer(ctx, cx1 - 48, wy - vsz * 0.45, 6, 13, 9, 76, 'rgba(255,255,255,0.85)');
  }
}

// ---- Marquee — theatre billboard ----------------------------------------------
function drawMarquee(ctx, show, { flags, qrImg, handle }) {
  const W = 1080, H = 1920;
  const amber = '#F4A261';
  const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#2A1D13'); bg.addColorStop(1, '#140C07');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const rad = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, W * 0.7); rad.addColorStop(0, 'rgba(232,87,58,0.4)'); rad.addColorStop(1, 'transparent');
  ctx.fillStyle = rad; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = amber; ctx.lineWidth = 3; rrPath(ctx, 40, 40, W - 80, H - 80, 30); ctx.stroke();
  const bulb = (x, y) => { const g = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, 9); g.addColorStop(0, '#fff'); g.addColorStop(0.55, '#FFC75F'); g.addColorStop(1, '#E8573A'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill(); };
  const bl = 72, brr = W - 72, bt = 64, bb = H - 64, nH = 15, nV = 26;
  for (let i = 0; i < nH; i++) { const x = bl + (brr - bl) * i / (nH - 1); bulb(x, bt); bulb(x, bb); }
  for (let i = 0; i < nV; i++) { const yy = bt + 14 + (bb - bt - 28) * i / (nV - 1); bulb(56, yy); bulb(W - 56, yy); }

  const cxc = W / 2;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = amber; ctx.font = `700 22px ${OUTFIT}`; fillSpacedCentered(ctx, '★ NOW SHOWING ★', cxc, 210, 22 * 0.28);
  const artist = (show.artist || '').toUpperCase();
  const ts = fitFont(ctx, artist, 800, (show.artist || '').length > 13 ? 92 : 122, OUTFIT, W - 220, 54);
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
  ctx.save(); ctx.shadowColor = 'rgba(244,162,97,0.85)'; ctx.shadowBlur = 42; ctx.font = `800 ${ts}px ${OUTFIT}`; ctx.fillText(artist, cxc, 300 + ts * 0.5); ctx.restore();
  let y = 300 + ts * 0.5 + 50;
  if (flags.venue || flags.date) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = `600 30px ${DM}`;
    const parts = []; if (flags.venue && show.venue) parts.push(show.venue + (show.city ? ` · ${show.city}` : '')); if (flags.date && show.date) parts.push(fmtDate(show.date));
    ctx.fillText(parts.join('  ·  '), cxc, y); y += 30;
  }
  const setlist = show.setlist || [];
  if (flags.setlist && setlist.length) {
    y = Math.max(y + 70, 600);
    ctx.fillStyle = amber; ctx.font = `700 19px ${OUTFIT}`; fillSpacedCentered(ctx, '— THE BILL —', cxc, y, 19 * 0.24); y += 56;
    setlist.slice(0, 6).forEach((t) => { const tz = fitFont(ctx, t, 700, 38, OUTFIT, W - 240, 26); ctx.textAlign = 'center'; ctx.font = `700 ${tz}px ${OUTFIT}`; ctx.fillStyle = '#fff'; ctx.fillText(t, cxc, y); y += 54; });
    if (setlist.length > 6) { ctx.fillStyle = amber; ctx.font = `700 22px ${OUTFIT}`; ctx.fillText(`+ ${setlist.length - 6} more ›`, cxc, y + 4); }
  }
  if (flags.vibes && (show.vibes || []).length) {
    ctx.font = `800 26px ${OUTFIT}`;
    const txt = show.vibes.map((v) => v.toUpperCase()).join('  ·  ');
    const pillW = ctx.measureText(txt).width + 56, pillH = 52, px = cxc - pillW / 2, py = H - 256 - pillH;
    ctx.strokeStyle = amber; ctx.lineWidth = 2; rrPath(ctx, px, py, pillW, pillH, pillH / 2); ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; let tx2 = px + 28;
    show.vibes.forEach((v, i) => { ctx.fillStyle = vibeStyle(v).color || amber; const seg = v.toUpperCase() + (i < show.vibes.length - 1 ? '  ·  ' : ''); ctx.fillText(seg, tx2, py + pillH / 2 + 1); tx2 += ctx.measureText(seg).width; });
    ctx.textBaseline = 'alphabetic';
  }
  const fy = H - 188, qs = 116;
  if (qrImg) {
    ctx.font = `800 38px ${OUTFIT}`; const wmW = Math.max(ctx.measureText('melo').width, 240);
    const groupW = qs + 22 + wmW, gx = cxc - groupW / 2;
    ctx.drawImage(qrImg, gx, fy, qs, qs);
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.fillText('melo', gx + qs + 22, fy + 46);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = `600 21px ${DM}`; ctx.fillText('melo.show' + (handle ? ` · @${handle}` : ''), gx + qs + 22, fy + 82);
  }
}

// ---- Player — music-player UI -------------------------------------------------
function drawPlayer(ctx, show, { flags, photoImgs, qrImg, handle }) {
  const W = 1080, H = 1920;
  const vibes = show.vibes || [];
  const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#241A14'); bg.addColorStop(1, '#120C08');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const rad = ctx.createRadialGradient(W / 2, H * 0.3, 0, W / 2, H * 0.3, W); rad.addColorStop(0, 'rgba(232,87,58,0.18)'); rad.addColorStop(1, 'transparent');
  ctx.fillStyle = rad; ctx.fillRect(0, 0, W, H);
  const cx0 = 54, cx1 = W - 54, cw = cx1 - cx0;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = `700 19px ${OUTFIT}`; fillSpaced(ctx, 'NOW PLAYING', cx0, 92, 19 * 0.24);
  ctx.fillStyle = '#fff'; ctx.font = `800 38px ${OUTFIT}`; ctx.textAlign = 'right'; ctx.fillText('melo', cx1, 96); ctx.textAlign = 'left';

  const aTop = 130, aH = 600;
  if (photoImgs[0]) drawCover(ctx, photoImgs[0], cx0, aTop, cw, aH, 26);
  else { ctx.save(); rrPath(ctx, cx0, aTop, cw, aH, 26); ctx.fillStyle = '#3A2A1E'; ctx.fill(); ctx.restore(); drawEqualizer(ctx, W / 2, aTop + aH / 2, 7, 30, 22, 250, 'rgba(255,255,255,0.9)'); }
  let y = aTop + aH + 54;
  const artist = show.artist || '';
  const ts = fitFont(ctx, artist, 800, artist.length > 13 ? 74 : 94, OUTFIT, cw, 50);
  ctx.fillStyle = '#fff'; ctx.font = `800 ${ts}px ${OUTFIT}`; ctx.fillText(artist, cx0, y); y += 40;
  ctx.fillStyle = 'rgba(255,255,255,0.62)'; ctx.font = `500 28px ${DM}`;
  ctx.fillText([flags.venue && show.venue ? show.venue + (show.city ? ` · ${show.city}` : '') : '', flags.date && show.date ? fmtDate(show.date) : ''].filter(Boolean).join('  ·  '), cx0, y); y += 46;
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; rrPath(ctx, cx0, y, cw, 6, 3); ctx.fill();
  const pg = ctx.createLinearGradient(cx0, 0, cx0 + cw * 0.84, 0); pg.addColorStop(0, '#F4A261'); pg.addColorStop(1, '#E8573A');
  ctx.fillStyle = pg; rrPath(ctx, cx0, y, cw * 0.84, 6, 3); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx0 + cw * 0.84, y + 3, 8, 0, 7); ctx.fill(); y += 30;
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `400 19px ${DM}`; ctx.fillText('main set', cx0, y); ctx.textAlign = 'right'; ctx.fillText('encore', cx1, y); ctx.textAlign = 'left'; y += 44;
  const cxc = W / 2, pbR = 48;
  const tri = (x, back) => { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); if (back) { ctx.moveTo(x + 14, y - 16); ctx.lineTo(x + 14, y + 16); ctx.lineTo(x - 8, y); } else { ctx.moveTo(x - 14, y - 16); ctx.lineTo(x - 14, y + 16); ctx.lineTo(x + 8, y); } ctx.closePath(); ctx.fill(); ctx.fillRect(back ? x + 14 : x - 16, y - 16, 2, 32); };
  y += pbR;
  tri(cxc - pbR - 56, true); tri(cxc + pbR + 56, false);
  const pgr = ctx.createLinearGradient(cxc - pbR, y - pbR, cxc + pbR, y + pbR); pgr.addColorStop(0, '#F4A261'); pgr.addColorStop(1, '#E8573A');
  ctx.fillStyle = pgr; ctx.beginPath(); ctx.arc(cxc, y, pbR, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cxc - 13, y - 19); ctx.lineTo(cxc - 13, y + 19); ctx.lineTo(cxc + 21, y); ctx.closePath(); ctx.fill();
  y += pbR + 44;

  const setlist = show.setlist || [];
  if (flags.setlist && setlist.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `700 18px ${OUTFIT}`; fillSpaced(ctx, 'FROM THE SET', cx0, y, 18 * 0.2); y += 12;
    setlist.slice(0, 4).forEach((t) => {
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx0, y); ctx.lineTo(cx1, y); ctx.stroke();
      const mid = y + 32; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff'; const tz = fitFont(ctx, t, 700, 32, OUTFIT, cw - 50, 22); ctx.font = `700 ${tz}px ${OUTFIT}`; ctx.fillText(t, cx0, mid);
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = `400 22px ${DM}`; ctx.textAlign = 'right'; ctx.fillText('♪', cx1, mid); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; y += 64;
    });
    if (setlist.length > 4) { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = `700 22px ${OUTFIT}`; ctx.fillText(`+ ${setlist.length - 4} more in the app ›`, cx0, y + 28); }
  }

  const bottom = H - 56, qs = 124;
  if (qrImg) ctx.drawImage(qrImg, cx1 - qs, bottom - qs, qs, qs);
  const my = bottom - qs / 2;
  if (flags.vibes && vibes.length) {
    ctx.font = `700 22px ${DM}`; ctx.textBaseline = 'middle'; let vx = cx0; const chipH = 40;
    for (const v of vibes) {
      const c = vibeStyle(v).color || '#F4A261'; const cwd = ctx.measureText(v).width + 32;
      if (vx + cwd > cx1 - qs - 20) break;
      ctx.fillStyle = c + '22'; rrPath(ctx, vx, my - chipH / 2, cwd, chipH, chipH / 2); ctx.fill();
      ctx.strokeStyle = c; ctx.lineWidth = 1.5; rrPath(ctx, vx, my - chipH / 2, cwd, chipH, chipH / 2); ctx.stroke();
      ctx.fillStyle = c; ctx.fillText(v, vx + 16, my + 1); vx += cwd + 10;
    }
    ctx.textBaseline = 'alphabetic';
  } else { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = `600 22px ${DM}`; ctx.textBaseline = 'middle'; ctx.fillText('melo.show' + (handle ? ` · @${handle}` : ''), cx0, my); ctx.textBaseline = 'alphabetic'; }
}

// ---- dispatcher -------------------------------------------------------------
const DRAWERS = { ticket: drawTicket, poster: drawPoster, vibe: drawVibe, marquee: drawMarquee, player: drawPlayer };

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
