# Product Analytics — Instrument Melo

- Started: 2026-05-15
- Status: in-progress (scoping into v1.0.5)
- Last updated: 2026-05-15

## Context

Melo has shipped through v1.0.4 and is acquiring users (App Store +
Reddit + social). But there is **zero product instrumentation** — no
PostHog, Mixpanel, Amplitude, or any event tracking. Confirmed
2026-05-15: no analytics package in `package.json`, no telemetry
anywhere in `src/`.

This means we cannot answer the most important question for the app:
**are people actually using it?** Specifically, we are blind to:

- How many users open the app in a given week
- How many users log a show vs. download-and-bounce
- Where users drop off in the LogShow flow
- Whether anyone reaches Wrapped
- Retention curves — do day-1 users return on day 7 / day 30
- Which features get touched (venue links, wishlist, festivals)

Every engagement/retention decision right now is made on vibes. Every
acquisition tactic (business cards, Reddit, TikTok) pours users into a
bucket we cannot see inside. Instrumentation is the prerequisite for
all retention work — it must land before we invest in activation or
re-engagement features.

Concert trackers are inherently **low-frequency** apps (users attend
shows a handful of times a year). So the metrics that matter are NOT
DAU-style — they are funnel + pulse:

- **Logging pulse** — when a user goes to a show, do they log it?
- **Re-engagement pulse** — between shows, what brings them back?
- **Annual anchor** — does the user return for Wrapped?

## Plan

Smallest shape that gives real visibility. Targeted for **v1.0.5**.

### Tool choice — PostHog

- Free tier ~1M events/month — Melo is nowhere near that ceiling.
- `posthog-js` works fine inside the Capacitor web wrapper.
- Standard for indie/solo apps; product analytics + funnels + retention
  cohorts in one dashboard, no separate BI tool needed.
- EU Cloud region available if we want data residency simplicity.

### Architecture — a wrapper module, not scattered calls

Per `CLAUDE.md`, integration lives in a single lib module so PostHog
calls are never sprinkled across components.

- **New `src/web/lib/analytics.js`** — thin wrapper exposing:
  - `initAnalytics()` — called once at app boot
  - `track(event, props)` — emit an event
  - `identify(userId)` — tie events to a Supabase user id after auth
  - `resetAnalytics()` — called on sign-out
- Components/pages import `track` from this module only. They never
  import `posthog-js` directly. Mirrors the `src/web/lib/db/*` rule.

### Env + config

- New env vars in `.env.example`: `VITE_POSTHOG_KEY`,
  `VITE_POSTHOG_HOST`.
- The PostHog project key is safe to ship in the bundle (like the
  Supabase anon key) — it is write-only ingestion.
- `initAnalytics()` is a no-op if the key is absent, so local dev and
  forks without a key still run clean.

### Events to track (v1 — keep it ~10)

Resist the urge to track everything. The funnel below is enough to see
the whole story:

| Event | Fired when | Why |
|---|---|---|
| `app_opened` | app boot / foreground | active users, retention base |
| `signup_started` | SignUp screen mounted | top of activation funnel |
| `signup_completed` | account created | activation funnel |
| `otp_verified` | email OTP confirmed | drop-off at the MFA step |
| `show_log_started` | LogShow opened | logging funnel top |
| `show_logged` | a show successfully saved | the core action |
| `show_log_abandoned` | LogShow closed without save | where logging breaks |
| `wrapped_opened` | Wrapped entered | annual-anchor reach |
| `wishlist_added` | show added to Wishlist | between-show engagement |
| `venue_link_tapped` | venue page pill tapped | feature-use signal |

Each `show_logged` should carry non-PII props: `status`
(attended/going/wishlist), `has_setlist`, `has_photos`, `score_set`.
Never attach artist names, venue names, notes, or buddy names — those
are user content, not telemetry.

### Privacy

- **Disable PostHog autocapture** of input values — concert notes,
  venue, buddies are personal. Track only explicit named events.
- **No session recording** in v1 (revisit later, opt-in only if ever).
- Mask all `input`/`textarea` values via PostHog config.
- **Privacy Policy update** — add an "Analytics" clause to
  `marketing/privacy.html` and the in-app Legal page disclosing
  PostHog as a processor + what is collected (usage events, no
  content). Required before this ships to the App Store.
- Identify by Supabase `user_id` only — no email, no name sent to
  PostHog.

