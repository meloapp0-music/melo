---
name: add-to-calendar
description: One-tap "Add to Calendar" for Going/Wishlist shows so users actually attend (and re-open Melo on the day). Built via a generated .ics + the native share sheet to sidestep the known iOS bug in the Capacitor calendar plugin. Planned for 1.4.
type: project
---

# Add to Calendar

- Started: 2026-06-23
- Status: planned
- Last updated: 2026-06-23

## Context
A logged "Going" show has a date + venue but lives only inside Melo. Letting users drop
it into their phone calendar in one tap increases the odds they actually go — and brings
them back to Melo on the day (ties into Show Day + [[going-social-loops]]). Cheap,
high-utility, low-risk.

## Plan
- The existing Capacitor calendar plugin (`@ebarooni/capacitor-calendar`) has an iOS bug
  (`requestReadOnlyCalendarAccess is not implemented`) — see the note in `Home.jsx`. So
  **don't** depend on it. Instead generate a standard **.ics** (VEVENT: title =
  `${artist} @ ${venue}`, start = show date, location = venue/city, optional alarm) and
  hand it to the OS via the share sheet / a `data:text/calendar` link — iOS opens it
  straight into Calendar.
- Add an "Add to Calendar" action on `ShowDetail` for Going/Wishlist shows (next to the
  Tickets button).

## Changes made
- 2026-06-23: Initiative created (idea capture; deferred to 1.4).

## Open questions / follow-ups
- Verify the .ics / share-sheet path works inside the Capacitor WebView on a device.
- Optional: a default reminder offset (e.g., day-of, or 2 hours before doors).
