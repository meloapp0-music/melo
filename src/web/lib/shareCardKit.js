// Share-card kit — generative field + helpers shared by every card style.
// Reuses the app's vibe palette (store.vibeStyle) and the same name-hash that
// getArtistGradient uses, so cards stay on-brand. Ported from the design handoff.

import { vibeStyle } from '../store';

// Three HSL stops off the artist-name hash (same hash as getArtistGradient) —
// lets us build a richer mesh field than the 2-stop avatar gradient.
export function nameStops(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 35 + Math.abs((hash >> 8) % 20)) % 360;
  const s1 = 55 + Math.abs((hash >> 4) % 25);
  const l1 = 35 + Math.abs((hash >> 6) % 15);
  return [
    `hsl(${h1}, ${s1}%, ${l1}%)`,
    `hsl(${h2}, ${s1 + 10}%, ${l1 - 5}%)`,
    `hsl(${(h1 + 180) % 360}, ${s1}%, ${l1 + 8}%)`,
  ];
}

export function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00')
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
export function fmtDateShort(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// theme → { base } CSS background field. theme: 'ember' | 'artist' | 'vibe' | 'midnight'.
export function themeField(theme, show) {
  const vibes = show.vibes || [];
  const v1 = vibeStyle(vibes[0]).color || '#E8573A';
  const v2 = (vibes[1] ? vibeStyle(vibes[1]).color : v1) || '#F4A261';
  const stops = nameStops(show.artist || '');
  switch (theme) {
    case 'artist':
      return {
        base: `radial-gradient(120% 90% at 20% 0%, ${stops[2]} 0%, transparent 55%),
               radial-gradient(120% 90% at 85% 100%, ${stops[1]} 0%, transparent 55%),
               linear-gradient(160deg, ${stops[0]}, #2A1D13 130%)`,
        onDark: true,
      };
    case 'vibe':
      return {
        base: `radial-gradient(90% 70% at 15% 10%, ${v1} 0%, transparent 55%),
               radial-gradient(95% 75% at 90% 30%, ${v2} 0%, transparent 50%),
               radial-gradient(120% 90% at 60% 110%, #E8573A 0%, transparent 55%),
               linear-gradient(160deg, #241a2e 0%, #2A1D13 100%)`,
        onDark: true,
      };
    case 'midnight':
      return {
        base: `radial-gradient(120% 80% at 80% 8%, rgba(232,87,58,0.45) 0%, transparent 50%),
               radial-gradient(100% 70% at 10% 100%, rgba(244,162,97,0.25) 0%, transparent 55%),
               linear-gradient(165deg, #2A1D13 0%, #160F09 100%)`,
        onDark: true,
      };
    case 'ember':
    default:
      return {
        base: `radial-gradient(120% 80% at 80% 0%, #F4A261 0%, transparent 55%),
               radial-gradient(120% 90% at 10% 110%, #C9402A 0%, transparent 55%),
               linear-gradient(160deg, #E8573A 0%, #B23A22 120%)`,
        onDark: true,
      };
  }
}

// Build a self-contained @font-face stylesheet (woff2 inlined as data-URIs) for
// the share-card fonts, so html-to-image embeds the real Outfit/DM Sans into the
// exported PNG. We fetch Google Fonts ourselves (CORS-allowed) instead of letting
// html-to-image read document.styleSheets (cross-origin cssRules is blocked).
let _shareFontCss = null;
export async function getShareFontCss() {
  if (_shareFontCss != null) return _shareFontCss;
  const url = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;600;700&family=Outfit:wght@300;400;700;800&display=swap';
  try {
    const css = await (await fetch(url)).text();
    const urls = [...new Set([...css.matchAll(/url\((https:\/\/[^)]+\.woff2)\)/g)].map((m) => m[1]))];
    const inline = {};
    await Promise.all(urls.map(async (u) => {
      const buf = await (await fetch(u)).arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      inline[u] = `data:font/woff2;base64,${btoa(bin)}`;
    }));
    _shareFontCss = css.replace(/url\((https:\/\/[^)]+\.woff2)\)/g, (_, u) => `url(${inline[u] || u})`);
  } catch {
    _shareFontCss = ''; // fall back to system fonts rather than failing the export
  }
  return _shareFontCss;
}
