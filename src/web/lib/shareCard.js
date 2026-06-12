// shareCard.js — render a Wrapped summary to a shareable 1080×1920 PNG
// and hand it to the native share sheet.
//
// Why canvas (not html2canvas): zero new dependency, no web-font/CORS/
// gradient surprises in the Capacitor webview, identical output on web
// and device. We draw everything ourselves, so nothing can fail to
// render. The flagship viral asset has to look right every time.
//
// Per docs/initiatives/2026-05-22-wrapped-share-export.md (Quick Win #1).

import QRCode from 'qrcode';
import { getShowStatus, SHOW_STATUS } from '../store';

const W = 1080;
const H = 1920;

// QR target — the direct App Store listing, so a scan opens straight to
// install with zero redirect/domain setup. Per the marketing-operating-
// system "close the share-footer install loop" move.
const INSTALL_URL = 'https://apps.apple.com/us/app/melo-concert-tracker/id6763952800';

const ORANGE = '#E8573A';
const AMBER = '#F4A261';
const DARK = '#1A0E07';
const CREAM = '#FBEEE7';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Word-wrap centered text; returns the y of the last drawn line.
// maxLines clamps runaway input (multi-artist bills, long venue
// strings) with an ellipsis so flowing layouts can never overdraw the
// fixed footer QR.
function wrapCentered(ctx, text, cx, y, maxW, lineH, maxLines = Infinity) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = `${lines[maxLines - 1]}…`;
    while (ctx.measureText(last).width > maxW && last.length > 2) {
      last = `${last.slice(0, -2)}…`;
    }
    lines[maxLines - 1] = last;
  }

  let yy = y;
  lines.forEach((l, i) => {
    ctx.fillText(l, cx, yy);
    if (i < lines.length - 1) yy += lineH;
  });
  return yy;
}

// Build the PNG blob.
export async function renderWrappedCard(data, year, mapData, handle) {
  // Make sure brand fonts are loaded before drawing to canvas.
  try { if (document.fonts?.ready) await document.fonts.ready; } catch { /* noop */ }

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // --- Background: warm dark → orange gradient ---
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, DARK);
  bg.addColorStop(1, ORANGE);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  ctx.textAlign = 'center';

  // --- Wordmark ---
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 96px Outfit, system-ui, sans-serif';
  ctx.fillText('melo', cx, 210);

  ctx.fillStyle = AMBER;
  ctx.font = '700 30px Outfit, system-ui, sans-serif';
  ctx.fillText(`${year}  WRAPPED`, cx, 270);

  // --- 2×2 stat grid ---
  const stats = [
    { num: String(data.total ?? 0), label: 'SHOWS' },
    { num: String((data.cities || []).length), label: 'CITIES' },
    { num: (data.avgScore ?? 0).toFixed(1), label: 'AVG SCORE' },
    { num: String(data.totalSongs ?? 0), label: 'SONGS' },
  ];
  const cardW = 410;
  const cardH = 230;
  const gap = 40;
  const gridX = (W - (cardW * 2 + gap)) / 2;
  const gridY = 360;
  stats.forEach((s, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = gridX + col * (cardW + gap);
    const y = gridY + row * (cardH + gap);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    roundRect(ctx, x, y, cardW, cardH, 28);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 110px Outfit, system-ui, sans-serif';
    ctx.fillText(s.num, x + cardW / 2, y + 135);
    ctx.fillStyle = AMBER;
    ctx.font = '700 30px Outfit, system-ui, sans-serif';
    ctx.fillText(s.label, x + cardW / 2, y + 185);
  });

  let y = gridY + cardH * 2 + gap + 90;

  // --- Miles ---
  if (mapData && mapData.miles > 0) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 56px Outfit, system-ui, sans-serif';
    ctx.fillText(`${Math.round(mapData.miles).toLocaleString()} miles`, cx, y);
    ctx.fillStyle = CREAM;
    ctx.font = '500 32px DM Sans, system-ui, sans-serif';
    ctx.fillText('for live music', cx, y + 48);
    y += 150;
  }

  // --- Highlights ---
  const highlights = [];
  if (data.topArtist) highlights.push(['Top Artist', data.topArtist]);
  if (data.topVenue) highlights.push(['Top Venue', data.topVenue]);
  if (data.highestRated) highlights.push(['Best Show', `${data.highestRated.artist} (${data.highestRated.score})`]);

  ctx.font = '500 38px DM Sans, system-ui, sans-serif';
  for (const [label, value] of highlights) {
    ctx.fillStyle = AMBER;
    const labelText = `${label}:  `;
    const lw = ctx.measureText(labelText).width;
    ctx.font = '700 38px DM Sans, system-ui, sans-serif';
    const vw = ctx.measureText(value).width;
    const startX = cx - (lw + vw) / 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = AMBER;
    ctx.font = '500 38px DM Sans, system-ui, sans-serif';
    ctx.fillText(labelText, startX, y);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 38px DM Sans, system-ui, sans-serif';
    ctx.fillText(value, startX + lw, y);
    ctx.textAlign = 'center';
    y += 64;
  }

  // --- Personality sentence ---
  if (data.personality?.sentence) {
    y += 50;
    ctx.fillStyle = CREAM;
    ctx.font = 'italic 500 40px DM Sans, system-ui, sans-serif';
    y = wrapCentered(ctx, data.personality.sentence, cx, y, W - 180, 56) + 40;
  }

  await drawFooterQr(ctx, cx, handle);

  return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png', 0.95));
}

