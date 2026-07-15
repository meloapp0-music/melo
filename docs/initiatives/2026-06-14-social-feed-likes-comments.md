# Social layer: reactions, comments, friend-tagging & feed activity

- Started: 2026-06-14
- Status: shipped (next build) — core; two extras deferred (see below)
- Last updated: 2026-06-14

## Context

With real friends on the app, the feed needed to become interactive.
User requests (2026-06-14):
1. Share a show to anyone; they can tag themselves / see it / decide on
   tickets / connect. (Sharing shipped 2026-06-11; "tag yourself" needs
   universal links — still deferred.)
2. Feed shows a friend's shows AND who they're going **with** —
   including friends-of-friends who aren't your friends.
3. **Like + comment** on shows.
4. "Anything else?" → user chose (AskUserQuestion): friends-of-friends
   shown as **tappable, privacy-respecting** profiles; like/comment
   notifications **push + in-app**; and **all** extras (I'm going too,
   quick reactions, milestones, Wrapped-in-feed).

## Changes made

- 2026-06-14: **Migration 0011_social.sql** — `show_reactions`
  (one per user/show; ❤️ = like, other emoji = quick reactions),
  `show_comments` (1–1000 chars), `comment_reports` (moderation).
  `can_view_show_id()` SECURITY DEFINER helper gates every social read/
  write to a show the viewer can actually see. Comments read excludes
  blocked authors (both directions). Widened `show_attendees` read so
  friends who can view a show see its tags (the "going with" line).
- 2026-06-14: **Data layer** — `lib/db/social.js` (setReaction toggle,
  reactionSummary, addComment, listComments, commentCounts,
  deleteComment, reportComment, notifyInteraction);
  `getProfilesByIds` in profiles.js (RLS drops non-discoverable
  non-friends → privacy filter for co-attendees); `attendeesForShows`
  batch + `userId` on the show shape in shows.js.
- 2026-06-14: **notify-interaction Edge Function** (deployed) — push to
  a show's owner on reaction/comment. Authorizes the actor via JWT +
  can_view_shows; self-skip; reactions dedup per (owner,actor,show);
  comments throttled to 1 push / 5 min / (owner,actor,show).
  App.jsx routes `show_reaction` / `show_comment` taps to the show.
- 2026-06-14: **UI** — `ShowSocial` (reactions bar + comments, with
  delete/report/block-aware) on ShowDetail for any viewable show;
  ShowDetail now renders **view-only** for friends' shows (owner-only
  controls + venue-persist gated on `isOwner`). FriendsFeed: tap card →
  open the show (react/comment), avatar/name → profile; co-attendees
  ("with Dave +2", FoF tappable when discoverable, else "+N" anon);
  reaction + comment counts; **"I'm going too"** (dedupes against shows
  you already have). LogShow: **real-friend tagging** (writes
  show_attendees) — the foundation for co-attendees.
- 2026-06-14: **3-lens adversarial review (8 findings) — all fixed**,
  including a **blocker**: tagging let an owner tag *any* user_id and
  0011 would have broadcast it (non-consensual outing). Locked down —
  tagging now requires an **accepted friendship**, and a tagged user
  can untag themselves (RLS). Also fixed: comment-push spam throttle,
  feed "+N" undercount, "I'm going too" duplicates, cross-owner venue
  write on friends' shows, optimistic-delete rollback, self in own
  "with" line.

- 2026-06-14 (later): **Milestones + Wrapped-in-feed shipped** (the two
  deferred extras). `friendsShowStats()` batch-pulls friends' full
  history (RLS-scoped); the feed computes accurate Nth-show ordinals
  (ranked by date+id so same-day shows get unique ordinals) and shows a
  "🎉 Their 50th show!" badge on the milestone show, plus capped (≤2)
  "{name}'s {year} so far · N shows · C cities" recap cards at the top.
  Reviewed (1 should-fix found + fixed: the same-date ordinal collision).

- 2026-06-15: **Feed redesign — photo-first + take + inline like.**
  User felt the feed was "a list of facts, not the experience." Rebuilt
  the card (`feed-card-v2`): the friend's own concert photo as a big
  hero (show-photos bucket is public → loads for friends; falls back to
  artist image, then gradient), rating badge on the photo, a "take" line
  (note snippet + vibe chips), an activity timestamp ("2d"), and a
  **one-tap ❤️ right in the feed** (optimistic, reverts on failure,
  fires notify-interaction) + a comment shortcut. Reviewed (general
  agent) — no bugs; optimistic-like math, stopPropagation, null-safety
  all clean. Old text-row card CSS left as harmless dead rules.

## NEEDS USER ACTION
- **Apply migration 0011** (Supabase dashboard → SQL Editor, paste
  `supabase/migrations/0011_social.sql`, run). Until then, reactions/
  comments error and the feed shows no co-attendees. (Edge function
  already deployed.)
