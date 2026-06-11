# Pre-show → show → post-show experience loop

- Started: 2026-06-10
- Status: in-progress
- Last updated: 2026-06-10

## Context

Push delivery went live today (see 2026-05-22-artist-in-your-city-alerts.md,
2026-06-09/10 entries). Aidan immediately hit the next gap: the notification
*lands* but tapping it dumps you on the home screen with nothing to do.
Direct user request (2026-06-10, verbatim intent):

1. Tapping a show notification should open **the show**, not the home
   screen — "a different screen that has all the info, my tickets, and
   venue info."
2. 1–2 days before a going show, opening the app should surface a
   **pop-up hype card** — "Mumford and Sons in __ days, share your
   excitement … with friends, or on social."
3. Home should get a **separate section up top** for imminent shows
   (within ~1 week), distinct from the general "you're going" section.
4. After the show: a **notification** (the `postshow_rate` push already
   exists server-side and now delivers) **and an in-app reminder at the
   top of the app** to log/rate the show.

This is the engagement loop the growth docs keep pointing at: the push
re-opens the app; the app must then convert that open into action
(tickets → hype share → rating → logged show).

## Plan

All client-side (no schema change, no new Edge Function):

- **Deep link**: wire Capacitor `pushNotificationActionPerformed` in
  `lib/push.js` (module-level pending-action + custom event); App.jsx
  consumes it once shows are loaded. `preshow_*`/`tour_alert` kinds →
  show screen; `postshow_rate` → rate flow for that show.
- **Show screen**: a focused going-show detail surface (countdown,
  date/venue/city, ticket link, venue link, openers, notes) reachable
  from the Up Next card and from notification taps.
- **Up Next section**: top-of-home section for going shows 0–7 days out,
  countdown-first card design; general Going list keeps everything else.
- **Hype card**: dismissible overlay on app open when a going show is
  1–2 days out; share CTA (canvas share card in the house style, like
  Wrapped's) + per-show/day dismissal in localStorage so it never nags.
- **Post-show banner**: top-of-home banner for going shows whose date
  has passed ("How was X? Rate it →") leading into the same rate flow.

Ships in the next App Store build (1.2.1 build 16 is already in review
and is NOT touched).

## Changes made

- 2026-06-10: Initiative created; codebase mapping workflow launched.
- 2026-06-10: Implemented the full loop (client-only):
  - `store.js`: exported `daysUntil()` (shared by App/ShowDetail).
  - `lib/push.js`: `onPushTap(handler)` — wires Capacitor
    `pushNotificationActionPerformed` at App mount, buffers cold-start
    taps until the handler attaches.
  - `App.jsx`: pushNav state + resolver effect (gated on `profile` so a
    cold-start tap can't race the first data load). Routing:
    `preshow_*` → ShowDetail · `postshow_rate` → LogShow rate editor ·
    `tour_alert`/`city_match` → tappable tickets toast ·
    `friend_request` → Buddies tab. Tracks `push_opened`.
    Plus the hype-card trigger: going show 0–2 days out, once per
    show+day via `melo_hype_<id>_<d>` localStorage keys, never rendered
    over another overlay or pending deep link.
  - `components/HypeCard.jsx` (new): countdown pop-up (artist hero,
    TONIGHT/TOMORROW/IN N DAYS, Share the hype / View details / Not
    now). Tracks `hype_shared`.
  - `lib/shareCard.js`: refactored footer QR + share plumbing into
    `drawFooterQr`/`shareBlob`; added `renderHypeCard`/`shareHypeCard`
    (countdown share card in the Wrapped house style, same QR install
    loop).
  - `pages/Home.jsx`: new "Up Next" section — full-width hero cards for
    going shows 0–7 days out (countdown pill, Tickets, Details);
    "You're Going" rail now starts at >7 days so nothing duplicates.
  - `components/ShowDetail.jsx`: countdown chip (Tonight/Tomorrow/In N
    days) in the hero for upcoming shows.
  - `App.css`: `.upnext-*`, `.hype-*`, `.detail-countdown` styles on
    house tokens.
  - Note: the post-show push (`postshow_rate`) and the top-of-home
    "How was X?" rate card already existed; this initiative made the
    push tap land in the rate editor.
- 2026-06-10: Adversarial review (3-lens workflow) fixes:
  - Hype card no longer pops over a push-tap destination — handling any
    tap snoozes it for the day (`hypeSnoozedDay`).
  - Day-rollover staleness fixed: `dayStamp` state refreshes on
    `visibilitychange` (iOS webview survives overnight in the app
    switcher); hype + Home's upNext/goingFuture/goingPast re-bucket at
    midnight, and the snooze re-arms.
  - `hype_shared` no longer sends the artist name (privacy spine —
    analytics props are enums/numbers only).
  - Up Next card: real `<button>` + aria-label (VoiceOver), min-height
    + normal-flow content so long artist/venue text can't clip the
    countdown pill on narrow screens.
  - Home now imports `daysUntil` from store.js (dup removed); "You're
    Going" rail labels fixed for its new >7-day range ("in 8 days", not
    "in 1 weeks"). Pre/post-show tap with a missing show falls back to
    Home instead of doing nothing.
  - Verified: `npm run build` clean, web preview boots with zero
    console errors, `npx cap sync ios` done. On-device verification of
    tap-routing + hype card rides the next TestFlight build.

## Open questions / follow-ups

- Hype-card share: v1 is a canvas image share (house style). Could later
  add per-slide story templates.
- Up Next could later show friends also going (needs show_attendees UI).
- 2026-06-11: **Show Day card** (user request: day-of push should open
  real logistics, not just "get ready"):
  - `api.js`: `fetchShowWeather(city, date)` (Open-Meteo geocode +
    daily forecast, keyless/CORS-open, ~15-day horizon, WMO-code →
    emoji/label, session cache), `fetchEventStartTime(artist, venue,
    date)` (TM Discovery localTime, venue fuzzy-match),
    `appleMapsUrl()`, `venuePolicySearchUrl()`.
  - `ShowDetail.jsx`: "Show day" card on upcoming shows — showtime +
    weather chips (best-effort, omit when unresolvable), Directions
    (Apple Maps) + "Bag policy & rules" links. Day-of push deep-links
    here via the existing preshow tap routing. Tracks
    `showday_link_tapped` (link enum only).
  - `tour-alerts/index.ts`: day-of + 1-2-day notification bodies now
    say "Tap for showtime, weather, directions & bag policy" —
    deployed (v13).
  - Verified Open-Meteo endpoints live (Chicago 2026-06-11: code 65,
    80°/67°, 87% rain). Build clean, web boots clean, iOS synced.
