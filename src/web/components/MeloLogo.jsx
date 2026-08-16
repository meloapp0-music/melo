// Melo Brand Logo Components
// Equalizer-bar mark from the official Looka brand pack (assets/brand/looka).
// 7 rounded pill bars in red→orange gradient on a cream tile.

export function MeloIcon({ size = 40, rounded = true, className = '' }) {
  const r = rounded ? size * 0.22 : 0;
  const gid = `meloGrad-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#F93827" />
          <stop offset="100%" stopColor="#fbb040" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" rx={r} fill="#FDFCF6" />
      <g transform="translate(26 33) scale(1.043)" fill={`url(#${gid})`}>
        <rect x="0"     y="0"     width="5.27" height="54.195" rx="2.635" />
        <rect x="10"    y="11.63" width="5.27" height="42.565" rx="2.635" />
        <rect x="20"    y="26.44" width="5.27" height="27.755" rx="2.635" />
        <rect x="30"    y="36.53" width="5.27" height="17.665" rx="2.635" />
        <rect x="39.94" y="26.44" width="5.27" height="27.755" rx="2.635" />
        <rect x="49.92" y="11.63" width="5.27" height="42.565" rx="2.635" />
        <rect x="59.91" y="0"     width="5.27" height="54.195" rx="2.635" />
      </g>
    </svg>
  );
}

// The wordmark spec, for the two renderers that CANNOT read CSS variables:
// the share-card canvas (lib/shareCard.js draws with ctx.font) and the
// canvas-bound share-card parts. DOM callers should use the --wordmark-*
// tokens in App.css instead; these values must stay in step with them.
export const WORDMARK = {
  family: "'Outfit', sans-serif",
  canvasFamily: 'Outfit, system-ui, sans-serif',
  weight: 300,
  tracking: '0.06em',
};

// The canonical wordmark. Face, weight and tracking come from the --wordmark-*
// tokens in App.css so the brand is defined in exactly one place — it used to
// live in five, and three of them had already drifted to a different weight.
export function MeloWordmark({ size = 28, color = 'currentColor', style = {} }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-wordmark)',
        fontWeight: 'var(--wordmark-weight)',
        fontSize: size,
        letterSpacing: 'var(--wordmark-tracking)',
        color,
        lineHeight: 1,
        ...style,
      }}
    >
      melo
    </span>
  );
}

export function MeloLockup({ iconSize = 44, wordmarkSize = 32, tagline = false, dark = false, className = '' }) {
  const textColor = dark ? '#fff' : '#1E1E1E';
  const tagColor = dark ? 'rgba(255,255,255,0.5)' : '#9B8A7E';
  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: iconSize * 0.35 }}>
      <MeloIcon size={iconSize} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <MeloWordmark size={wordmarkSize} color={textColor} />
        {tagline && (
          <span
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 500,
              fontSize: wordmarkSize * 0.38,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: tagColor,
              lineHeight: 1,
            }}
          >
            Where concerts live forever
          </span>
        )}
      </div>
    </div>
  );
}

export default MeloIcon;
