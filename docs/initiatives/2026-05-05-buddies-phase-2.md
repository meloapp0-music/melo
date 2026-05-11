# Buddies Phase 2 — Real User-Linked Buddies

- Started: 2026-05-05
- Status: planned (Phase 2a + 2b targeted for v1.2, ~2-3 weeks — shifted from v1.1 to make room for Wishlist Watching as the v1.1 headline)
- Last updated: 2026-05-06

## Context

Today, "buddies" in Melo are free-text labels stored in `shows.buddies[]`.
You can type "Alex" on a show, and the Buddies tab aggregates the unique
strings across your library. That was the right Phase 1 shape — it shipped,
it works, and it doesn't require the other person to be a Melo user.

But it's a glass ceiling on the social experience. The user explicitly
asked (2026-05-05):

> "i also want the buddies section to be more interactive, you should be
> able to add a buddie based on if they are a user and then see what shows
> they are going to/what they rated/how they felt about past shows"

This initiative is the bridge from "string label" → "real Melo account."
Once buddies are real users, you unlock:

- Seeing which of your buddies is going to a specific upcoming show, and
  where they're sitting (links to the social-layer initiative)
- Seeing a buddy's past shows, ratings, and the "How did it feel?" vibe
- Mutual confirmation when both people log the same show
- Buddy activity in Wrapped ("You went to 7 shows with Sarah this year")

This is the canonical Phase 2 of `2026-04-17-backend-and-social.md`. Schema
groundwork was sketched there but never built.

## Plan

Phased so each phase is shippable on its own. Don't try to ship the whole
thing in one TestFlight build.

### Phase 2a — Friendships table + username search

- New migration `0002_friendships.sql`:
  - `friendships(user_a, user_b, status, created_at)` with `user_a < user_b`
    canonical-pair invariant, RLS = either party can read, only requester
    can insert, both can delete
  - `friendship_requests(from_user, to_user, message, created_at)` for the
    pending state before acceptance
- `src/web/lib/db/friendships.js` — `requestFriend(handle)`, `acceptFriend`,
  `declineFriend`, `removeFriend`, `listFriends`, `listIncomingRequests`,
  `listOutgoingRequests`
- Username search: index on `profiles.username`, `searchUsers(q)` does
  `ilike '%q%'` capped at 20 results, filtered to public profiles
- New `BuddySearch.jsx` component — used in Buddies header "+ Add" modal
  and in LogShow's buddy chip input

### Phase 2b — Linked buddy on a show

- Schema: `show_attendees(show_id, user_id, confirmed_at)` — one row per
  user-attended-this-show. RLS = friends + show owner can read.
- Migration logic: when User A logs a show and tags `@sarah` (a real
  friend), insert an `show_attendees` row with `confirmed_at = NULL`.
  When User Sarah logs the same show, auto-merge and set `confirmed_at`.
- The existing `shows.buddies[]` text array stays — it's the fallback when
  a buddy isn't a Melo user. We migrate strings → user_ids opportunistically
  ("This buddy 'Sarah' — link her to @sarah?")
- Buddy chip in UI: `@handle` chips render with avatar + tap-to-profile.
  String chips render as today.

### Phase 2c — Buddy profile view

- New page `BuddyProfile.jsx` (or generalize `Profile.jsx` into
  `UserProfileView` per the original plan)
- Shows: their public stats (total shows, top artists, top venues), their
  recent rated shows with score + vibe, "shows you've been to together"
- Privacy: profile is friends-only by default. Public-by-handle is a
  later toggle.

### Phase 2d — Going buddies + seat sharing

- On any "Going" or upcoming show, surface "N buddies going" with avatars
- Tapping → list of friends going to this show
- New `going_seats(show_id, user_id, section, row, seat, note)` table,
  visible to friends-also-going only. Optional: blank by default.
- This is the seam where the **social-layer** initiative picks up
  (group chats, plans, meet-ups for that show)

### Phase 2e — Buddy activity in Wrapped

- New Wrapped slide: "Your concert crew" — top 3 buddies by show count
- "You went to N shows together this year" stat
- Reuses the same animated reveal pattern as existing Wrapped slides

## Changes made

- 2026-05-06: Re-prioritized in response to user feedback. Phase 2a
  (friendships table) + Phase 2b (linked buddy on show) pulled forward
  to v1.1, ~2-3 weeks of work. Phase 2a will ship alongside a basic
  `blocks` table + "Block this user" action — that's the floor for any
  user-search feature shipping to the App Store, and it's hours of
  extra work, not weeks. Phase 2c (buddy profile view), 2d (going +
  seats), 2e (Wrapped) follow in v1.2.

## Open questions / follow-ups

- **Username uniqueness across handle changes.** If Sarah changes her
  handle from `@sarah_b` to `@sarahb`, what happens to existing buddy
  links? (Answer: store `user_id` not handle in `show_attendees`. Display
  layer resolves to current handle.)
- **Privacy default.** Should new profiles be friends-only or
  link-only-by-handle? Lean friends-only.
- **Blocking + abuse.** Need a `blocks` table before any buddy search ships
  to the App Store. Bare minimum: blocked users don't appear in search,
  can't request friendship, can't see your shows.
- **Friend requests via show tagging.** If User A tags `@sarah` on a show
  but they aren't friends yet, does that send a friend request, or just
  silently fail? Probably: shows a "Send friend request to @sarah?" prompt.
- **String → user migration.** Auto-suggest "looks like 'Sarah' might be
  @sarahb — link?" or always require manual? Lean manual to avoid wrong
  links.
- **Cross-link with `2026-05-05-social-layer.md`** — this initiative ends
  at "see who's going + their seat." The communication layer is its own
  doc.
- **Cross-link with `2026-05-05-wrapped-map-slides.md`** — buddy data is
  the natural input for a future "you and Sarah's overlapping map" slide.
