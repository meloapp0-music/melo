# v1.0.4 — Juice the Wrapped

- Started: 2026-05-07
- Status: in-progress (built while v1.0.3 is in review)
- Last updated: 2026-05-07

## Context

Wrapped's layout is good. Two specific spots feel flat:
1. The **Vibes slide** — a row of system emojis (🌟 🕯️ ⚡) at 40px, no
   motion, no glow. Looks like an admin form, not a Spotify-Wrapped-
   tier moment.
2. The **Personality slide** — a single generic 🎭 emoji regardless
   of which archetype the user got. "Indie Night Owl" and "Hip-Hop
   Connoisseur" both render the same theater masks.

User flagged these as "boring" on 2026-05-07 and asked "is there any
way to make it more of a fun page to look at that doesn't use emojis?"

System emojis are the wrong choice for Melo's brand anyway — per
`CLAUDE.md`, the design language is "premium iOS-native, frosted
glass + gradient accents." Emojis are the opposite of premium —
they're system-rendered, render differently across iOS/Android/web,
and undermine an otherwise beautifully designed flow.

This initiative replaces emojis with **kinetic typography + abstract
motion**, and bundles the previously-planned Wrapped Map Slides
section (`2026-05-05-wrapped-map-slides.md`) into the same release.

## Plan

### A. Kill the emojis. Each vibe + archetype becomes a kinetic typography moment

The vibe NAME (or archetype name) IS the visual. Big, bold, expressive
type. Each vibe gets its own:
- **Gradient signature** — text fill via `background-clip: text`
- **Motion language** — unique CSS animation matched to character
- **Optional decoration** — pseudo-element halos, scan lines, particles

This is what Spotify Wrapped + Apple Music do: typography is the
visual treatment, not a separate icon system. Bonus: kinetic type is
TikTok's native visual language — perfect for the Reels marketing
that's currently underway.

**Vibe motion library** (see `App.css` keyframes once shipped):

| Vibe | Gradient | Motion |
|---|---|---|
| Euphoric | gold→white→gold | radiating pulse-glow, soft scale-pulse |
| High Energy | electric red-orange | quick strobe, slight shake |
| Chill | ice blue→frost white | slow drift downward, frost shimmer |
| Emotional | deep blue→violet | fade-in with rain streak overlay |
| Intimate | warm amber | small type, candle-flicker glow |
| Nostalgic | sepia | VHS-style scan-line + horizontal jitter |
| Groovy | magenta | rhythmic bounce, mirror-ball shimmer |
| Rowdy | fire-red→orange | aggressive shake, chromatic aberration |
| Dreamy | cloud white→pastel | slow blur in/out cycle, soft drift |
| Transcendent | opal multi-hue | light rays from behind type |
| Mind-Blowing | electric magenta | type expands then contracts (bursts) |
| Spiritual | celestial blue→gold | slow halo rotation behind type |
| Legendary | royal gold→deep red | crown shimmer, slow weight-shift |
| Raw | matte charcoal→red | grit-distort overlay, glitch frames |
| Chaotic | rainbow scramble | rotation + offset jitter |

**Personality archetype motion** (per `generatePersonality()` in
`Wrapped.jsx`): same approach. The archetype name in tall display
type with archetype-specific motion + halo color:

| Archetype | Halo | Motion |
|---|---|---|
| Indie Night Owl | midnight purple | slow fade-in, dual eye-glow pulse |
| Bass Devotee | electric blue | low-freq thump pulse, reverb echo |
| Alt-Rock Pilgrim | orange | subtle sway, distortion shimmer |
| Hip-Hop Connoisseur | gold | sharp scale-in, mic-drop bounce |
| Soul Searcher | deep red | warm radial bloom |
| Pop Visionary | magenta | rhythmic pulse, mirror-ball glints |
| Rock Purist | red | strong scale-stamp, stadium glow |
| Jazz Wanderer | smoky teal | slow drift with smoke-blur |
| Folk Poet | warm cream | gentle handwriting-reveal cadence |
| Metal Warrior | blood red | aggressive scale-stamp, fire halo |
| Country Storyteller | amber | sunset gradient bloom |
| Classical Soul | ivory | precise scale-in, soft halo |
| Punk Spirit | lime | rough scale-in with chromatic offset |
| (default) Music Explorer | melo-orange | warm scale-in, gradient sweep |

### B. Map chapter — net-new slide section

Per `2026-05-05-wrapped-map-slides.md`. 5 new slides inserted after
the Cities slide, before the Vibes slide:

1. **"You traveled for music"** intro
2. **Venue depth** — "X venues · Y new this year · Z return visits"
3. **Geographic spread** — "A cities · B states · C countries"
4. **Animated map** — Leaflet, pins drop chronologically, lines
   connect them, miles counter ticks up to total. Reuses ConcertMap
   stack. Cap animated cities at ~20 for perf; rest render static.
5. **Most-visited venue** — "Red Rocks · 4 shows" with photo

Geo resolution: extends existing `CITY_COORDS` (currently 30 cities)
with on-demand Nominatim geocoding cached in a new `city_geocode`
Supabase table. Pre-resolves on first Wrapped open of the year so
the slide doesn't flicker.

### C. Polish (cheap wins)

- Confetti burst when the year-recap reveals on slide 0 (CSS-only
  particles, ~10 min)
- Subtle shimmer sweep across the score on the Highest-Rated slide

## Phasing within v1.0.4

Build in this order so the highest-leverage piece lands first:

1. Kinetic typography component + Vibes slide refactor
2. Personality slide refactor
3. Map chapter (5 new slides + geocoding fallback)
4. Polish (confetti, shimmer)

Each phase ships to `main` independently so progress is visible.

## Changes made

_Pending — work starting 2026-05-07._

## Open questions / follow-ups

- **Vibe motion performance on older iPhones.** CSS animations are
  cheap but 5+ simultaneous motion keyframes on screen + a fullscreen
  Ken-Burns photo background = potential frame drop. Test on iPhone
  11 minimum before shipping. Fall back to "static gradient + scale-
  in only" if perf is bad.
- **Personality archetype coverage.** `generatePersonality()` returns
  combinations like "Indie Night Owl who lives for small rooms" —
  the typography moment renders the archetype prefix only ("Indie
  Night Owl"); the suffix renders below as a smaller subtitle. Worth
  experimenting with whether the suffix gets its own kinetic
  treatment too (probably overkill for v1.0.4).
- **Sharing kinetic moments.** A still PNG of a kinetic moment loses
  the motion (and therefore most of the magic). For v1.0.4, sharing
  works by recording the screen — out of scope to build a
  motion-preserving share. Future v1.2+ idea: render a 3-second video
  clip of each slide's animation via Edge Function for share-out.
- **Cross-link with `2026-05-05-wrapped-map-slides.md`** — that
  initiative is the source of truth for the map chapter; this file
  consolidates it under the v1.0.4 release banner.
