---
name: festival-search-and-notification-deeplink
description: Two real user reports — (1) can't search an upcoming festival (e.g. Windy City Smokeout) from Wishlist to see its day-by-day lineup, and (2) tour/genre notifications didn't take them anywhere useful, just Home.
type: project
---

# Festival search on Wishlist/Going + notification deep-linking

- Started: 2026-07-09
- Status: shipped
- Last updated: 2026-07-09

## Context
Two pieces of real user feedback in one message:
1. "I should also be able to search festivals [in Wishlist] — e.g. Windy City
   Smokeout — and it'll show me the day by day lineup."
2. "My notifications that I just got didn't take me anywhere. Just to the
   home page, not to the notification artist page to get tickets."

## Part 1 — Festival search on Wishlist/Going
`searchFestivalByName` (built in [[artist-tracking-anywhere]]/the festival
finder work) was already general enough to handle UPCOMING festivals — its
Ticketmaster branch pulls real future events, not just past Setlist.fm data —
but the UI only exposed "Festival" mode on the Attended tab. Verified live
against Ticketmaster: **Windy City Smokeout resolves correctly** (real
2026-07-08 through 07-12 dates at United Center, Chicago, with full daily
lineups — Hootie & the Blowfish, Lainey Wilson, Jordan Davis, Blake Shelton,
etc.) — confirming the underlying search already works for this exact
example without new data-source work.

One real bug found during that live check: Ticketmaster lists a "thin"
duplicate event per day (a GA/VIP ticket listing) whose ONLY attraction is
the festival's own name — without a filter, "Windy City Smokeout" would
appear as a fake headliner alongside the real acts. Fixed in
`searchFestivalByName` by excluding any attraction whose (normalized) name
matches the festival label itself.

Shipped:
- `showFestival` now available on `isAttendedTab || isFutureTab` (was
  Attended-only).
- Going/Wishlist mode-toggle gains a "Festival" button (now: Quick log /
  Festival / Full Tour), matching Attended's Quick log / Festival / Past show.
- Festival-mode hint copy is tense-aware ("acts you want to catch" /
  "add them all at once" vs "acts you saw" / "log them all at once").
- The Quick-log inline "🎪 Find this festival's lineup" convenience (typing a
  festival name in the Festival field without switching tabs) now works on
  Going/Wishlist too, not just Attended.

## Part 2 — Notification deep-linking
Found the actual bug: `App.jsx`'s push-tap handler already had SOME
deep-linking for `tour_alert`/`city_match` (a tappable "get tickets" toast),
but **`genre_alert`** — the notification kind added this session in
[[genre-based-notifications]] — was never added to that check. A genre-alert
tap fell through every condition and hit a bare no-op, landing the user on
whatever tab was already showing (Home) with literally nothing else
happening. This is almost certainly what the user hit, since genre alerts
just started firing.

Beyond the missing kind, a toast alone doesn't really satisfy "take me
somewhere" — it can be missed and vanishes in 8s. Upgraded the destination:
tapping a tour/city/genre alert now opens a NEW `logPrefill` mechanism that
launches LogShow straight into Wishlist's Full Tour view (the mode built in
[[artist-tour-browser]]), pre-searched for that artist — a real screen
showing every upcoming date, not a toast — while the tappable "get tickets"
toast still layers on top as the fast direct-purchase path.

- `LogShow` accepts a new `prefill` prop (`{ status, mode, tourArtist }`),
  applied to its initial `status`/`logMode`/`tourArtist` state and auto-runs
  the tour search once on mount — ignored while `editingShow` is set.
- `App.jsx`: new `logPrefill` state, passed through to `<LogShow>`; the
  push-tap handler now covers `genre_alert` too, and constructs the prefill
  from `pushNav.artist` before (or instead of, if no ticket URL) falling back
  to the old Festivals-tab landing.

## Security spine
No new tables/endpoints — reuses `searchFestivalByName` (already reviewed)
and the existing push-notification data payload; `logPrefill` is pure
client-side UI state.

## Changes made
- 2026-07-09: Built and verified both parts. `api.js`: festival-self-name
  filter in `searchFestivalByName`'s lineup collection, verified live against
  Ticketmaster's real Windy City Smokeout listing (confirmed the duplicate
  thin-event issue and the fix). `LogShow.jsx`: Festival mode extended to
  Going/Wishlist, tense-aware copy, `prefill` prop + mount-time auto-search.
  `App.jsx`: `logPrefill` state + render wiring, `genre_alert` added to the
  push-tap kind check, real-screen landing via `logPrefill` alongside the
  existing tickets toast. Production build clean, zero console/server errors
  on reload. Not click-tested on a signed-in device (preview is behind
  login) — worth testing for real: search "Windy City Smokeout" from
  Wishlist → Festival mode, and (harder to test without a live push) confirm
  a genre/tour-alert tap opens the Full Tour view pre-searched.

