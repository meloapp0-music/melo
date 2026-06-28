---
name: friends-feed-and-richer-profiles
description: A dedicated full friends-feed page (the Home feed is only a 20-item preview) + friend profiles that show their UPCOMING/Going shows, not just past. Both reuse existing friend-read RLS. Planned for the next version.
type: project
---

# Friends Feed (full page) + Richer Friend Profiles

- Started: 2026-06-27
- Status: planned
- Last updated: 2026-06-27

## Context
Two gaps the user flagged for the next version (deepening the social layer, which is
Melo's wedge vs. Showgoer):

1. **The friends feed only exists as a Home preview.** `FriendsFeed.jsx` caps at
   `MAX_ITEMS = 20` (+ `MAX_RECAPS = 2`) — it's a teaser, not a place you can scroll.
   Users want an **entire feed section** to actually browse friends' activity.
2. **Friend profiles only show PAST shows.** `pages/UserProfileView.jsx` loads all of a
   friend's shows via `listUserShows` but filters to `isAttended` (line 40) and renders
   only `theirAttended`. So you can't see **what shows a friend is going to** — which is
   one of the strongest social hooks ("Claire's going to Goose next month → I'll grab a
   ticket"). Note the upcoming data is **already loaded**, just not displayed.

## Plan
- **Full friends-feed page** — reuse the existing `FriendsFeed` item rendering, but
  uncapped + paginated/infinite-scroll, optionally with filters (All / Going / Recaps).
  The Home feed stays a preview and gains a **"See all →"** that opens this page.
  - **Nav placement (decision needed):** the bottom nav is already 5 slots
    (Home/Shows/+/Buddies/Profile). Options: (a) "See all" from Home → full-screen feed
    route (no nav change — *recommended, least disruptive*); (b) add a Feed/Activity tab
    inside the Buddies page (which already has friends/requests/find tabs); (c) a 6th nav
    slot (crowded — avoid).
- **Friend profile: add "Going to" / upcoming section** — in `UserProfileView`, split
  `theirShows` into attended (existing "their shows") and upcoming/Going (new section),
  e.g. `theirShows.filter((s) => !isAttended(s))` sorted by date ascending. Small change;
  the data is already in hand. Ties into [[going-social-loops]] (seeing a friend is going
  → invite / get tickets together).

## Security spine
- Both surfaces reuse the **existing friend-read RLS** (`listUserShows` / the friends-feed
  read path) — no new public surface. ⚠️ Verify the friend-read policy returns a friend's
  **Going/upcoming** rows (not just attended); if it's scoped to attended only, widen it
  deliberately for friends, not the world.

## Open questions / follow-ups
- Pagination strategy for the full feed (cursor by created_at / show date).
- Whether the full feed should include recaps/likes/comments (it already shows co-attendees
  + vibes; keep parity with Home or expand).
- Profile: cap the upcoming list + a "see all their shows" affordance for prolific friends.

## Changes made
- 2026-06-27: Initiative created (idea capture for the next version). No code yet.
