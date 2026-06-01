# Cold-Start & Activation — getting new users to history fast

- Started: 2026-05-22
- Status: planned (v1.2 — build AFTER v1.1 ships, informed by funnel data)
- Last updated: 2026-05-22

## Context

A concert tracker is empty and useless until you log shows. New user
signs up → blank app → no Wrapped, no alerts (nothing to watch), no
recommendations (no taste signal) → churn. Every feature Melo has built
(Wrapped, loved-artist + city alerts, time-capsule, pre-show reminders,
recommendations) **requires history to work.** The new user gets none
of it. This is the #1 thing that kills apps like this.

The user also asked (2026-05-22) to "simplify the past-shows log
system" — ideally by syncing a calendar or Ticketmaster account to
auto-find past shows. Feasibility findings below.

**Build AFTER v1.1 ships** — PostHog (already live) will show where new
users actually drop off, so the activation flow is built with data, not
guesses. Cold-start also only pays off at the moment of acquisition,
which shipping + marketing creates.

## Feasibility of "auto-find my past shows"

- **Ticketmaster account/order sync — NOT feasible.** TM offers no
  public API for reading a user's purchase/order history. The Discovery
  API (what Melo uses) searches events; it can't read someone's
  account. No third-party "connect your TM account." Dead end without a
  partnership that doesn't exist for this use case.
- **Calendar sync — feasible; parts already exist.**
  `@ebarooni/capacitor-calendar` is installed and `ImportFromCalendar.jsx`
  is a half-built (currently hidden) page. Scan past calendar events for
  concert-like signals (known venue names, artist names, "tickets,"
  "tour") → surface as "Did you go to these? Tap to log." Imperfect
  accuracy but a real assist; infra exists.
- **Email confirmation parsing — powerful but heavy; deferred.** Most
  real concert history lives in ticket-confirmation emails (TM, AXS,
  SeatGeek, DICE). Parsing them reconstructs years of shows — but needs
  Gmail OAuth + Google's sensitive-scope verification (months) + a
  serious privacy burden. Someday-maybe, not near-term.

## Plan (v1.2)

### 1. Activation onboarding — the centerpiece (highest leverage)
On first run after signup, prompt: **"Add a few concerts you've been
to."** Drop the user straight into the **festival/past-show finder**
(already shipped v1.0.7) — type city + year → tap shows → batch-log.
A user who backfills 5 shows is hooked; a user who logs 0 is gone.
Cheap because the finder already exists; this is just the guided entry.

### 2. Calendar import (revive `ImportFromCalendar.jsx`)
Un-hide + improve the existing page. Read past calendar events, match
concert-like ones against venue/artist signals, present as one-tap log
candidates. Offer it as an optional step in onboarding ("Find shows
from your calendar"). Reuses the installed calendar plugin.

### 3. Cold-start content — "popular & upcoming near you"
When history is thin, the app shouldn't look empty. Add a default
"trending / upcoming near you" view (non-personalized, just Ticketmaster
city events) so a brand-new user sees life. The Discover page already
does city search — this is a default populated state. Personalized
recommendations come later, once a taste profile exists (ties into
`2026-05-05-recommendations.md`).

### 4. New-user re-engagement reminders
Low-history users don't get the loved-artist/city/time-capsule pushes
(nothing to watch yet). Give them a different nudge: "Add your first
show 🎶" a day or two after signup if they've logged nothing. Extends
the `tour-alerts` cron with a `welcome_nudge` kind. Goes silent once
they have history (the personalized alerts take over).

## Open questions / follow-ups

- **Onboarding length** — backfill prompt must be skippable; forcing it
  pre-empts the "aha." Lead with it, don't gate on it.
- **Calendar matching accuracy** — start with a conservative
  venue/keyword match; show candidates, never auto-log.
- **Measure first** — use the PostHog activation funnel (app_opened →
  signup_completed → first show_logged → 5 shows) to confirm where the
  drop is before building, and to prove the fix worked.
- **Cross-links:** `2026-05-21-festival-past-show-finder.md` (the tool
  onboarding funnels into), `2026-05-15-product-analytics.md` (the
  funnel that informs this), `2026-05-05-recommendations.md` (personalized
  recs once history exists), `2026-05-13-time-capsule-notifications.md`
  + `2026-05-22-artist-in-your-city-alerts.md` (the re-engagement layer
  that kicks in once a user has history).
