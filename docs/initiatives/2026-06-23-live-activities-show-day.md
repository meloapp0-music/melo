---
name: live-activities-show-day
description: An iOS Live Activity / Dynamic Island for Show Day — a live countdown to doors/showtime on the lock screen the day of a concert. Native ActivityKit; pairs with the home-screen widget as the "native sticky" theme. Planned for 1.4.
type: project
---

# Live Activities — Show Day

- Started: 2026-06-23
- Status: planned
- Last updated: 2026-06-23

## Context
Melo's "Show Day" experience (showtime, weather, directions, bag policy) is one of its
best differentiators vs Showgoer — "we're useful the night of; they're an archive you
visit later." A **Live Activity** puts a live countdown to doors/showtime on the lock
screen + Dynamic Island the day of a show: high-delight, keeps Melo glanceable exactly
when it matters most.

## Plan
- **Native**: ActivityKit (iOS 16.1+) — a Widget Extension with `ActivityAttributes`
  for the show (artist, venue, showtime). Start the activity the morning of a Going show;
  update/end around showtime.
- **Bridge**: a Capacitor plugin (custom, or a community live-activity plugin) to
  start/update/end the activity from JS when a Going show is "today". Reuse the existing
  Show Day day-of logic.
- **Pairs with** the home-screen widget (`2026-05-22-home-screen-widget.md`) — same
  native target + data-bridge plumbing, so build them together in the 1.4 native bundle.

## Changes made
- 2026-06-23: Initiative created (idea capture; deferred to 1.4).

## Open questions / follow-ups
- Native + device-only to test — no web-preview verification.
- Trigger design: push-started Live Activity (needs a server ping) vs a local start when
  the app sees a Going show is today.