- 2026-07-13: **Grouped "going" cards.** When 2+ friends are going to the SAME
  upcoming show (same artist+date) the feed used to render a stack of near-
  identical "You + <friend> are going to X" cards. They now collapse into one
  group card — "You + Julia + Claire are going to Noah Kahan" — with an
  overlapping avatar cluster (`.feed-avatar-stack`), even when those friends
  aren't friends with each other. `displayItems` memo in `FriendsFeed.jsx` groups
  upcoming-going show items by artist+date (singletons unwrap to today's render);
  attended cards are never merged (each keeps its own review/score). Like/comment
  act on the most-recent friend's row; "I'm going too" still works.

- 2026-07-13: **"Going with" surfaced on the show card.** Tagged co-attendees
  (`show_attendees`, set when logging via `tagAttendee`) were only ever shown in
  the feed's "with …" line — invisible on ShowDetail itself. Now ShowDetail loads
  them (`listAttendees` + `getProfilesByIds`) and shows an up-front orange strip at
  the top of the body: overlapping friend avatars + "Going with Julia & Claire"
  (or "You were there with …" for attended), each avatar tappable to the profile.
  (Follow-up idea: also match friends going to the same artist+date who WEREN'T
  explicitly tagged, like the feed's group card does.)
- 2026-07-13: **"Going with" on Home's Up Next cards.** Each Up Next card already
  had artist/where/date/countdown/Tickets/Details and opened ShowDetail on tap;
  added the missing piece — a "Going with {avatars} Julia & Claire" row (tagged
  co-attendees via `attendeesForShows` + `getProfilesByIds`, batched for the ≤3
  up-next shows).
- 2026-07-13: **Independent match added** (both the Up Next cards AND the
  ShowDetail strip). New `friendsMatchingShows(pairs, status)` in `lib/db/shows.js`
  finds friends who logged the SAME artist+date with the same status WITHOUT being
  tagged (scoped to the friend graph + RLS). "Going with" is now `tagged ∪
  independent` — so a friend going to the same show shows up even if you never
  tagged them, matching the feed's group card. ShowDetail uses `going` for
  upcoming shows and `attended` for past ("You were there with …").
- 2026-07-13: **Festival matching loosened + festival companions.** For festival
  shows, `friendsMatchingShows` now matches at the FESTIVAL level (name+year via
  `festKeyOf`, inlined in the db layer) instead of exact artist+date — so you and a
  friend count as "together" at a festival even if you saw different acts on
  different days. Callers key by `festivalKey(show) || artist|date`. FestivalDetail
  gained a "You were there with / Going with {friends}" strip up front (reuses
  `.detail-goingwith`) showing everyone who logged the same festival. Relies on the
  existing shows RLS (0010 can_view_shows) — no new policy; friends already see
  each other's festival shows. Caveat: festival-name match is exact (case-sensitive
  `.in`); resolver-produced names are consistent, manual entries could miss.

## Review pass on the savepoint commit `6eccdb9` (2026-07-14)

- **PRIVACY LEAK in ShowDetail's "going with" (fixed).** The co-attendee block was
  never gated on `isOwner` — which was computed and then unused — but ShowDetail
  opens for a FRIEND'S show straight from the feed. On someone else's show,
  `listAttendees(show.id)` is gated by `can_view_show_id`, so it returned everyone
  **that friend** had tagged, and the 0011 insert policy only requires those people
  to be **her** accepted friends. A complete stranger's real name and avatar could
  render — under a first-person label ("You were there with Dave") — on a show you
  never attended, tappable through to their profile. Now owner-only: on your own
  show the same call can only return people *you* tagged, who must be *your*
  accepted friends. `FestivalDetail` and `Home` were checked and never had this —
  both read only from `friendsMatchingShows`, which is scoped to your friend ids.
- **Fake "Friend" identities (fixed).** Ids that RLS wouldn't resolve still rendered
  as an avatar lettered "F" that opened an empty profile. They're now folded into an
  anonymous "+N" count — the same treatment `FriendsFeed` already gave them.
- **Case-sensitive festival matching (fixed).** The caveat noted above turned out to
  bite: `festKeyOf` lowercases, but the query FETCHING the rows was
  `.in('festival', names)` — exact and case-sensitive — so a friend whose row read
  "lollapalooza" was never returned and the case-insensitive key downstream never
  got to see it. Now pulls friends' festival rows and lets `festKeyOf` decide
  equality, which is what actually defines a match here.

## Open questions / follow-ups
- **Streak milestones** ("on a 6-month streak") — not yet; show-count
  milestones + year recaps shipped. Streak needs calculateStreak over
  the full history (data's already fetched) — easy add if wanted.
- **Friend Wrapped view** — recap cards currently open the friend's
  profile; a full friend-facing Wrapped is a bigger build.
- **"Remove tag" UI** — the RLS lets a tagged user untag themselves;
  needs a button (e.g. on the show / a notification). Tag also fires no
  push yet ("Claire tagged you") — add via notify-interaction.
- **Universal links** (melo.show → app) for tag-yourself-from-a-shared-
  card (request #1's remaining half).
- **In-app notification inbox** — "push + in-app" currently = push +
  interactions visible in context; a dedicated bell/inbox is a future
  surface.
