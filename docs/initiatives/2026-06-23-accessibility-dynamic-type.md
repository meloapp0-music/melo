---
name: accessibility-dynamic-type
description: Make Melo usable by more people — support iOS Dynamic Type (text that respects the system size), VoiceOver labels on icon-only controls, and contrast/touch-target passes. The UI currently uses fixed px font sizes that ignore the user's text-size setting. Planned for 1.4.
type: project
---

# Accessibility — Dynamic Type + VoiceOver

- Started: 2026-06-23
- Status: planned
- Last updated: 2026-06-23

## Context
`App.css` uses fixed `px` font sizes throughout, so the UI ignores iOS Dynamic Type —
older fans and low-vision users can't scale the text. Several icon-only buttons also
lack labels for VoiceOver. A quieter, quality-bar improvement that widens who can
comfortably use Melo (and is a good App Store citizenship signal).

## Plan
- **Dynamic Type**: move the type scale to `rem`/`clamp()` anchored to a root that can
  follow the system body metric (or expose a few in-app text-size steps). Audit fixed
  `font-size:` declarations, headings/body first.
- **VoiceOver**: ensure every icon-only control has an `aria-label` (NavBar mostly does;
  audit share/close/nav-plus/swatches/score chips).
- **Contrast + touch targets**: verify `--brown-muted` on cream meets WCAG AA; ensure a
  44×44pt minimum tap target on all controls.
- **Motion**: entrance/pulse animations already honor `prefers-reduced-motion` — hold
  that bar for any new motion.

## Changes made
- 2026-06-23: Initiative created (idea capture; deferred to 1.4).

## Open questions / follow-ups
- Dynamic Type touches the whole type scale — scope a phased pass rather than a big-bang
  rewrite.
