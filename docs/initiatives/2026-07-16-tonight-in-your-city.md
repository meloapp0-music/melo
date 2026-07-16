---
name: tonight-in-your-city
description: A "Tonight in {city}" rail on Discover — what's playing in your home city today, auto-loaded, taste-first, tap for tickets. Doubles as the daily-content artifact Aidan wanted to post.
type: project
---

# Tonight in your city

- Started: 2026-07-16
- Status: built (dev) — awaiting logged-in device eyeball
- Last updated: 2026-07-16

## Context
Aidan wanted a **daily content generator** — "a daily schedule for artists and
where they are playing" — to post from. He already does a Chicago weekend
carousel on Mondays (builder tool on his Desktop).

The honest pushback given first: his own
[marketing OS](../../marketing/marketing-operating-system.md) says in bold that
**ideas are not the bottleneck** — *"marketing competes with a demanding job for
willpower, and willpower loses. This OS removes decisions, not adds tactics."*
Both of his ideas were already in it (reposting = the DAILY cadence; the city
schedule ≈ his existing carousel). So a new idea has negative value; the leverage
is removing execution cost.

### The Chicago-vs-any-city question
He asked how to decide. Answer: **it isn't a technical question** —
`fetchEventsByCity(city)` already takes a plain string and there's no hardcoded
city list, so multi-city costs nothing. It's editorial:
- **Can you tell instantly if the output is WRONG?** Chicago yes, Phoenix no. He
  had just shipped a fix for the app confidently showing the wrong Goose — that
  class of bug is invisible in a city you don't live in, and being wrong about a
  local scene kills the credibility that is the whole asset.
- **Does anyone there follow you?** At ~50 followers, no.
- His own doc: *"One scene — don't spam five."*

Resolution: **code city-agnostic, post Chicago-only.** Which the chosen approach
makes moot anyway — an in-app feature gives every user their own city for free.

## Decision (Aidan, 2026-07-16)
Chose **in-app feature** over a Supabase cron→email or a local builder tool.
Flagged honestly at the time: this does NOT close the daily-posting willpower gap
(he still screenshots it) — he traded automation for product value. It does match
move #3 in his own OS: *"the product IS the content."*

## Changes made
- 2026-07-16: **`api.js` — `fetchTonightInCity(city)`**. Wraps the existing
  `searchEvents` with a local-day window. Ticketmaster wants ISO8601 UTC, so it
  takes local midnight → local 23:59 and converts: a naive UTC day would cut off
  evening shows for US users (the interesting ones) and bleed in tomorrow's. The
  window starts at local MIDNIGHT, not `now`, so opening the app at 11pm still
  shows what was on tonight instead of an empty rail.
- 2026-07-16: **`pages/Festivals.jsx` (Discover) — the "Tonight in {city}" rail.**
  Auto-loads, no search required (the point is being the answer before the
  question). Home city via the existing `inferHomeCity(shows)` — inferred from
  logged shows, so no GPS and no setting. Reuses the page's `myArtists` taste set
  for the same taste-first sort as search results (a "★ Yours" flag on matches).
  Re-runs on `dayStamp` so a session left open overnight rolls over at local
  midnight. Renders only when a home city is known AND something is actually on —
  an empty "0 shows tonight" band would be a daily disappointment. Fails silent.
- 2026-07-16: **Cards link straight to tickets** (`ev.ticketUrl`). It's on
  TONIGHT — tickets is the only useful action. An `<a>` with no href is inert,
  which is the right degrade when TM gives no link.
  - Caught in review of my own code: the first cut called
    `setCityQuery(homeCity); runSearch();` — `runSearch` reads `cityQuery` from
    the closure, so React's async state meant it would have searched the STALE
    query. Going straight to tickets removed the bug and improved the action.
- 2026-07-16: **`App.css` — `.tonight*`**. Deliberately screenshot-worthy: a
  self-contained dark band with the city + date + count inside the frame, so a
  grab reads as a post on its own. Live pulse dot (the band is about RIGHT NOW).
- 2026-07-16: **Verified against real Ticketmaster data** — Chicago today
  returned **9 real shows** (The Black Keys @ The Salt Shed, Honey Revenge @ House
  of Blues, Rico McFarland @ Kingston Mines); rail renders, scrolls, real artist
  images. Build clean.

## Open questions / follow-ups
- **It still needs a human to screenshot + post.** If the daily post doesn't
  happen, the diagnosis is confirmed and the answer is the Supabase cron → email
  variant (a finished card in the inbox each morning = one tap). That was the
  recommended option and remains the one that survives a bad week.
- A "This weekend" toggle would match his existing Monday carousel — natural next
  step, small (same fetch, wider window).
- The rail is Discover-only. If it earns its keep, Home is the higher-traffic
  surface — but Home was just decluttered, so don't re-clutter it without cause.
- No analytics event yet — worth a `tonight_card_tapped` to see if it's used
  before investing further.
