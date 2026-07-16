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

## The post artifact — `melo.show/tonight` (2026-07-16)
Aidan then asked for the cron→email generator. Built the **artifact** half; the
email half is blocked on a decision (below).

- **`marketing/functions/tonight.js`** (new) — a full-bleed 9:16 page listing
  tonight's shows. Open on a phone, screenshot, post: **the screenshot IS the
  artifact**, so no server-side image generation (no Canvas-in-Deno, no Satori)
  and no design work at post time. `/tonight` → Chicago; `?city=` + `?tz=` are
  parameterized because it costs nothing (posting stays one-city per the
  editorial call above).
- **Three real bugs caught by actually running it** (wrangler pages dev + live TM):
  1. **⚠️ THE DEPLOY COMMAND WAS WRONG** — `wrangler pages dev/deploy <dir>`
     discovers `functions/` relative to the **CWD**, not the assets dir. Run from
     the repo root it logged *"No Functions. Shimming…"* and silently served
     `index.html`. So `npx wrangler pages deploy marketing/` (what the KBYG/share
     notes said) would have deployed **zero functions** — the share page would
     have 404'd with no error. **Correct: `cd marketing && npx wrangler pages
     deploy .`** Same silent-failure class as the drag-and-drop trap.
  2. **UTC-day bug** — Cloudflare runs UTC, so a naive UTC "today" ends at 23:59Z
     = 6:59pm Chicago and dropped every evening show. Measured: **2 shows vs 9**
     for the same night. Now resolves the city's local day via `Intl` (real
     offset, DST handled) and converts that window to UTC.
  3. **Cancelled + junk listings** — the first live run rendered
     `*CANCELLED* Los de la Homan`. TM keeps dead listings in the feed and also
     prefixes state into the NAME (`*SOLD OUT*`, `*JUST ANNOUNCED*`). Now filters
     on `dates.status.code` AND the name, and strips `*MARKER*` junk (a sold-out
     show is still on — keep it, drop the marker). Posting a cancelled show to
     your own city is exactly the credibility damage the one-city argument was
     about.
- Verified live: 7 real Chicago shows (Black Keys @ Salt Shed, RUSH @ United
  Center, Hunx @ Empty Bottle), empty state on a quiet city, `?city=Austin` works.
- **Needs one Pages env var: `TICKETMASTER_KEY`** (same key already ships in the
  app bundle as `VITE_TICKETMASTER_KEY` — exposes nothing new).

## The reminder — push, not email (2026-07-16)
Aidan chose push. Built as an explicit **founder/ops tool**, not a product feature.

- **`supabase/functions/daily-post/index.ts`** (new) — a daily cron that pushes ONE
  account (`DAILY_POST_USER_ID`) *"8 shows in Chicago tonight · Honey Revenge and
  more — tap to grab today's card"*, deep-linking to `melo.show/tonight`.
  **Inert unless the env var is set**, so deploying it changes nothing for anyone.
- **Why one user and not everyone:** a daily "here's what's on" push to the whole
  base is a digest nobody asked for. Every other Melo push is EARNED (a tour you
  want announced, your show is tomorrow, someone reacted). Notification fatigue is
  how an app gets deleted. The *product* version of this idea is taste-triggered —
  "an artist you love is playing your city tonight" — which is a different,
  opt-in feature and deliberately not built here.
- **`App.jsx`** — handles `kind: 'daily_post'`, opening the card URL (falls back to
  Discover, whose "Tonight in {city}" rail is the same data).
- Reuses `_shared/apns.ts`, `device_tokens`, and the `notifications_sent`
  (kind, ref) dedup — ref is `{city}|{local date}`, so "once per LOCAL day" is
  honest even if the cron double-fires. Prunes dead tokens like tour-alerts.
- **No push on an empty night.** A nudge that fires when there's nothing on trains
  you to ignore it — the only way this tool can actually fail.
- Same tz-aware window as the page (Supabase's Deno also runs UTC, so the same
  evening-shows bug would have applied). **Verified against live TM**: the Chicago
  window resolves to `05:00Z → 04:59:59Z` (correct for CDT — a naive UTC day would
  have started at `00:00Z`), 9 raw → 8 after filtering.
- **Caught a mismatch while verifying:** the push said 8 but the page said 7,
  because the page counted the rows it *displays* after the limit. A card claiming
  "7 shows" on an 8-show night is simply wrong. The badge now states the true
  total (counted after filtering, before the display slice) and adds "+ N more
  across the city" when trimmed.

### Setup (Aidan)
```
supabase secrets set DAILY_POST_USER_ID=<his auth user id>   # unset = no-op
supabase functions deploy daily-post --no-verify-jwt
supabase functions schedule create daily-post --cron "0 17 * * *"   # ~noon Chicago
```
Optional: `DAILY_POST_CITY` (default Chicago), `DAILY_POST_TZ` (default
America/Chicago). `TICKETMASTER_KEY` + `APNS_*` already exist for tour-alerts.

### The email half is NOT built — and shouldn't be
There is **no email sender in this project**. Supabase's built-in email only
sends auth/OTP; arbitrary sends need a third party (Resend/Postmark) = new
account + API key + domain verification on melo.show. That's real setup for the
*reminder*, which is the cheap half of the problem.

The artifact is now one URL. The reminder options, honestly ranked:
1. **A recurring phone alarm** — $0, zero code, works today. Genuinely the 90/10.
2. **Push** — `tour-alerts` already runs a daily cron and sends APNs. Lands on the
   phone he posts from, no new service. Better than email on the merits.
3. **Email** — needs Resend + domain verification, and delivers to an inbox,
   which is *not* where he posts from.

Recommendation: add the page to his home screen + set an alarm; revisit push if
the habit sticks. Don't buy a service to solve a reminder.

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
