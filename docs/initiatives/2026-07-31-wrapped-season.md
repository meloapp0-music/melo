# Wrapped as a dated event, not a page

- Started: 2026-07-31
- Status: built (dev) — season push not yet written
- Last updated: 2026-07-31

## Context

From the comp analysis: Spotify Wrapped's reach doesn't come from the slides,
it comes from **everyone posting inside the same 48 hours**. It's a scheduled
cultural moment. I flagged this at the time as *"lesson two, which you're
currently missing"* — and it stayed missing.

Melo's per-show recap is better for frequency but gets none of that
synchronised effect, and a year-in-review you can open in March isn't an event.
It's a stats page.

## Plan

Lock the CURRENT year until the season opens on **Dec 1**. Past years stay
available forever — they've had their moment. The lock IS the feature:
anticipation is what makes the unlock worth posting about.

## Changes made

- 2026-07-31:
  - **`lib/wrappedSeason.js`** — `isUnlocked` / `daysUntilUnlock` /
    `isUnlockDay` / `seasonLabel`. String-based local dates, same reasoning as
    `lib/anniversary.js`: `toISOString()` is UTC and would open the season a day
    early west of Greenwich.
  - **Dec 1, not early December.** Melo's year is effectively over by then (few
    shows in late December) and being first to the feed is worth more than being
    accurate about the last week.
  - **`You.jsx`** — the current year's card is now disabled with a frosted
    overlay and a countdown ("🔒 Opens in 123 days"). Deliberately still
    legible: the year and the real show count show through, so a locked card is
    worth looking at rather than being a greyed-out button.
  - **`components/WrappedReady.jsx`** — the announcement, top of Home for the
    **first two weeks** of the season only. A permanent banner is furniture;
    the urgency is the mechanic. Suppressed under 2 shows — a Wrapped with
    nothing in it is a worse moment than no moment. Dismissed once opened.
  - Verified: 24 assertions on the boundary (Nov 30 locked → Dec 1 open → Dec 2
    still open), past/future years, the countdown across a month gap, and that
    `isUnlockDay` is exactly one day rather than a window. Rendered both card
    states — locked 2026 beside open 2025 — and the Dec 1 announcement.

## Open questions / follow-ups

- **The season push isn't written.** The card only reaches people who already
  opened the app, which is not who a synchronised moment is for. It should
  mirror `anniversary` / `recap-ready`: a cron that fires only when
  `isUnlockDay()`, i.e. once a year.
- **Locking is a removal** for anyone used to opening the current year whenever.
  Defensible — that's the whole mechanic — but it's the change most likely to
  generate a "where did it go" question.
- Consider whether the unlock should also generate a shareable card
  automatically, rather than requiring the user to walk the reel to the end.
