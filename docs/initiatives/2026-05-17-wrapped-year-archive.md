# Wrapped Year Archive

- Started: 2026-05-17
- Status: in-progress (v1.0.5)
- Last updated: 2026-05-17

## Context

Wrapped could only ever be opened for the user's **most recent** year.
The Home banner calls `setWrappedYear(latestWrappedYear)` and nothing
else ever sets the year — `getWrappedYears()` returned every year but
only `[0]` was used. Past years were computed and then thrown away.

This became obvious right after the 2026-05-17 "So Far" relabel:
distinguishing completed years ("Wrapped") from the in-progress year
("So Far") only matters if the user can actually *reach* past years.
They couldn't.

User request (2026-05-17):
> "change it now so there's a place to see all your past years
>  wrapped... it should be a big thing so people can go back to them."

A past-year Wrapped is a keepsake — the emotional core of the app.
Hiding it was a real gap.

## Plan

A bottom-nav tab was considered and rejected — the nav is a fixed
5-slot symmetric grid (see `2026-04-19-bottom-nav-restructure.md`); a
6th slot breaks it. The **Profile page** is the natural home for
retrospective/identity content.

### "Your Wrapped" section on Profile

- New section near the top of `Profile.jsx` (after stats + streak,
  before the nav buttons) titled "Your Wrapped".
- One tappable card per year from `getWrappedYears(shows)` — newest
  first. Each card: the year, the `wrappedLabel()` ("Wrapped" /
  "So Far"), and that year's attended-show count.
- Cards are a horizontal scroll row, each with its own gradient so the
  archive reads like a shelf of yearly keepsakes.
- Tap → `setWrappedYear(year)` → opens that year's full Wrapped.
- The Home banner stays as-is (quick access to the latest year) —
  the Profile archive is the complete browsable set.

No schema change — pure UI over existing data + the existing
`getWrappedYears` / `setWrappedYear` plumbing.

## Changes made

- 2026-05-17: Initiative created.
- 2026-05-17: Built for v1.0.5.
  - `Profile.jsx` — new "Your Wrapped" section (after stats/streak,
    before nav buttons): a horizontal scroll row of year cards from
    `getWrappedYears`, newest first. Each card shows the year, the
    `wrappedLabel`, and that year's show count; tap → `setWrappedYear`.
    Module-level `WRAPPED_CARD_GRADIENTS` cycles a gradient per card.
  - `App.css` — `.wrapped-archive` + `.wrapped-year-card` family.
  - Home banner left unchanged (latest-year quick access).
  - `npm run build` passes.

## Open questions / follow-ups

- **Empty-year edge case** — `getWrappedYears` only returns years that
  have attended shows, so there are never empty cards. Good.
- **Per-year cover art** — a future polish could pull the year's top
  artist image onto its card instead of a flat gradient.
- **Wrapped buddy/Wrapped-map slides** — unaffected; the archive just
  changes which `year` gets passed into the existing Wrapped.