// --- Footer: QR install loop (shared by every share card) ---
// Every share is one camera-scan from an install. Generate the QR
// locally (data URL → no network, no canvas taint, toBlob still works).
async function drawFooterQr(ctx, cx, handle) {
  let qrImg = null;
  try {
    const qrUrl = await QRCode.toDataURL(INSTALL_URL, {
      margin: 1,
      width: 220,
      color: { dark: '#1A0E07', light: '#FFFFFF' },
    });
    qrImg = new Image();
    qrImg.src = qrUrl;
    if (qrImg.decode) await qrImg.decode();
  } catch {
    qrImg = null; // QR is best-effort; fall back to a text footer
  }

  if (qrImg) {
    const qrSize = 190;
    const qx = cx - qrSize / 2;
    const qy = H - 330;
    // White rounded plate behind the QR so it always scans on the dark bg.
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, qx - 16, qy - 16, qrSize + 32, qrSize + 32, 22);
    ctx.fill();
    ctx.drawImage(qrImg, qx, qy, qrSize, qrSize);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 34px Outfit, system-ui, sans-serif';
    ctx.fillText('Scan to get Melo — free on iOS', cx, qy + qrSize + 56);
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.font = '500 28px DM Sans, system-ui, sans-serif';
    ctx.fillText(handle ? `melo.show · @${handle}` : 'melo.show', cx, qy + qrSize + 98);
  } else {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 46px Outfit, system-ui, sans-serif';
    ctx.fillText('melo.show', cx, H - 150);
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.font = '500 32px DM Sans, system-ui, sans-serif';
    ctx.fillText(handle ? `@${handle} · Get Melo free on iOS` : 'Get Melo free on iOS', cx, H - 100);
  }
}

// --- Pre-show hype card ---
// "TOMORROW / MUMFORD & SONS" — the countdown share for Stories. Same
// canvas + footer-QR approach as Wrapped. Per the hype pop-up in
// docs/initiatives/2026-06-10-preshow-postshow-experience.md.
export async function renderHypeCard(show, daysLeft, handle) {
  try { if (document.fonts?.ready) await document.fonts.ready; } catch { /* noop */ }

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, DARK);
  bg.addColorStop(1, ORANGE);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  ctx.textAlign = 'center';

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 96px Outfit, system-ui, sans-serif';
  ctx.fillText('melo', cx, 230);

  // Countdown — the headline of the card.
  const countdown =
    daysLeft <= 0 ? 'TONIGHT' :
      daysLeft === 1 ? 'TOMORROW' :
        `IN ${daysLeft} DAYS`;
  ctx.fillStyle = AMBER;
  ctx.font = '800 120px Outfit, system-ui, sans-serif';
  ctx.fillText(countdown, cx, 560);

  // Artist — big, wrapped if long (clamped so the flow can never
  // reach the footer QR).
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 100px Outfit, system-ui, sans-serif';
  let y = wrapCentered(ctx, show.artist || '', cx, 740, W - 140, 112, 3) + 110;

  // Venue · city, then the date.
  const where = [show.venue, show.city].filter(Boolean).join(' · ');
  if (where) {
    ctx.fillStyle = CREAM;
    ctx.font = '500 44px DM Sans, system-ui, sans-serif';
    y = wrapCentered(ctx, where, cx, y, W - 180, 56, 2) + 78;
  }
  ctx.fillStyle = AMBER;
  ctx.font = '700 40px Outfit, system-ui, sans-serif';
  ctx.fillText(formatShareDate(show.date), cx, y);

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'italic 500 40px DM Sans, system-ui, sans-serif';
  ctx.fillText('See you there 🎶', cx, y + 92);

  await drawFooterQr(ctx, cx, handle);

  return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png', 0.95));
}

function formatShareDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// --- Single-show card ---
// "I WAS THERE / MUMFORD & SONS / 9.2" — send one show to anyone.
// Attended shows lead with the rating; upcoming ones read as an
// invitation ("I'M GOING"). Recipients scan the footer QR → App Store.
export async function renderShowCard(show, handle) {
  try { if (document.fonts?.ready) await document.fonts.ready; } catch { /* noop */ }

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, DARK);
  bg.addColorStop(1, ORANGE);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  ctx.textAlign = 'center';

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 96px Outfit, system-ui, sans-serif';
  ctx.fillText('melo', cx, 230);

  const status = getShowStatus(show);
  const attended = status === SHOW_STATUS.ATTENDED;
  const statusLabel = attended
    ? 'I  W A S  T H E R E'
    : status === SHOW_STATUS.GOING ? "I ' M  G O I N G" : 'O N  M Y  L I S T';
  ctx.fillStyle = AMBER;
  ctx.font = '700 38px Outfit, system-ui, sans-serif';
  ctx.fillText(statusLabel, cx, 380);

  // Artist — the headline (clamped clear of the footer QR).
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 104px Outfit, system-ui, sans-serif';
  let y = wrapCentered(ctx, show.artist || '', cx, 560, W - 140, 116, 3) + 104;

  const where = [show.venue, show.city].filter(Boolean).join(' · ');
  if (where) {
    ctx.fillStyle = CREAM;
    ctx.font = '500 44px DM Sans, system-ui, sans-serif';
    y = wrapCentered(ctx, where, cx, y, W - 180, 56, 2) + 74;
  }
  ctx.fillStyle = AMBER;
  ctx.font = '700 40px Outfit, system-ui, sans-serif';
  ctx.fillText(formatShareDate(show.date), cx, y);
  y += 130;

  // Rating — attended-and-scored shows wear the number big. The y
  // guard is belt-and-suspenders: with the clamps above the flow can't
  // reach the QR plate (top edge H-346), but never draw over it.
  if (attended && show.score > 0 && y + 180 < H - 360) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 170px Outfit, system-ui, sans-serif';
    const scoreText = Number.isInteger(show.score) ? String(show.score) : show.score.toFixed(1);
    ctx.fillText(scoreText, cx, y + 110);
    ctx.fillStyle = AMBER;
    ctx.font = '700 32px Outfit, system-ui, sans-serif';
    ctx.fillText('MY RATING', cx, y + 168);
  } else if (!attended) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'italic 500 40px DM Sans, system-ui, sans-serif';
    ctx.fillText('Come with me 🎶', cx, y + 40);
  }

  await drawFooterQr(ctx, cx, handle);

  return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png', 0.95));
}

export async function shareShowCard(show, handle) {
  const blob = await renderShowCard(show, handle);
  const slug = (show.artist || 'show').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return shareBlob(blob, `melo-${slug || 'show'}.png`, `${show.artist} on Melo`);
}

// --- Share plumbing (shared) ---
// Native share sheet (Web Share API with a file) on iOS; download
// fallback elsewhere.
async function shareBlob(blob, filename, title) {
  if (!blob) return false;
  const file = new File([blob], filename, { type: 'image/png' });

  if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return true;
    } catch (err) {
      if (err && err.name === 'AbortError') return false; // user dismissed
      // fall through to download
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export async function shareWrappedCard(data, year, mapData, handle) {
  const blob = await renderWrappedCard(data, year, mapData, handle);
  return shareBlob(blob, `melo-wrapped-${year}.png`, `My ${year} Melo Wrapped`);
}

export async function shareHypeCard(show, daysLeft, handle) {
  const blob = await renderHypeCard(show, daysLeft, handle);
  const slug = (show.artist || 'show').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return shareBlob(blob, `melo-${slug || 'show'}.png`, `${show.artist} — see you there!`);
}
