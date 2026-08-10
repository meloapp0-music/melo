---
name: notification-digest
description: Kill the daily "notification after notification" storm — bundle the discovery alerts (tour/city/genre) into ONE daily digest push that opens a "For You" page (recommendations first + see-all), while keeping personal/urgent alerts individual. Phase 2 adds a real-time presale/just-dropped watcher.
type: project
---

# Notification digest — "one calm push, not a storm"

- Started: 2026-07-16
- Status: built (dev) — both phases; neither deployed
- Last updated: 2026-08-03

## Context (Aidan, 2026-07-16, verbatim intent)
> "Instead of notification after notification for shows in your area, it should be
> ONE notification that takes you to a page that shows all the shows and Melo's
> recommendations, and then if you wanna see all shows aside from your
> recommendations you can. It's nauseating to get notification after notification
> when it could be a specific time once or twice a day. But you also wanna know the
> second a show drops or a presale link activates — so maybe once or twice a day a
> digest, and then throughout the day if an artist announces a presale or show you
> get notified, but not one 9am storm."

The instinct is exactly right, and it's the standard notification-hygiene split:
**digest the ambient, real-time the urgent.**

## What actually causes the "storm" (verified in tour-alerts/index.ts)
The alert cron runs **once a day** (`0 17 * * *`). In that single run it sends up
to **`MAX_NOTIFS_PER_USER = 5` SEPARATE APNs pushes per user** — one per matching
artist / city / genre. So it's not a trickle all day; it's **5 pushes back-to-back
at ~noon.** That burst is the nausea.

Also important, and the honest constraint: because it polls Ticketmaster **once a
day**, the system today literally CANNOT know "the second a show drops." It finds
everything in that one daily sweep. Real-time is a separate, bigger build (Phase 2).

