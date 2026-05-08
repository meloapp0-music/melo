// Kinetic typography for vibes + personality archetypes.
//
// Each vibe / archetype gets a slug-based class (`kv-euphoric`,
// `kv-bass-devotee`, etc) that owns a gradient + animation tuned to
// the character of the word. Premium iOS-native, frosted-glass
// aesthetic — replaces the system emoji rendering that used to be in
// the Vibes + Personality slides of Wrapped.
//
// Per docs/initiatives/2026-05-07-v1-0-4-wrapped-juice.md.
//
// Sizes: 'hero' (96px, slide-dominating), 'large' (64px, primary
// vibe), 'medium' (40px, secondary vibes), 'small' (22px, list).
//
// Slug derivation: lowercase, spaces → hyphens. So "High Energy" →
// `kv-high-energy`. Any name not covered by the CSS still renders
// readably via the base `.kv` defaults — defensive against custom
// vibe additions later.

export default function KineticVibe({ name, size = 'large', delay = 0 }) {
  if (!name) return null;
  const slug = String(name).toLowerCase().trim().replace(/\s+/g, '-');
  return (
    <div
      className={`kv kv-${slug} kv-${size}`}
      style={delay ? { animationDelay: `${delay}s` } : undefined}
    >
      <span className="kv-text">{name}</span>
    </div>
  );
}
