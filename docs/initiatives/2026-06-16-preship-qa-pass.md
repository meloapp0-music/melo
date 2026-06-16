# Pre-ship QA pass (before App Store build 18/19)

- Started: 2026-06-16
- Status: shipped (next build)
- Last updated: 2026-06-16

## Context

Before pushing the social-layer release to the App Store, ran a
6-agent QA sweep (layout/safe-area, empty/loading/error states, recent-
feature correctness, design consistency, App Store review risk, data/
RLS). 28 findings — 4 blockers, 18 should-fix, 6 nits. Fixed all
blockers + the high-value should-fixes; a regression review of the
batch came back clean.

## Changes made (2026-06-16)

Blockers:
- **friendship forge (RLS)** — migration `0012_friendship_guard.sql`:
  0010's "friendships accept" UPDATE policy had no WITH CHECK, so the
  non-requester could re-target a pending row into an accepted
  friendship with an arbitrary victim (then read their friends-only
  data). Added an immutability trigger (user_a/user_b/requested_by can't
  change on UPDATE) + a matching WITH CHECK. **NEEDS: apply 0012.**
- **cold-start infinite splash** — App.jsx now shows a "Couldn't
  connect" error screen with Retry (loadError/loadRetry) instead of
  spinning forever when the initial fetch fails.
- **friends-feed cross-account leak** — module-level `feedCache` is now
  owner-keyed + `resetFeedCache()` is called on sign-out, so account A's
  feed can't flash to account B on the same device.
- **no EULA/terms at sign-up** (Guideline 1.2/5.1.1) — added an
  agreement line on SignUp linking to the live melo.show/terms +
  /privacy.

Should-fix:
- Safe-area/nav-bar cluster (same class as the Profile fix): MyShows &
  ConcertMap headers (hardcoded 60px → safe-area), ConcertMap map height
  now reserves the nav bar, Rankings page-top + battle-hero pull-up,
  UserProfileView ×/⋮ buttons (were pushed ~60px down by a safe-area
  offset under a relative header).
- Legal: removed the user-visible "Draft — pending legal review"
  banners; added a "Community standards & objectionable content"
  zero-tolerance clause to the Terms (the textual half of Guideline
  1.2).
- Unblock UI: a "Blocked accounts" section in Settings (block was a
  one-way trap; the db fns already existed).
- Find-friends prompt on Home when you have zero friends (the social
  feature was invisible otherwise).
- Friend-profile empty-state copy now reflects outgoing/incoming
  requests.
- "Share this show" gated to your OWN shows (sharing a friend's show
  misattributed their rating as yours).
- Rate-prompt no longer re-fires after "Rate it now" → cancel.
- Profile avatar falls back to the Melo logo on a 404 (was a
  broken-image icon).
- Feed: recency timestamp no longer truncated by long venue names;
  unified the two "going/added" greens into a single `--green` token.

## Deferred (acceptable for this ship)
- Wrapped "So Far" degenerate slides for a 1-show year (secondary
  surface; gate slides — fast-follow).
- Feed counts don't live-refresh after interacting via ShowDetail.
- QuickLog/ShowComparison sheet bottoms lack safe-area (minor).
- show-photos bucket is public-read (URLs are RLS-gated, low risk).
- Dead post-redesign feed CSS; mixed curly/straight apostrophes.
- ImportFromCalendar layout (page is unreachable in v1).

## Verification
Build clean, web boots clean (no console errors), sign-up agreement +
links verified rendering to the live pages, regression review of the
full batch returned no regressions, iOS synced.
