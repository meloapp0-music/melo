# Notifications System — Tours, Tickets, Festivals

- Started: 2026-05-05
- Status: planned (inbox + lineup-watcher targeted for v1.1, ~1 week)
- Last updated: 2026-05-06

## Context

Asked by user (2026-05-05):

> "users should get notified everytime a tour gets announced, everytime
> ticket prices drop, everytime an artist they like gets announced for a
> festival, what the ticket prices are, what the best value is for ticket
> prices..."

Today, Melo has push notification plumbing already (`tour-alerts` daily
cron, APNs via .p8 — see `2026-04-20-pre-launch-sprint.md`). It currently
fires only for "new tour announcement for an artist you've rated highly."

This initiative is the full notification matrix:

| Trigger | Source | Cadence |
|---|---|---|
| New tour announced for liked artist | Ticketmaster + Bandsintown | Daily (existing) |
| Ticket price dropped on a Going show | Ticketmaster Listing API or SeatGeek | 4× per day |
| Artist you like added to a festival lineup | Festival lineup polling | Daily |
| Festival lineup announced (initial drop) | Festival data feed | Daily |
| Best-value ticket alert | Price + section data, see below | 2× per day |
| Buddy is going to a show you're going to | `show_attendees` join | Real-time |
| Friend request | `friendship_requests` insert | Real-time |
| Buddy logged a show you also attended | `show_attendees` join | Real-time |

Cross-links: half of these (the social ones) come from
`2026-05-05-buddies-phase-2.md`. The "best value" surface bridges to
`2026-05-05-recommendations.md`.

## Plan

### Schema

New tables (migration `0003_notifications.sql`):

- `notification_subscriptions(user_id, kind, target_id, created_at)` —
  e.g. `kind=ticket_drop`, `target_id=show_id` means "alert me on price
  drops for this show." For "tour announce for artist X," `kind=tour_announce`,
  `target_id=artist_id`. Auto-subscribed on relevant user actions
  (logged a Going show → subscribe to ticket_drop on it; rated artist
  ≥7 → subscribe to tour_announce on them).
- `notification_log(user_id, kind, target_id, payload, sent_at, read_at)` —
  history; one row per notification fired. Used for in-app inbox.
- `price_history(show_id, observed_at, min_price, max_price, source)` —
  feeds price-drop detection.

### Edge Functions

Existing: `tour-alerts` (daily). Add:

- `price-poller` (4× daily) — polls Ticketmaster/SeatGeek for all Going
  shows in `show_attendees`, writes `price_history`, fires push if
  `min_price` dropped >10% from rolling 7-day median
- `lineup-watcher` (daily) — fetches festival lineups, diffs against
  yesterday's snapshot, fires push for any subscribed artist that
  appears
- `buddy-event-fanout` (DB trigger or queue worker) — on
  `show_attendees` insert, find friends also attending and fan out
  notifications
- `value-scorer` (2× daily) — runs the best-value calculation (below)
  and fires push when a value flag flips on

### Best value calculation

Subjective term, but here's a defensible definition:

```
value_score(ticket) =
   0.50 × (1 / price_in_user_currency)            // cheaper = better
 + 0.20 × your_artist_fit_score                   // recommendations.md
 + 0.15 × venue_quality_signal                    // your past venue ratings
 + 0.10 × seat_quality(section, row)              // GA = max, nosebleeds = low
 + 0.05 × scarcity_factor                         // % capacity remaining
```

Surface: "Best Value" badge appears on tickets in the in-app ticket browser
when `value_score` is in the top decile for that show. Push fires when a
new listing crosses into top-decile.

Honest caveat: ticket-listing APIs (StubHub, SeatGeek, Vivid) require
partnership agreements that are non-trivial. Phase 1 punts on listing-
level data and just uses Ticketmaster face-value pricing.

### Notification surfaces

- **Push (APNs)** — already plumbed. Toggle per-kind in Settings.
- **In-app inbox** — new `Notifications.jsx` page. Bell icon on Home
  (badge with unread count). Tap → list of recent notifications grouped
  by kind.
- **Email** — out of scope for v1 of this initiative. Future: digest
  emails for power users.

### Settings UI

Settings → Notifications gets a per-kind toggle list:

```
Tours of artists you like        ●━━
Ticket price drops               ●━━
Festival lineup adds             ●━━
Buddy going to your show         ●━━
Buddy logged a shared show       ●━━
Friend requests                  ●━━
Best value alerts                ●━━
```

Default: all on except "Best value" (off until the feature is solid).

## Phasing

- **Phase 1 (v1.2):** Schema + in-app inbox + extend existing
  `tour-alerts` with festival-lineup additions. Ship the inbox first
  before adding more triggers.
- **Phase 2 (v1.3):** `price-poller` Edge Function with face-value
  Ticketmaster data. No third-party listings yet.
- **Phase 3 (v1.4):** `buddy-event-fanout` after
  `2026-05-05-buddies-phase-2.md` Phase 2c ships.
- **Phase 4 (v1.5+):** Best-value scorer with real listing APIs once
  partnerships are in place.

## Changes made

- 2026-05-06: Re-prioritized in response to user feedback. In-app
  inbox + `lineup-watcher` Edge Function pulled forward to v1.1
  (extends existing `tour-alerts` cron). Price-poller follows in v1.2
  with face-value Ticketmaster data only. Buddy-event fanout waits
  on `2026-05-05-buddies-phase-2.md` Phase 2c. Best-value scorer stays
  v1.4+ — that one genuinely needs partnership data we don't have.

## Open questions / follow-ups

- **Subscription auto-management.** When a user "unlikes" an artist
  (rates them <5 or removes the rating), should the `tour_announce`
  subscription auto-remove? Lean: keep it for 6 months, then expire.
- **Quiet hours.** APNs respects iOS Focus modes, but we should still
  bucket non-urgent pushes (lineup adds) to a 9am–9pm window in user's
  timezone. Urgent (price drop on a Going show) sends immediately.
- **Notification fatigue.** Cap at 3 per day per user across all kinds
  unless user has flipped on "all alerts." Otherwise we get uninstalled.
- **Price-drop noise.** A 10% drop threshold is arbitrary. Tune with
  real data. Could also be configurable per-show ("alert me at $X or
  below").
- **APNs cost.** Free for now. Worth checking if we need to budget
  anything for high-volume notification fanout in Phase 3.
- **Cross-link with `2026-05-05-recommendations.md`** — `value_score`
  reuses `your_artist_fit_score` from the taste profile.
- **Cross-link with `2026-05-05-buddies-phase-2.md`** — buddy events
  block on Phase 2c shipping.
- **Cross-link with `2026-04-20-make-it-legal.md`** — push notification
  category list needs a Privacy Policy update (data we use to decide
  who gets which alert).