## Follow-up fix (same day)
User reported the Windy City Smokeout search itself was returning "a bunch of
past shows and artists/bands that aren't even remotely close to being a part
of" the festival, and asked for Wishlist/Going to only ever show future
shows. Root-caused precisely (not guessed) by re-reading the actual function:

1. **The real bug**: `searchFestivalByName`'s venue-based Setlist.fm branch
   had NO filter against the Ticketmaster-confirmed lineup — only the
   city-fallback branch did. Windy City Smokeout resolves to venue = "United
   Center," a massive shared arena hosting hundreds of unrelated concerts a
   year, so the unfiltered venue search pulled in every unrelated artist
   Setlist.fm has ever logged there. Fixed by applying the same
   lineup-confirmed filter to the venue branch too — whenever we have a
   Ticketmaster-verified lineup, ALWAYS restrict Setlist.fm rows to just
   those artists, regardless of which branch (venue or city) found them.
2. **The future-only ask**: added a `futureOnly` option to
   `searchFestivalByName` — when set, drops any row without a real date >=
   today (covers both stale Setlist.fm rows from a prior year's edition and
   any dateless edge case). `LogShow.jsx`'s `runFinder` now passes
   `futureOnly: isFutureTab`, so Festival search on Wishlist/Going is
   future-only while Attended's festival search is untouched (still wants
   past editions, since you're logging what you saw).

Note: Quick-log's artist search and the Full Tour mode were NOT part of this
bug — their data sources (Ticketmaster Discovery, JamBase) are inherently
upcoming-only by construction. Only `searchFestivalByName`'s Setlist.fm
fallback could leak past/unrelated data, since Setlist.fm is a past-shows-only
database with no concept of "upcoming."

Verified: production build clean, zero console/server errors. Could not
re-run the live Windy City Smokeout check end-to-end from here (the
Setlist.fm half goes through `setlistfm-proxy`, which requires an
authenticated session) — the fix is grounded in directly reading and
correcting an objective asymmetry in the code (one branch filtered, the
sibling branch didn't), not a guess. Worth a real re-test on device.

## Follow-up (2026-07-10): live festival autocomplete + Select/Deselect all
User: "I want Windy City Smokeout to autofill when I type it in Festivals …
how can we make it so … every single festival autofills. Also if I select all,
I should be able to deselect all."

- **Live festival-name autocomplete.** The `FestivalAutocomplete` only filtered
  the curated ~19-name `FESTIVAL_NAMES` list, so anything off that list (Windy
  City Smokeout and the long tail) never suggested. Added
  `searchFestivalNames(query)` in api.js — a keyword search against TM's
  Festival classification (Music segment) that dedupes multi-day/ticket-type
  events into clean base names. The autocomplete now shows curated matches
  instantly (they also cover big fests TM doesn't list as on-sale, e.g.
  Coachella) then merges debounced live TM matches. Verified live: "windy" →
  "Windy City Smokeout". **Important:** TM keyword search is fuzzy (a search
  for "riot" returned Nocturnal Wonderland / Bass Canyon — no "riot" in them),
  so `searchFestivalNames` filters live results to only names that actually
  contain the query, preventing wrong suggestions. Selecting a name still
  resolves through the (already-fixed) `searchFestivalByName`, which handles
  any TM-listed festival.
- **Select all → Deselect all.** The group header button was add-only. Now
  `toggleAllInGroup` + `groupAllSelected`: when every row in a group is
  selected the button reads "Deselect all" and clears them; otherwise "Select
  all". Applies to festival lineups AND tour results (shared finder block).

## Follow-up (2026-07-10): add a festival by its DATES, before any lineup
User: "if a user wants to simply look up a festival date even before artists
get announced, how can they do that?" — a real gap: Festival mode was built
entirely around picking acts from a lineup, so a not-yet-announced festival
returned the "couldn't find that festival" empty state even though Ticketmaster
already knows its dates.

Root cause: `searchFestivalByName` resolved the festival's venue/city/date from
the TM primary event but only ever RETURNED lineup/setlist rows — with no
lineup and no past setlists, `rows` came back empty and the date was discarded.

Fix (api.js): capture the festival's own date span (`festStart`/`festEnd`) from
the strict TM match — future-only dates for a Wishlist/Going search, so a
recurring festival resolves to THIS edition. When `futureOnly` and a date
resolved, prepend a single "festival itself" row: `{ artist: label, festival:
label, date: festStart, displayDate: "Jul 8 – 12, 2026", isFestival: true }`.
Added `festivalRangeDisplay()` for the friendly range. It's the FIRST item, so
a user can look up a festival and add it by its dates even with zero acts
announced; when acts ARE announced they appear below it and the user can add
the whole festival OR specific acts. Verified live: Windy City Smokeout →
festStart 2026-07-08, festEnd 2026-07-12.

Rendering (LogShow.jsx): the placeholder shows a "🎪 Whole event" badge to
distinguish it from act rows; the future festival-mode hint now says "Add the
whole festival (even before the lineup drops), or tap the acts you want."
`logSelected` needs no change — it maps the row's existing fields (artist/
date/festival/genre/songs) and ignores the extra `isFestival`/`endDate`.

