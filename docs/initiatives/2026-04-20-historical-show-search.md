# Historical-Show Search (Setlist.fm City + Year Filters)

- Started: 2026-04-20
- Status: shipped
- Last updated: 2026-04-20

## Context

After shipping the Ticketmaster wishlist autocomplete, user asked:

> "if i wanted to enter a show that I saw years ago, does that work
> with what i have now? like if i saw goose at the salt shed in chicago
> a couple of years ago and i want to remember that setlist how can we
> do that"

Setlist.fm's `search/setlists` endpoint returns the 10 most recent
setlists for a given artist when filtered only by `artistName`. So
for a prolific touring artist (Goose plays 100+ shows/year), anything
older than a few months was unreachable through our in-app autocomplete
— the user would have to log the show manually and lose the
autofill-setlist magic that's core to Melo's value.

## Plan

Smallest possible change. Setlist.fm's API already supports
`cityName`, `venueName`, and `year` filters on the same endpoint —
just pass them through from the fields the user is already filling in.

Approach:
- `fetchSetlists(artist, apiKey, { city, year, venue })` — options bag
  on the existing function so old callers don't break.
- LogShow's autocomplete useEffect extracts year from the `date` field
  (if picked) and passes `city` (if typed), then re-fires when either
  changes. So the user's natural typing flow — artist, then city,
  then date — progressively narrows the result set.

No new UI. No new components. Just smarter plumbing.

## Changes made

- 2026-04-20: `src/web/api.js::fetchSetlists` — 3rd param is now an
  options bag accepting `city`, `year`, `venue`. Built via
  `URLSearchParams` so encoding is correct. Backward compatible
  (options default to `{}`).
- 2026-04-20: `src/web/pages/LogShow.jsx` — Attended-mode branch of
  the autocomplete useEffect now extracts year from `date` and passes
  `city` straight through. Added `city` and `date` to the useEffect
  dependency array so the Setlist.fm query re-runs as the user
  progressively fills in fields.
- 2026-04-20: `npm run build` passes clean (87 modules, 0 warnings).

## Open questions / follow-ups

- Setlist.fm still caps responses at page 1 (~20 setlists). For artists
  that have played a single city dozens of times, a second page fetch
  behind a "Load more" row would be a nice polish — deferred.
- Venue-field autofill from a matched show already works, but the
  Venue field itself doesn't currently refire the search. Could add
  `venue.trim() || undefined` to the options bag and include `venue`
  in the dep array — skipped for now because city+year is usually
  enough to pin a specific show.
- Consider a dedicated "log a past show" flow that starts with a full
  Setlist.fm browser (all shows for artist, paginated, groupable by
  year) if retroactive logging becomes a common use case.
