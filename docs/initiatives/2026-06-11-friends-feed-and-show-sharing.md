# Friends feed (Beli-style) + single-show share cards + friend-shows leak fix

- Started: 2026-06-11
- Status: shipped (next build)
- Last updated: 2026-06-11

## Context

Three user requests after the first real friend (Claire) started using
the app alongside Aidan (2026-06-11, verbatim intent):

1. **Share individual concert cards** — "send my Mumford & Sons show to
   anyone and they can … see what it was like, decide if they want to
   get tickets, and also connect."
2. **A Beli-style friends feed on Home** — "Aidan and Claire went to
   Mumford and Sons … when users open the app, the home screen not just
   has your stats but also the feed of your friends."
3. **Bug:** Claire's Mumford show appeared in Aidan's own home page
   (duplicate Mumford cards). Friends' shows should live in the feed +
   their profile, never mixed into your own Recent Shows.

Root cause of (3): `listMyShows()` selected from `shows` with **no
user_id filter**. Pre-0010 RLS made that equivalent to "my shows"; the
0010 friend-read policy (`can_view_shows`) widened what the select
returns, so accepted friends' visible shows leaked into the user's own
`shows` state — duplicating Home cards and inflating stats/Wrapped.

## Plan

- Fix the leak (`.eq('user_id', me)` via the locally-cached session).
- `FriendsFeed` on Home: friends' shows ordered by `created_at`
  (activity, not concert date), "went to / is going to" verbs, score,
  "🎸 You were there too" overlap badge, tap → friend profile.
- `renderShowCard`/`shareShowCard` in shareCard.js + a "📣 Share this
  show" button on ShowDetail — status-aware copy (I WAS THERE / I'M
  GOING + rating), footer QR install loop.
- Deep "tag yourself from a shared card" needs universal links
  (melo.show → app) — deferred, see follow-ups.

## Changes made

- 2026-06-11: **Leak fix:** `listMyShows()` now scopes to the signed-in
  user via `getSession()` (locally cached — `getUser()` would add a
  boot-time network hop whose transient failure strands the splash
  screen). Verified no other unscoped `from('shows')` selects exist.
- 2026-06-11: **Friends feed:** `listFriendsShows(friendIds, limit)` in
  db/shows.js (RLS enforces profile-level visibility; per-show
  `visibility` column is NOT consulted by any policy — comment fixed to
  say so). New `components/FriendsFeed.jsx` on Home (after the Wrapped
  banner): session cache (no layout pop-in on remount), max 4 items per
  friend (bulk imports can't monopolize), wishlist rows excluded,
  refetches whenever the profile overlay closes (block/unfriend from a
  feed-opened profile drops their items immediately — `selectedUserId`
  added to AppContext), natural accessible names. Feed card: avatar,
  "Claire went to Mumford & Sons", venue · date, gradient score,
  together badge, artist thumb.
- 2026-06-11: **Show share card:** `renderShowCard`/`shareShowCard`
  (canvas, house style, footer QR; status via `getShowStatus`, rating
  block for attended+scored). "📣 Share this show" button on ShowDetail
  (all statuses); `show_card_shared` tracked only on completed shares
  (share-sheet cancel returns false). `wrapCentered` gained a
  `maxLines` ellipsis clamp; artist/venue clamped on show + hype cards
  so runaway text can never overdraw the QR plate, plus a maxY guard on
  the rating block.
- 2026-06-11: 3-lens adversarial review (12 findings) applied — the
  items above incorporate them. Build clean, web boots clean, iOS
  synced.

## Open questions / follow-ups

- **Universal links** (melo.show → app) so a shared card can deep-link
  recipients straight to the show in-app: tag-yourself (writes
  show_attendees), one-tap friend request, ticket CTA. The QR covers
  install; links cover the rest. Biggest unlock for request #1.
- **Per-show visibility:** the `shows.visibility` column exists but no
  RLS policy consults it — when per-show privacy UI ships, extend the
  "shows friend read" policy (see review note in 0010 follow-up).
- **UserProfileView upcoming section:** the feed shows "is going to"
  items but the profile lists attended only — add an Upcoming section
  so tapped going-items are findable (and fix the "they keep their
  history private" empty-state copy when only non-attended shows are
  visible).
- Feed could later merge show_attendees ("Aidan AND Claire went to…"
  as one item) and support reactions/comments (social-layer phase).