Gated on `futureOnly`: Attended festival logging is unchanged (you pick the
acts you actually saw, not "the festival itself").

## Follow-up (2026-07-10): festival log returning wrong edition / wrong year
User (Attended tab, screenshot): searched "Lollapalooza" year 2025 and got
rows with 2026 dates and artists who clearly weren't Lolla Chicago (Danny
Ocean, J Balvin, Elena Rose — South-American-edition acts), all stamped
"Grant Park · Chicago."

Diagnosed live against Ticketmaster (not guessed):
- **TM is upcoming-only** — zero Lollapalooza 2025 events exist (2025 is past).
- The **year filter wasn't strict**: `if (yr.length) pool = yr` — when the
  requested year had no events, it silently kept ALL matched events, which
  were 2026 editions.
- **"Lollapalooza" matches many editions** — 52 Chicago + 4 Berlin events in
  one response, PLUS dozens of "Official Lollapalooza Aftershow" club gigs
  (House of Blues, Empty Bottle, Cobra Lounge…), all name-matching.
- The `lineupSet` filter (added in the prior follow-up to fix United Center
  bleed) then **suppressed the real Setlist.fm 2025 data**, because it
  filtered real 2025 acts against the bogus 2026 TM lineup.

Fix (`searchFestivalByName`, api.js):
1. **Strict year filter** — when `year` is given, keep ONLY that year. A past
   year → empty TM pool → falls through to Setlist.fm for the real historical
   lineup (unfiltered, since lineupSet is now empty).
2. **Edition isolation** — narrow the TM pool to the curated `venue`
   (contains-match: "Grant Park" → main stage only, which also drops the
   aftershows at other venues and the Berlin edition), else to the curated or
   most-common `city`.
