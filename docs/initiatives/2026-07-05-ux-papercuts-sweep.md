---
name: ux-papercuts-sweep
description: A "walk the app like a picky user" audit for small UX gaps — dead-end taps, missing empty/loading states, no-feedback actions — and the fixes for all 20 confirmed findings.
type: project
---

# UX Papercuts Sweep

- Started: 2026-07-05
- Status: shipped
- Last updated: 2026-07-05

## Context
User asked, post-1.4: "what else would you want? the little things" — not new
features, but the small rough edges a real user hits (a tap that goes nowhere,
a filter that lies, a save button with no feedback). Ran a 6-agent audit (5
surface-scoped auditors + 1 skeptical ranker) that read the actual code and
confirmed 20 real gaps across Home, My Shows, Show Detail, Log Show, Buddies,
Concert Map, and Festivals. User asked to fix all 20 — "I want it to be
perfect and it shouldn't have these little issues if we don't need to have
them."

## Plan
Dispatched 7 parallel agents, one per file (LogShow.jsx, Home.jsx, MyShows.jsx,
Buddies.jsx, ShowDetail.jsx + PhotoGallery.jsx, ConcertMap.jsx, Festivals.jsx),
each briefed with the exact fix, the shared patterns to mirror (the `showToast`
helper, FriendsFeed's `goToo` toast+disable template, the app's autocomplete
dropdown convention), and instructions to verify by reading the code first.
NavBar.jsx's fix was small enough to do directly. After all agents landed,
ran a full build + spot-checked the riskiest changes (the double-submit guard,
the delete-confirm sheet, PhotoGallery's new prop, Concert Map's async marker
effect) by reading the actual diffs, not just trusting "build passed."

## Changes made
- 2026-07-05: All 20 confirmed papercuts fixed in one pass:
  1. **Log Show — empty-artist submit** now toasts + shows a red border instead of silently doing nothing.
  2. **Home — "+ Wishlist"** now toasts and flips to a disabled "✓ Wishlisted" (mirrors FriendsFeed's `goToo`); keyed on `artist|date|venue` since Ticketmaster events have no stable id.
  3. **My Shows — genre filter** now resets when you switch Attended/Going/Wishlist tabs (was silently persisting).
  4. **Log Show — submit button** now disables + shows "Saving…" while the write is in flight (was a double-tap-creates-duplicate risk); same guard added to the inline "find this festival's lineup" button.
  5. **Buddies — Requests tab** now shows "Loading requests…" instead of a false "No requests" flash before data arrives.
  6. **My Shows — search field** now has a clear (✕) button.
  7. **Buddies — request cards** are now tappable (opens the requester's profile), Accept/Decline stay as separate controls.
  8. **Home's Cities stat → Concert Map** (and Profile's Songs stat) now keep a nav tab highlighted — `NavBar.jsx`'s `TAB_ALIAS` maps `map`→home, `songs`→profile (both are `tab` values with no dedicated nav slot).
  9. **Home — Avg Score** shows "—" instead of a literal "0" when nothing's rated yet.
  10. **Log Show — Score** can now be tapped again to clear it (was one-way, matching the Genre chip's existing toggle behavior).
  11. **Show Detail — Delete** now opens an in-app confirm sheet (`.detail-confirm-*` classes) instead of a raw browser `confirm()` popup.
  12. **Home — "Songs" stat** is now tappable (→ Songs page), matching Shows/Artists/Cities; Avg Score/Streak intentionally stay as plain non-interactive stats.
  13. **Concert Map** now resolves EVERY logged city via `lib/geo.js`'s `resolveCities` (with a live Nominatim fallback), replacing a stale ~34-city hardcoded list — the pin count now matches the "N cities explored" header.
  14. **Show Detail — festival badge** restyled as a plain, non-interactive pill (new `.detail-festival-badge` class) instead of looking identical to the tappable venue link.
  15. **My Shows — "All" chip** added to clear the genre filter without re-tapping the exact same chip.
  16. **Log Show — City autocomplete** now shows a "We'll use "{city}"" hint instead of silently vanishing for a city not in the hardcoded list.
  17. **Log Show — Venue autocomplete** now falls back to a flattened all-venues list (deduped, ~95 entries) when the typed city has no exact match, instead of going inert.
  18. **Festivals — "Anywhere" empty state** now distinguishes a real fetch failure (error copy) from a successful-but-empty result (neutral "No festivals to show right now.").
  19. **Show Detail — Photos** can now be removed inline (owner-only ✕ on each tile via a new optional `PhotoGallery` `onRemove` prop, backward-compatible).
  20. **Show Detail — Show Day chips** (weather/showtime) now show a loading skeleton instead of popping in abruptly.
- Verified: full `npm run build` (zero errors), reload in the signed-out preview (zero console/server errors), and a manual read-through of the riskiest diffs (submit guard's `finally`, the confirm-delete sheet's click-outside-to-cancel, `PhotoGallery`'s backward-compatible prop, Concert Map's effect-splitting for async markers, and confirmed the Show Day loading state is correctly wired end-to-end). Synced into the iOS project (`npx cap sync ios`).

## Open questions / follow-ups
- Not click-tested on a signed-in device (the preview server is behind login) — worth a quick pass through Log Show, My Shows filters, Buddies Requests, and a festival card on a real device/TestFlight build.
- Festivals "Anywhere" empty state deliberately has no Retry button (the fetch effect's dependency array wouldn't re-trigger on an identical mode/city without a small "attempt counter" addition) — small follow-up if it comes up.
