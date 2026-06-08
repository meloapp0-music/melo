# Home-Screen Widget — daily presence users actually want

- Started: 2026-05-22
- Status: planned
- Last updated: 2026-05-22

## Context

User wants Melo on people's home screens "almost every day" so they
remember it. A **home-screen widget** is the right answer to that —
literal daily presence the user *chooses* to place, vs. daily
notifications which get muted as spam. It's the rare re-engagement play
people thank you for instead of disabling.

A widget showing "next show in 3 days," "1 year ago today you saw…", or
a concert streak sits on the home screen permanently and pulls the user
back into the app on tap — without nagging.

## ⚠️ Honest technical reality (read first)

This is the **most native piece of work in Melo.** Everything else is
React/web inside Capacitor. A widget is NOT web — it's:
- **WidgetKit + SwiftUI** — native Swift, a separate **Widget Extension
  target** in the Xcode project.
- **An App Group** shared container — the widget can't run the web app
  or hit Supabase directly on every refresh; the Capacitor app must
  write the data the widget needs into shared storage
  (`UserDefaults(suiteName:)` or a shared file), and the SwiftUI widget
  reads from there.
- **A JS→native bridge** — a small Capacitor plugin (or custom native
  code) so the web app can write `nextShow` / `streak` / `onThisDay`
  into the App Group when data changes. (Community plugins like
  `capacitor-widgetsbridge-plugin` exist; evaluate vs. a tiny custom
  bridge.)
- **Entitlements + provisioning** — App Group capability added to both
  the app and the widget target.

So this is a genuine native mini-project, a different skill area than
the rest of the codebase. Worth doing for the retention payoff, but
**budget real time** — or consider a native-iOS contractor for the
Swift/WidgetKit portion while we wire the data on the web side.

## Plan (phased)

### Data flow (shared across all phases)
1. The Capacitor app computes the widget payload from existing data
   (`shows`): next Going show, current streak, an on-this-day match,
   total-shows stat.
2. On meaningful change (app foreground/background, after logging a
   show), the app writes a small JSON blob into the App Group via the
   bridge.
3. The SwiftUI widget reads that blob on its WidgetKit timeline refresh
   and renders. (Widgets refresh on a schedule, not real-time — so the
   data is "last written by the app," which is fine.)

### Phase 1 — Next-show countdown (the MVP)
- Small + medium widget: "**Bleachers · in 3 days**" with venue + the
  Melo mark. Pulls the soonest Going show.
- Empty state: "No upcoming shows — tap to discover" → deep-links into
  the app's Discover page.
- This alone is strong daily presence for anyone with tickets.

### Phase 2 — On-this-day memory
- "**1 year ago today**: Goose at Red Rocks — you rated it 10." Reuses
  the time-capsule logic (`2026-05-13-time-capsule-notifications.md`).
- Emotional, rotates daily, pairs perfectly with the countdown.

### Phase 3 — Streak / stats + widget options
- A streak widget (🔥 months) and/or a stats widget (shows this year,
  cities, songs). Let the user pick which widget they add.
- Optional lock-screen widget (iOS 16+) for the countdown.

### Deep linking
- Tapping the widget opens the relevant in-app screen (next show →
  ShowDetail; on-this-day → that show; empty → Discover). Needs a
  `melo://` URL scheme handled in the app (the push deep-link plumbing
  may already cover part of this — reuse it).

## Schema
**None.** All data derives from existing `shows`. The only new storage
is the App Group shared container (device-local, not a DB).

## Critical files / surfaces
- **New Xcode target:** Widget Extension (Swift/SwiftUI) under `ios/`.
- **App Group entitlement** on the app + widget targets.
- **New bridge:** a Capacitor plugin call (or `capacitor-widgetsbridge-plugin`)
  to write the widget payload; called from `src/web/App.jsx` (on data
  load / background) with a small `widgetPayload(shows)` helper in
  `src/web/lib/`.
- **Deep-link handling** for `melo://show/{id}` / `melo://discover`.

## Verification
1. Add the Melo widget from the home-screen gallery → it shows your next
   Going show with a correct countdown.
2. Log/change a show → background the app → widget updates on next
   refresh.
3. No upcoming shows → widget shows the discover prompt; tapping opens
   Discover.
4. On-this-day: with a show dated exactly N years ago, the memory widget
   surfaces it.
5. Tapping each widget deep-links to the right screen.

## Open questions / follow-ups
- **Build vs. contract the Swift.** This is the one area where hiring a
  few hours of native-iOS help may be worth it — the data side we can do
  on the web team; the WidgetKit/SwiftUI + App Group + provisioning is
  specialized.
- **Refresh budget.** WidgetKit limits refresh frequency; countdowns
  can compute relative time client-side in the widget from a stored
  date, so they stay accurate between refreshes.
- **Android.** Capacitor Android widgets are a separate effort; out of
  scope (Melo is iOS-only).
- **Cross-links:** `2026-05-13-time-capsule-notifications.md` (shares
  on-this-day logic), `2026-05-22-notification-expansion.md` (the
  notification side of daily presence — the widget is the *non*-spammy
  counterpart), `2026-05-21-trip-discovery.md` (empty-state → Discover).
