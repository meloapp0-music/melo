# Bottom Nav Restructure

- Started: 2026-04-19
- Status: shipped
- Last updated: 2026-04-19

## Context

The previous bottom nav was a 6-tab flex strip (Home · Shows · + · Map · Songs · Profile)
with the `+` button squeezed into the same row as the tabs. Two problems:

1. **Buddies was buried** as a sub-page reachable only from the Profile / Home —
   inconsistent with the social direction of the product (friend system arriving
   in Phase 2 of the backend initiative).
2. **The + button** had no visual prominence; it lived inline with everything
   else and didn't read as the primary action.

User asked for "the + button in the middle" and "easier Buddies access."

## Plan

5-slot symmetric grid: **Home · Shows · + · Buddies · Profile**.
- Center slot is a raised circular button with a 4px border in the nav bg
  color so it appears to "punch out" of the bar.
- Map and Songs are still reachable — they're surfaced as top-level cards on
  Home.
- Sub-page highlighting is preserved via `activeKey = subPage || tab`.

## Changes made

- 2026-04-19: `src/web/components/NavBar.jsx` rewritten to render a 5-item
  `tabs` array; new `.nav-plus-slot` wrapper around `.nav-plus` so the
  raised button sits inside the grid track.
- 2026-04-19: `src/web/App.jsx` — added `'buddies'` to the top-level tab
  list inside `navigate()` and added `case 'buddies': return <Buddies />;`
  to `renderPage()`. Buddies is now a tab, not a sub-page.
- 2026-04-19: `src/web/App.css` — `.nav-tabs` switched from
  `display: flex; justify-content: space-around` to
  `display: grid; grid-template-columns: repeat(5, 1fr)`. `.nav-tab` now
  fills `width: 100%` of its grid track for symmetric tap targets.
  `.nav-plus` sized to 56px with a 4px border in the nav background color
  and a rotation-on-active state.

## Open questions / follow-ups

- Should the + button trigger `QuickLog` directly instead of the full
  `LogShow` modal? Current behavior preserved but worth testing.
- Add haptic feedback (Capacitor Haptics plugin) when tapping the + on iOS.
