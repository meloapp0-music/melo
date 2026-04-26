// Melo Brand Logo Components

// The M icon mark — bolder, fuller crown design (refresh 2026-04-26).
// Three filled shapes on a dark tile: two outer pillars that taper
// inward toward the top + a tall center inverted-V/diamond. The M now
// fills nearly the full square and reads as a crown more than a letter.
export function MeloIcon({ size = 40, rounded = true, className = '' }) {
  const r = rounded ? size * 0.22 : 0;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`meloGrad-${size}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F4A261" />
          <stop offset="100%" stopColor="#E8573A" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" rx={r} fill="#1E1E1E" />
      {/* Left pillar — wide at the bottom, slopes up to a sharp point at the top.
          (14,18) is the upper outer point; bottom edge spans (14→40, 102);
          the diagonal cut from inner-bottom (40,102) up to outer-top (14,18)
          gives the leg its taper. */}
      <polygon points="14,18 14,102 40,102 40,55" fill={`url(#meloGrad-${size})`} />
      {/* Right pillar — mirror of the left. */}
      <polygon points="106,18 106,102 80,102 80,55" fill={`url(#meloGrad-${size})`} />
      {/* Center inverted-V — the crown's middle peak. Top point at (60,18),
          opens out to inner pillar tops at (40,55) and (80,55), then comes
          down to a sharp center point at (60,102). */}
      <polygon points="60,18 40,55 60,102 80,55" fill={`url(#meloGrad-${size})`} />
    </svg>
  );
}

// The wordmark "melo" in the brand font style
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

// Full logo lockup: icon + wordmark + optional tagline
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
            Find Your Next Show
          </span>
        )}
      </div>
    </div>
  );
}

export default MeloIcon;
