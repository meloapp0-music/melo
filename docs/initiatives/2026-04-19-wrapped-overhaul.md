# Wrapped Overhaul: Photo Backgrounds + Animated Reveals

- Started: 2026-04-19
- Status: shipped
- Last updated: 2026-04-19

## Context

User feedback on the existing "Year in Music Wrapped":

> "Right now it's just a colored background with emojis. Add pictures, make
> the background something cool, make the venue background a picture of the
> actual venue. I want this to be more engaging."

The old Wrapped was an 8-slide swipe stack where each slide was a flat
gradient color + an emoji + a stat. Functional but visually dull, especially
compared to Spotify Wrapped or Apple Replay which use full-bleed photo
backdrops and motion.

## Plan

Three coordinated upgrades:

1. **Photo backgrounds** — every slide uses the cached Deezer artist photo
   as a full-bleed background (we already cache these for the Home cards).
   A slow Ken-Burns zoom adds motion without requiring video.
2. **Tonal overlay** — gradient layer over each photo so white text stays
   readable and slides feel cohesive (each slide has a distinct color
   personality via `SLIDE_OVERLAYS[]`).
3. **Staggered reveals** — every text element fades up with its own
   `animationDelay` (0.05s → 1s cascade) so opening a slide feels alive.
   The personality slide swaps the single bg for a 6-tile photo collage.
   The top-venue slide adds an animated pin pulse.

Real venue photos: there is no free, license-clean API for "photo of this
specific venue" (Google Places needs paid keys + has caching restrictions).
Used an artist-from-that-venue photo as the backdrop instead — visually
strong and avoids the dependency. Logged as an open question.

## Changes made

- 2026-04-19: `src/web/pages/Wrapped.jsx` fully rewritten (~310 lines).
  - New `SLIDE_OVERLAYS` array of 8 gradient overlays (replaces the old
    `SLIDE_GRADIENTS` solid colors).
  - New `SlideBg` component renders the absolute-positioned `wrapped-bg-img`
    + `wrapped-bg-overlay` pair behind every slide.
  - `CountUp` rewritten to use `requestAnimationFrame` with ease-out cubic
    + `decimals` prop. Only renders when its slide is active so values
    don't re-roll on swipe.
  - Every text element wrapped in `wrapped-stagger` with inline
    `animationDelay` for the cascade.
  - Slide 7 (Personality) renders `wrapped-bg-collage` of 6
    `wrapped-collage-tile` divs, each with a different cached artist photo.
  - Slide 3 (Top Venue) gets the animated `wrapped-pin-mark` SVG.
  - `is-active` class flipped on the visible slide so animations only fire
    on view.
- 2026-04-19: `src/web/App.css` — appended the missing CSS foundation:
  - `.wrapped-bg-img` + `@keyframes wrappedKenBurns` (14s slow zoom).
  - `.wrapped-bg-overlay` (z-index 1, above photo).
  - `.wrapped-stagger` + `@keyframes wrappedFadeUp` (0.7s ease-out cubic).
  - Paused state for staggers on inactive slides so they fire on first view.
  - `.wrapped-bg-collage` 3x2 grid + `.wrapped-collage-tile`
    saturation/brightness tweaks.
  - `.wrapped-pin-mark` 56px frosted-glass circle + `wrappedPinPulse`.
  - Added `position: relative; z-index: 2` to `.wrapped-slide-content` so
    text sits above the bg layers.

## Open questions / follow-ups

- **Real venue photos**: needs a license-clean source. Google Places
  Photos is paid + has display caching restrictions. Options to explore:
  Wikimedia Commons (free but coverage spotty), Foursquare (free tier),
  user-supplied uploads (best UX, but requires Supabase storage work).
- **Share to story**: the visuals are now strong enough to share.
  Capacitor Share + html2canvas to export a slide as an image is a likely
  next initiative.
- **Reduced motion**: respect `prefers-reduced-motion` to disable Ken Burns
  and stagger animations for accessibility.
