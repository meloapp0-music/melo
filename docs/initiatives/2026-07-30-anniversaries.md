# Anniversaries — "one year ago tonight"

- Started: 2026-07-30
- Status: built (dev) — Edge Function NOT yet deployed or scheduled
- Last updated: 2026-07-31

## Context

The structural problem with a concert app is **sparseness**. The median user
goes to a handful of shows a year, so there is no reason to open Melo on the
other ~360 days. Every retention idea in the strategy pass — "tonight in your
city", the recap arrival, camera-roll backfill — is really an attempt to
manufacture density against that.

Anniversaries are the cheapest answer: resurface the library the user already
built, on the one day it lands hardest. Nothing to compute, nothing to fetch,
no new data.

It was also a **promise the app was already making and not keeping**. The
"One year ago" recap cut has existed since the sixteen-cut build
(`lib/recapCuts.js` `buildAnniversary`), and `RecapPicker` literally told users
it *"Unlocks on the anniversary"* — while nothing anywhere ever surfaced it.

## Plan

Three pieces, so the feature doesn't depend on notifications being enabled:

1. **`lib/anniversary.js`** — pure date logic, string-based.
2. **`supabase/functions/anniversary`** — daily cron push at 15:00 UTC.
3. **`components/OnThisDay.jsx`** — a card on Home, so a missed push still has
   somewhere to land.

### Why the date logic is string-based

`show.date` is a `'YYYY-MM-DD'` string. The moment it goes through `new Date()`
it acquires a timezone: `new Date('2025-08-01')` is midnight **UTC**, which is
July 31st everywhere west of Greenwich. A Date-based implementation would fire
every anniversary a day early for most of the US.

Comparing the month/day substrings sidesteps that completely, and the test file
pins it — including asserting that `Date()` really does read that string as day
31 locally, so the reasoning stays visible rather than being folk knowledge.

### Why 15:00 UTC

At 15:00 UTC it is mid-morning across the Americas and late afternoon in
Europe, so "today" in UTC and "today" for the user are the **same calendar
day**. That's what lets the function compare month/day directly without
per-user timezone bookkeeping. A midnight-UTC schedule would resurface shows a
day early for everyone west of Greenwich — the same bug, moved to the server.

## Changes made

- 2026-07-31: Built.
  - **`lib/anniversary.js`** — `yearsAgo` / `anniversariesOn` /
    `pickAnniversary` / `agoLabel`. Pure, string-based, no `Date` arithmetic on
    show dates.
    - **Leap day handled:** a Feb 29 show resurfaces on Feb 28 in non-leap
      years. Silently skipping it three years in four would be a quiet bug in
      something whose entire job is remembering. Century rules included (2000
      is a leap year, 1900 isn't).
    - **Which one surfaces:** milestone years (5, 10, 15…) win outright —
      "ten years ago tonight" is a different feeling from "one" — then whichever
      night has the most to show, because a bare row makes a disappointing reel.
  - **`supabase/functions/anniversary/index.ts`** — daily cron, mirroring
    `recap-ready`'s shape. Filters by `date like '%-MM-DD'` in SQL so it never
    scans the whole table, plus the Feb 28 window for leap-day shows.
    - **Dedup ref includes the YEAR** (`showId:2026`). A plain show id would
      silence the notification forever after the first anniversary — it has to
      fire again next year.
  - **`components/OnThisDay.jsx`** — the Home card. Keyed on `dayStamp` (App's
    local day key, refreshed on foreground) so it rolls over at midnight rather
    than freezing at mount — which matters for a card whose whole premise is
    the date. Renders only on an actual anniversary, so it's absent almost
    every day; that absence is what keeps it feeling like a find.
  - **Push handler** (`App.jsx`) — `anniversary` opens the show AND its reel in
    one atomic `set`, on the **`anniversary` cut specifically** rather than
    whatever `pickAutoCut` would choose. `RecapReel` gained a `cutId` prop pass
    -through for this.
  - **Fixed the false promise:** `RecapPicker`'s "Unlocks on the anniversary"
    became "Once the night is a year behind you", which is what the `aged` gate
    actually checks.
  - Verified: 27 assertions in `anniversary.test.mjs` covering matching,
    timezone avoidance, leap-day rules, milestone selection and copy. Rendered
    the card live against a three-show library — exactly one card surfaced (the
    wrong-month show and today's show correctly excluded), and tapping opened
    `show` + `recap{cutId:'anniversary'}`.

## Open questions / follow-ups

- **DEPLOY IT.** `supabase functions deploy anniversary --no-verify-jwt`, then
  a dashboard cron at `0 15 * * *`. Until then the Home card works but no push
  ever fires — and the card only helps people who already opened the app, which
  is precisely the group this feature isn't for.
- **`recap-ready` is still undeployed too** (from the earlier session). Both
  are cron pushes of the same shape; deploy them together.
- **No "mute anniversaries" control.** If someone finds it maudlin there's no
  way to turn it off short of disabling all notifications. Worth a Settings
  toggle before this reaches many users.
- **Only one per user per day.** A user with three anniversaries on one date
  sees the best one. The Home card could list the others.
- The card sits above `GetStarted` on Home; if both render for a brand-new user
  with a backfilled library, that's two cards competing. Unlikely but possible.