### Funnels to build in the PostHog dashboard (no code)

Once events flow, configure these in PostHog's UI:

1. **Activation funnel**: `app_opened` → `signup_completed` →
   `show_logged` (first) → 5× `show_logged`.
2. **Logging funnel**: `show_log_started` → `show_logged` (the inverse
   surfaces `show_log_abandoned` rate).
3. **Retention cohort**: weekly retention keyed on `app_opened`.
4. **Wrapped reach**: % of users with ≥3 shows who fire
   `wrapped_opened`.

## Phases within v1.0.5

1. **Package + wrapper.** Add `posthog-js`, create
   `src/web/lib/analytics.js`, wire `initAnalytics()` at app boot and
   `identify` / `resetAnalytics` into the auth lifecycle. ~half day.
2. **Event instrumentation.** Add the ~10 `track()` calls at the sites
   listed above. ~half day.
3. **Privacy copy.** Analytics clause in `privacy.html` + Legal page.
   ~1 hour.
4. **Dashboard setup.** Build the 4 funnels/cohorts in PostHog. No
   code — done after events are confirmed flowing. ~1 hour.

Total: ~1 focused day of work. Bundles cleanly into the existing
v1.0.5 scope (★ Favorite + trimmed vibes + data export).

## Changes made

- 2026-05-15: Initiative created. PostHog selected; scoped into
  v1.0.5.
- 2026-05-15: Phase 1 + 2 implemented.
  - Installed `posthog-js`.
  - New `src/web/lib/analytics.js` — wrapper exposing `initAnalytics`,
    `track`, `identify`, `resetAnalytics`. Autocapture off, session
    recording off, localStorage persistence, no-op when key absent.
  - `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST` added to `.env.example`
    and `.env.local` (US Cloud project, key `phc_pBNsx…`).
  - `main.jsx` — `initAnalytics()` + `app_opened` at boot.
  - `App.jsx` — `identify(userId)` on sign-in, `resetAnalytics()` on
    sign-out, via a `session.status` effect.
  - Events instrumented: `app_opened` (main), `signup_started` +
    `signup_completed` (SignUp), `otp_verified` (OtpEntry),
    `show_log_started` + `show_log_abandoned` + `show_logged`
    (LogShow), `wrapped_opened` (Wrapped), `venue_link_tapped`
    (ShowDetail).
  - Scoping decision: dropped the separate `wishlist_added` event —
    `show_logged` carries a `status` property (attended/going/
    wishlist), so wishlist adds are query-able without a second
    event and without double-counting.
  - `npm run build` passes clean.
- 2026-05-15: Verified live — events confirmed flowing into the
  PostHog project (US Cloud, project 425988) from a dev session.
- 2026-05-15: Phase 3 (privacy copy) done.
  - `src/web/pages/Legal.jsx` — removed the now-false "we do not
    collect analytics" claim; added a "Usage analytics" section
    disclosing PostHog (anonymous events, no content, internal ID
    only, no screen recording).
  - `marketing/privacy.html` — added PostHog to the third-party
    services list, added a matching "Usage analytics" section,
    bumped "Last updated" to 2026-05-15.
  - Still pending: PostHog dashboard funnels (Phase 4) — done in the
    PostHog UI once real user data accrues; Apple App Privacy label
    update ("Usage Data → Product Interaction") in App Store Connect
    at v1.0.5 submission.

## Open questions / follow-ups

- **PostHog region** — US vs EU Cloud. EU simplifies any future
  GDPR story; US is lower latency for the current user base. Lean US
  for now; revisit if Melo gets meaningful EU users.
- **Apple "App Privacy" nutrition label.** Adding analytics means the
  App Store privacy label must be updated to declare "Usage Data →
  Product Interaction" (not linked to identity, not used for
  tracking). Must be done in App Store Connect before the v1.0.5
  build is submitted.
- **First-session backfill metric.** Once activation data exists, the
  next initiative is an onboarding flow that pushes new users to
  backfill past shows — analytics will tell us how bad the current
  0-show drop-off is and quantify the fix.
- **Cross-link with `2026-05-13-time-capsule-notifications.md`** —
  re-engagement push effectiveness should be measured via a
  `capsule_push_opened` event once that feature ships. Add to the
  event list in v1.0.6.
- **Revenue events later.** When a paid tier (Melo+) ships, add
  purchase funnel events. Out of scope until pricing exists.
