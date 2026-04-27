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
          <stop offset="0%" stopColor="#ef4136" />
          <stop offset="100%" stopColor="#fbb040" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" rx={r} fill="#f8f7f3" />
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

export function MeloWordmark({ size = 28, color = 'currentColor' }) {
  return (
    <span
      style={{
        fontFamily: "'Outfit', sans-serif",
        fontWeight: 300,
        fontSize: size,
        letterSpacing: '0.06em',
        color,
        lineHeight: 1,
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
