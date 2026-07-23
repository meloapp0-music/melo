---
name: notification-digest
description: Kill the daily "notification after notification" storm — bundle the discovery alerts (tour/city/genre) into ONE daily digest push that opens a "For You" page (recommendations first + see-all), while keeping personal/urgent alerts individual. Phase 2 adds a real-time presale/just-dropped watcher.
type: project
---

# Notification digest — "one calm push, not a storm"

- Started: 2026-07-16
- Status: planned (captured; build after v1.6 settles — Aidan's call)
- Last updated: 2026-07-16

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

## Open decisions (for build time)
1. **Digest page = enhance Discover, or a dedicated "For You" screen?** Recommend
   a dedicated view that defaults to recommendations (reusing Discover's data), so
   the notification lands somewhere purpose-built, not a generic search page.
2. **1×/day vs 2×/day** to start — recommend 1× (current), add a 2nd pass later.
3. **Digest empty-night rule** — no push when there's nothing new (same principle
   as daily-post: a digest that fires on an empty day trains people to ignore it).
4. **Phase 2 poll frequency** — the cost/rate-limit tradeoff; decide the interval.
