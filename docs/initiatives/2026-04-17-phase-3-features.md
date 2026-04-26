# Phase 3 Features — Streak, Wrapped, Comparison, QuickLog, Discovery

- Started: 2026-04-17
- Status: shipped
- Last updated: 2026-04-17

## Context

Five feature concepts landed together: monthly **Streak** tracking,
year-end **Wrapped** story mode, head-to-head **Show Comparison**,
floating **Quick Log** entry, and genre-seeded **Discovery** event
suggestions. They share layout and animation patterns, so styling them
in one pass keeps the design language coherent.

## Plan

- Add ~700 lines of CSS for streak cards, wrapped overlay/slides/dots,
  compare overlay/cards/categories/winner, quicklog pill/sheet/scores,
  and the `detail-compare-btn` entry point on ShowDetail.
- Calculate streaks in `store.js` (`calculateStreak`) — current run,
  longest run, at-risk flag once past the 20th of a quiet month.
- Wrapped year resolves via `getWrappedYears(shows)` in `store.js` and
  is rendered by `pages/Wrapped.jsx`.
- Compare overlay opens from any ShowDetail; a second picker selects the
  opponent show; ELO-based category winners roll up to a final verdict.
- QuickLog is a floating bottom-sheet shortcut; later removed from the
  Home floating pill (redundant with the `+` nav button) after user
  feedback.

## Changes made

- 2026-04-17: Added streak/wrapped/compare/quicklog CSS blocks to
  `App.css` (~700 lines). Cleaned spacing — streak margin 20 → 16,
  wrapped-dots bottom 40 → 28, added 60px padding to
  `.wrapped-slide-content`.
- 2026-04-17: Added `calculateStreak`, `getWrappedYears`,
  `DISCOVERY_ARTISTS` helpers to `store.js`.
- 2026-04-17: Profile shows current + longest streak cards via
  `calculateStreak(shows)`.
- 2026-04-17: ShowDetail gained `.detail-compare-btn` that closes
  detail + opens ShowComparison via `setCompareShow(show)` from
  `useApp()`.
- 2026-04-17: Removed "Just saw a show?" floating pill from Home (per
  user request) — kept QuickLog accessible from the nav `+` button.

## Open questions / follow-ups

- Discovery currently seeds from a static `DISCOVERY_ARTISTS` map; long
  term it should pull from user's top-genre breakdown + Bandsintown.
- Wrapped is currently read-only — could add share-sheet export later.
