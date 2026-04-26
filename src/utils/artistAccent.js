import theme from '../theme';

function hashString(s) {
  let h = 0;
  const str = String(s ?? '');
  for (let i = 0; i < str.length; i += 1) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function artistAccentColor(artistName) {
  const colors = theme.musicDna.segmentColors;
  if (!colors.length) {
    return theme.primary;
  }
  const idx = hashString(String(artistName ?? '').trim()) % colors.length;
  return colors[idx];
}

export function artistInitial(name) {
  const t = String(name ?? '').trim();
  if (!t) {
    return '?';
  }
  return t[0].toUpperCase();
}