## The split (mapped to the alert kinds that already exist)
| kind | today | plan |
|---|---|---|
| `tour_alert` (a followed artist is playing) | its own push | **BUNDLE** → digest |
| `city_match` (playing your home city) | its own push | **BUNDLE** → digest |
| `genre_alert` (an artist you'd like, your city) | its own push | **BUNDLE** → digest |
| `preshow_today` / `preshow_day` | its own push | **KEEP individual** — these ARE the urgent, personal ones |
| `postshow_rate` | its own push | keep individual |

## Phase 1 — the daily digest (the ~90% relief, low risk)
Collapse the three discovery kinds into **one push/day**:
> "14 shows near you this week — Goose, Vampire Weekend + 12 more"

- **New push kind `digest` (or `for_you`)** — App.jsx's pushNav handler routes it
  to a **"For You" page** (deep-link). One dedup ref per user per local day.
- **The "For You" page is largely REUSE**, not net-new: it's the taste-matched,
  city-scoped Discover surface we just built (the "Tonight in {city}" rail +
  `fetchEventsByCity` + `topArtists` taste sort). Recommendations first, then a
  **"See all shows"** toggle for everything beyond the taste matches. The page
  re-queries live on open (always fresh) rather than trying to stuff the list into
  the ~4KB APNs payload — the push just carries the count + a couple of headline
  names.
- **Cron change**: in tour-alerts, stop calling `sendApnsBatch` per hit for the
  three discovery kinds; accumulate them per user, then send ONE push with the
  total + top names. `preshow_*` / `postshow_rate` stay exactly as they are.
- Cadence: keep 1×/day to start (the current schedule). "Twice a day" (e.g. a
  morning + an evening pass) is a trivial follow-on once the digest exists.

## Phase 2 — the real-time presale / just-dropped watcher (the "know instantly" half)
The honest big-lift half. To fire "presale starts now" / "just announced" the
moment it happens, the once-daily poll isn't enough:
- **More frequent polling** — a lighter watch pass every ~30–60 min (well within
  TM rate limits at Melo's scale) that only looks for NEW events + imminent
  presales, vs the full daily digest sweep.
- **Presale data exists** — TM Discovery event `sales.presales[]` carries presale
  `startDateTime`/`endDateTime`. So "a presale you care about starts within the
  next hour → immediate individual push with the link" is genuinely feasible.
- These stay **individual + immediate** (they're the urgent exception the digest
  is designed to preserve), deduped so the same presale never re-pings.
- Cost/rate note: model TM call volume before shipping the tighter poll.

## Why this is a good "ship without a Mac" candidate
Entirely **cron (server-side, deploy anytime) + a web-only page** — zero native
change. So it can ship via `supabase functions deploy` + a live-update (see the
public-share-pages live-updates follow-up) with **no iOS build**. Good v1.7 work.

## Relationship to existing initiatives
- Supersedes/sharpens the "in-app inbox + lineup" idea in
  [[notifications-system]] (2026-05-05) — the digest IS the inbox's front door.
- The presale watcher overlaps the price-poller / lineup-watcher ideas in
  2026-05-22-notification-expansion.md.
- Builds directly on the taste-matched Discover surface from
  [[tonight-in-your-city]].

## Changes made

- 2026-08-03: **Phase 1 — the digest.** `tour-alerts/index.ts` now accumulates
  the three discovery kinds into a per-user array and sends ONE push instead of
  up to five. Copy matches the spec above: `"14 shows near you 🎟️"` /
  `"Goose, Vampire Weekend + 12 more"`.

  The caps split into two budgets, because they're now two delivery mechanisms:
  `MAX_NOTIFS_PER_USER` (5) governs only the individual kinds that remain
  (`preshow_*`, `postshow_rate`); `MAX_DIGEST_ITEMS` (20) governs collection
  into the digest. `MAX_GENRE_NOTIFS_PER_USER` rose 2 → 8, since genre picks no
  longer compete with pre-show reminders for push budget — the round-robin
  across genres still decides which ones make the cut.

  Nothing records to `notifications_sent` until APNs accepts the digest, and
  then the digest row AND every event it carried are written together. A failed
  digest re-surfaces all of them tomorrow. Losing one notification is
  recoverable; silently swallowing twenty is not.

  Open decision 3 resolved as recommended: **no push on an empty day.**
  Open decision 1 resolved pragmatically: the push lands on the existing
  discovery surface (`Festivals.jsx`, which owns "Tonight in {city}") rather
  than a new For You page. A dedicated view is still the better answer; this
  gets the relief shipped without blocking on it.

  `formatDate` was deleted — its only callers were the per-event discovery
  pushes, and the digest carries a count and two names, no dates.

- 2026-08-03: **Phase 2 — `presale-watch`, a new hourly function.** Presales
  for watched artists, individual and immediate.

  The design point that makes an hourly cron affordable: it inverts the watch
  sets into `artist -> Set<userId>` **before** querying, so an artist five
  hundred people watch costs one Ticketmaster call rather than five hundred.
  `tour-alerts` queries per user; at this cadence that would be impossible
  inside the API budget. Capped at 150 lookups/run (150 × 24 = 3,600/day,
  leaving tour-alerts its 1,000 and headroom for in-app callers).

  Window is `[now − 75min, now + 60min]` against an hourly cron — 2.25× overlap,
  verified so that every possible presale start time is seen by **at least two
  runs**. A single failed run therefore can't drop one, and the
  `presale|{eventId}|{presaleName}` dedup key stops the overlap double-pushing.
  An event carries several presales (artist, venue, cardholder), each with its
  own start, so each is separately notifiable.

  `MAX_PUSHES_PER_USER` is 3: presales cluster, and an artist opening twenty
  tour dates at once would otherwise recreate exactly the storm Phase 1 killed.

  Scope decision: **newly-announced shows stayed in the digest.** A show
  announced at 2pm loses nothing by being reported at 5pm; a presale does. The
  original intent note asks for immediate alerts on new shows too — that's a
  follow-up, and it would mean moving `tour_alert` out of the digest, which
  risks leaving the digest often empty (genre alerts alone).

- 2026-08-03: **Phase 3 — "first to know", which replaced Phase 2 the same day.**
  Aidan: *"users should be the first ones to know"* — immediate alerts for tour
  announcements, presale announcements, and presales going live.

  The hourly `presale-watch` written earlier that day could not do this and was
  deleted. Two problems with its shape: it queried per artist, so it scaled with
  artists (hundreds) and could only afford an hourly cadence; and it polled to
  catch the moment a presale opened, which is both expensive and inherently
  late.

  **The insight that fixes both:** Ticketmaster publishes
  `sales.presales[].startDateTime` when the presale is *announced*, often days
  ahead. Once that's known, firing at the right second is a clock problem, not
  an API problem. So:

  - **`presale-sweep`** (*/15) — discovery. Queries once per distinct HOME CITY
    and matches artists locally, so it scales with cities (a couple of dozen)
    rather than artists. Costs about a tenth of the artist-keyword approach and
    catches strictly more, because it sees every artist in the city rather than
    only the ones we thought to ask about. Writes every presale it finds into
    `presale_schedule` and sends the "just announced" push, **collapsed per
    artist** — a 30-date tour announcement is one push, not thirty.
  - **`presale-fire`** (* * * * *) — firing. Reads `presale_schedule` and sends
    "presale is live" to the minute, with **zero Ticketmaster calls**. On a
    quiet minute it is one indexed query and an early return; the work of
    resolving watchers only happens when something is actually opening.
  - **Migration 0022** — `public.presale_schedule`. RLS enabled with **no
    policies**: it is server-owned, has no `user_id` to scope by, and any policy
    would expose every row to every user. Deny-all is the intended posture, not
    an oversight.

  `first_seen` on the schedule row is load-bearing. A presale discovered
  *after* it already opened must not fire a "live now" alert hours late — the
  announcement push already covered it. The upsert deliberately omits
  `first_seen` from its payload so a re-sweep can't overwrite the original
  discovery time.

  Verified: every possible presale start time is covered by **at least 5** fire
  runs (1-min cron, 5-min lookback, 30s skew lead), so a missed invocation
  can't drop one. Budget lands at **3,400 of 5,000** calls/day —
  sweep 2,400 + tour-alerts 1,000 + fire 0 — leaving 1,600 for the app.

  **Honest ceiling:** this makes Melo as fast as the Discovery API allows, not
  faster. TM has its own propagation lag, and artists post to socials before
  anything reaches an API. "First among apps polling Ticketmaster" is the real
  claim.

  Knock-on: named-artist announcements now arrive immediately rather than in
  the digest, so the daily digest becomes genre/city discovery only. That is
  the correct split — followed artists are urgent, ambient discovery is not —
  but it does mean the digest is smaller than when it was built.

- 2026-08-03: **Deployed, and two defects the first live run exposed.**
  Run 1: `cities 25 · lookups 25 · matched 1335 · scheduled 3428 · pushed 71`.

  **City starvation.** 25 of 25 meant the cap was binding — and the real total
  turned out to be **46**, so 21 cities were never swept at all. Worse than it
  sounds: an unswept city never gets its presales into the schedule, so
  `presale-fire` could never fire for anyone living there. Raising the cap would
  have broken the API budget, so the 25 now splits — 15 hot cities every run,
  10 rotating through the tail on a clock-derived offset (no stored state, self-
  corrects after a missed run). Full coverage of 46 cities every 4 runs = one
  hour, with calls/day unchanged at 2,400. Coverage degrades gracefully: even
  100 cities would still cost 2,400/day, just at 135-minute discovery latency,
  which is fine when presales are announced days ahead. `totalCities` is now in
  the response so the signal is measured rather than guessed.

  **No retention.** 3,428 rows written and nothing ever removed them, under the
  one index `presale-fire` hits 1,440 times a day. Added a prune of anything
  with `starts_at` older than a week — far outside fire's 5-minute lookback, so
  it can never be selected again. It ran after the upsert (a prune failure must
  never cost the schedule write) and immediately removed **3,515** rows, which
  says most of what run 1 stored was already-expired presales.

  Run 2, post-fix: `totalCities 46 · rotationRuns 4 · matched 967 ·
  scheduled 2754 · pruned 3515 · pushed 56`.

  **One-time cost worth recording:** the 71 + 56 pushes are backlog, not steady
  state — every matching event is "new" the first time a city is swept. Expect
  a few more elevated runs while the rotation completes its first full cycle,
  then it should go quiet. Capped at 3/user/run throughout.

- 2026-08-03: **App routing** (`App.jsx`). `digest` → the discovery surface.
  `presale` → leads with a 12-second tappable toast carrying the ticket URL,
  with the wishlist tour search opening underneath as the fallback. The link is
  the entire point of a presale alert; making someone find it themselves wastes
  the only thing that was time-critical.

## Open decisions (for build time)
1. **Digest page = enhance Discover, or a dedicated "For You" screen?** Recommend
   a dedicated view that defaults to recommendations (reusing Discover's data), so
   the notification lands somewhere purpose-built, not a generic search page.
2. **1×/day vs 2×/day** to start — recommend 1× (current), add a 2nd pass later.
3. **Digest empty-night rule** — no push when there's nothing new (same principle
   as daily-post: a digest that fires on an empty day trains people to ignore it).
4. **Phase 2 poll frequency** — the cost/rate-limit tradeoff; decide the interval.