3. **Cleaner dates** — lineup rows now use `festivalRangeDisplay` ("Aug 2,
   2026") instead of `isoToDisplay`'s confusing "02-08-2026".

Verified live: Lolla **2025** → 0 TM rows (→ Setlist.fm real data); Lolla
**2026** → the REAL Chicago lineup (Tate McRae, Charli xcx, Lorde, Smashing
Pumpkins, Lil Uzi Vert, Olivia Dean, Jennie, 5SOS…) at Grant Park, dated
Jul 30 – Aug 2, 2026 — no Berlin, no aftershows, no phantom acts.

### Also: Coachella (user report) — city not specific enough
User: "when I type in coachella it just gives me this" (garbage). Diagnosed
live: "Coachella" matches the real fest (Empire Polo Club, Indio) BUT ALSO
"Coachella Valley Classical Voices" (a separate classical series, Plaza
Theatre, Palm Springs) and dozens of casino shows in the CITY of Coachella,
CA. Coachella was curated by CITY ONLY (Indio), which couldn't separate the
fest from the noise. Fix: upgraded its curated entry to the VENUE (Empire
Polo Club). Verified live: only the real "Coachella Music Festival" survives.

### Adversarial review → rewrite (the fix had 4 bugs of its own)
Ran a 4-lens adversarial review of the first fix; it confirmed 7 findings
(one MAJOR regression I'd introduced). Rewrote the resolver to fix all:
1. **MAJOR borough-city wipe**: the first fix ran the venue filter AND an
   exact-equality city filter SEQUENTIALLY. For a festival whose TM
   venue-city differs from the curated metro (Governors Ball → TM "Flushing"
   vs curated "New York"; Boston Calling → "Allston" vs "Boston"), the city
   `===` matched zero and WIPED the venue-narrowed pool to empty → the
   festival returned nothing. Fix: venue and city are now ALTERNATIVES — a
   successful venue match sets `narrowed=true` and SKIPS the city filter; the
   city fallback is guarded (`if (byCity.length)`) so it can never empty the
   pool.
2. **MAJOR no-year direction bug**: the strict year filter is `if (year)`-
   gated, so on the Attended tab with NO year typed, future editions survived
   and 2026 acts were returned as "attended" (past editions unreachable).
   Fix: a `dirPool` splits the pool by direction — Attended wants PAST,
   Wishlist wants FUTURE. Lineup/spanDates/resolvedYear all derive from
   dirPool. TM is upcoming-only, so Attended's dirPool is ~empty → relies on
   Setlist.fm, never stamping future acts. Live-verified: Lolla Attended
   no-year → 0 future acts (was 169); Lolla Wishlist no-year → 169 real acts.
3. **MINOR aftershow pollution**: "Official … Aftershow" club gigs name-match
   the festival. Fix: excluded via an `isAftershow` regex in the name filter.
4. **MINOR cross-year span**: a no-year Wishlist could merge a 2026 + early-
   on-sale 2027 edition into a bogus >1-year placeholder span. Fix: festEnd
   capped to the same year as festStart.
### Second adversarial review → 6 more findings fixed
The review of the rewrite confirmed 6 more (2 major, 4 minor). Fixed:
- **MAJOR ambiguous-venue leak**: a curated venue with a globally-common name
  (Shaky Knees → "Central Park", which also matches NYC's Central Park) leaked
  other cities' shows on Attended, because the Setlist.fm venue search passes
  no city constraint and the lineupSet filter is empty on a past search. Fix:
  when there's no lineup to filter by, constrain venue rows to the resolved
  city.
- **MAJOR/edge cross-year truncation + underway clipping**: the same-year
  festEnd cap truncated a NYE festival (Dec 31 – Jan 1 → dropped Jan 1), and
  deriving festStart from the direction pool clipped the first day of a
  festival already underway (WCS Jul 8–12 with today Jul 9 → showed Jul 9).
  Fix: anchor on the nearest direction-appropriate day, then take the full
  pool's dates within a 16-day festival window — preserves the true first day,
  keeps cross-year editions whole, and still excludes a next-year edition
  (~365 days away). Unit-verified.
- **MINOR aftershow gaps**: `isAftershow` missed "after hours / after dark /
  afters / afterparties". Fix: broadened the regex (still spares real names
  like "Aftershock", "Afterlife"). Unit-verified against 10 cases.
- **MINOR dropped future act**: a lineup act that also had a PAST setlist that
  year was deduped out before the futureOnly filter ran, silently dropping it
  from Wishlist. Fix: run the futureOnly filter BEFORE the dedup.
- Also tightened the festival-self-name filter from exact-equality to
  `startsWith(target)`, so a festival's full official name listed as an
  attraction ("Coachella Valley Music and Arts Festival") no longer shows as
  a fake act alongside the "🎪 Whole event" row.

Known remaining minors (documented, not fixed): (1) a city-only curated
festival (e.g. BottleRock → Napa) on a past-year Attended search has no TM
lineup to filter by, so the Setlist.fm city search can return unrelated
same-city shows stamped with the festival label — mitigation is venue-based
curation (done for Coachella; the majors the user hit are venue-based). (2)
`normalizeFestival` strips the word "fest", so "Riot Fest" → target "riot"
can name-match "Quiet Riot" when no real Riot Fest edition is on TM — mitigated
by venue-narrowing whenever the real edition is present; changing
normalizeFestival is riskier than the residual bug.

Two full adversarial review rounds; the confirmed findings from both are fixed
or documented. Final live check: Lolla Wishlist → 169 real 2026 acts; Lolla
Attended no-year → 0 TM acts (→ Setlist.fm); Coachella → isolated to Empire
Polo Club.

## Open questions / follow-ups
- The festival placeholder's `date` is the first day only; MyShows shows that
  single date, not the range. The range is captured (`endDate`) but not yet
  surfaced on the show card — a small future enhancement.
- Live festival autocomplete inherits substring matching — an abbreviation like
  "ACL" won't surface "Austin City Limits" (pre-existing; curated list is also
  substring-based). Fine for now.
- Notification-triggered `logPrefill` always targets Wishlist, never Going —
  reasonable default (you're being told about something new, not confirming
  you already have tickets), but worth revisiting if it feels wrong in practice.
- The festival-self-name filter is a normalized-string match — if a real act
  is ever named identically to a festival (unlikely), it'd be incorrectly
  filtered. Acceptable tradeoff given the alternative (fake headliner rows).
