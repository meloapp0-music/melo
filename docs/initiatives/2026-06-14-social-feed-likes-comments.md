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

## NEEDS USER ACTION
- **Apply migration 0011** (Supabase dashboard → SQL Editor, paste
  `supabase/migrations/0011_social.sql`, run). Until then, reactions/
  comments error and the feed shows no co-attendees. (Edge function
  already deployed.)

## Open questions / follow-ups (deferred extras)
- **Milestones in feed** ("Claire hit 50 shows", streaks) and
  **Wrapped-in-feed** — deferred: both need each friend's *full* history
  pull to be accurate (the feed only fetches capped recent rows), so a
  rushed version would show wrong counts. Clean fast-follow.
- **"Remove tag" UI** — the RLS lets a tagged user untag themselves;
  needs a button (e.g. on the show / a notification). Tag also fires no
  push yet ("Claire tagged you") — add via notify-interaction.
- **Universal links** (melo.show → app) for tag-yourself-from-a-shared-
  card (request #1's remaining half).
- **In-app notification inbox** — "push + in-app" currently = push +
  interactions visible in context; a dedicated bell/inbox is a future
  surface.
