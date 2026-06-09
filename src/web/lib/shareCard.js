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

const W = 1080;
const H = 1920;

// QR target. Set up melo.show to redirect to the App Store so this one
// scan installs the app (and you can change the destination without
// reprinting/re-rendering anything). Per the marketing-operating-system
// "close the share-footer install loop" move.
const INSTALL_URL = 'https://melo.show';

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

// Word-wrap centered text; returns the y after the last line.
function wrapCentered(ctx, text, cx, y, maxW, lineH) {
  const words = String(text).split(/\s+/);
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, yy);
      line = word;
      yy += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, cx, yy);
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

  // --- Footer: QR install loop ---
  // Every share is one camera-scan from an install. Generate the QR
  // locally (data URL → no network, no canvas taint, toBlob still works).
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

  return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png', 0.95));
}

// Render + share. Uses the native share sheet (Web Share API with a
// file) on iOS; falls back to a download elsewhere.
export async function shareWrappedCard(data, year, mapData, handle) {
  const blob = await renderWrappedCard(data, year, mapData, handle);
  if (!blob) return false;
  const file = new File([blob], `melo-wrapped-${year}.png`, { type: 'image/png' });

  if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `My ${year} Melo Wrapped` });
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
