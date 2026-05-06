# Social Layer — Communication, Plans, Friendships

- Started: 2026-05-05
- Status: planned (gated on moderation infra; v2.0+)
- Last updated: 2026-05-06

## Context

Asked by user (2026-05-05):

> "...there should be a whole interaction part of it where they can
> communicate, and create plans, meet new people, and form friendships."

This is the biggest, hairiest initiative on the roadmap. It turns Melo
from a "personal concert tracker that knows about your friends" into a
**concert-going social network**.

Honest framing up front: shipping a real social layer means signing up
for content moderation, abuse reporting, blocking, NSFW image scanning,
underage user policy, harassment, and possibly Section-230-adjacent legal
considerations. None of that is in Melo today. We do it right or we
don't do it.

This initiative sits **on top of** `2026-05-05-buddies-phase-2.md`. It
doesn't ship until that one is solid and the moderation tooling is built.

## Plan

Five sub-systems, each its own phase. Don't ship any of them publicly
until the moderation/T&S layer (Phase 5d) exists.

### Phase 5a — Direct messages

- New tables: `dm_threads(id, user_a, user_b, last_message_at)`,
  `dm_messages(thread_id, sender_id, body, sent_at, read_at)`
- RLS: only thread participants can read; messages are immutable once
  sent (no edit, no delete from peer's view — only from your own view
  via "delete for me" soft delete)
- UI: new bottom-tab? No — keep 5-tab nav. Inbox lives inside Buddies
  page as a top tab toggle ("Friends | Messages")
- DM scope: friends-only by default. Non-friend DM requests land in a
  "Message Requests" subfolder (read-only preview, you choose to accept
  the thread or block)
- Realtime: Supabase Realtime channel per thread

### Phase 5b — Show plans (group event coordination)

- New table: `show_plans(show_id, host_user_id, title, description,
  meeting_point, meeting_time, created_at)` + `show_plan_members(plan_id,
  user_id, status='going|maybe|declined', joined_at)`
- A "plan" is a public-to-friends mini-event tied to a show. "Pre-game
  at The Mermaid Inn 7pm before Brooklyn Steel?"
- Group chat per plan (reuses DM infrastructure with a
  `chat_target_kind='plan'` discriminator instead of two-person threads)
- Surfaces:
  - On a show with a Going status, a "Make a plan" CTA
  - In Buddies → Plans tab, your active plans
  - In a buddy's profile, "active plans you can join"
- Privacy: plan visibility = host's friends, OR a posted invite link
  for non-friends (rate-limited)

### Phase 5c — Discovery & meet-new-people

- Goal: at a specific show or festival, surface other Melo users who
  are also going *and* match your taste profile
- Opt-in only — users must flip on "Discoverable at shows" in Settings
- New table: `show_discovery_signals(show_id, user_id, opted_in_at,
  intro_blurb)`
- Surface: on a show or festival, "X people you might vibe with are
  going" → tap → see their public profile + taste-match score (taste
  profile from `2026-05-05-recommendations.md`)
- Initiating contact: send a "wave" (lightweight one-tap signal). The
  recipient gets a notification. Either party can accept and open a
  message thread, or ignore.
- Blocking from this surface is permanent and silent.

### Phase 5d — Moderation, trust & safety, abuse reporting

**Must ship before any of 5a–5c go public.**

- New tables: `blocks(blocker_id, blocked_id, created_at)`,
  `reports(reporter_id, target_kind, target_id, reason, body, status,
  created_at)`
- Block enforcement: blocked users can't appear in your search, can't
  see your profile/shows, can't DM you, can't see plans you're hosting,
  and you can't see theirs. Bidirectional ghost.
- Report flow: any user/profile/message/plan/photo has a "..." → "Report"
  → categorized reasons (harassment, spam, NSFW, threats, impersonation,
  underage)
- Admin tooling: simple internal page (`/admin/reports`) gated by
  `profiles.is_admin` flag. Initial reviewer = me (Aidan). Future =
  contracted moderator.
- Auto-actions:
  - 3 blocks within 7 days → temp restriction on outgoing DMs
  - 5 unique reports on same content → auto-hide pending review
  - Image uploads to plans/profiles run through a moderation pass
    (Cloudflare Images CSAM/NSFW filter, or AWS Rekognition Moderation
    Labels)
- Underage policy: 13+ minimum (COPPA). Onboarding asks DOB; under-13
  blocks signup. Under-18 gets restricted DM defaults (friends-only,
  always).
- Privacy Policy + Terms additions: explicit content policy, reporting
  procedure, takedown SLA. Coordinate with `2026-04-20-make-it-legal.md`.

### Phase 5e — Friendships → "concert family"

- Long-tail social: streaks of shows together, anniversaries ("you and
  Sarah went to your first show together 1 year ago today"), shared
  Wrapped views ("Your Year With Sarah"), buddy leaderboards
- Mostly Wrapped + ShowDetail surfaces — no new core schema, just
  views over data we already have once 5a–5d ship
- Cross-link with `2026-05-05-wrapped-map-slides.md` for the "shared
  map" slide

## Phasing

This is the slowest-moving initiative on the roadmap and **should not be
rushed**. Order:

1. **Phase 5d (moderation infra) — first, even though no users hit it yet.**
   Build blocks/reports tables, admin page, block-enforcement RLS
   policies. Cost: ~1 week of work. Pays for itself the moment 5a opens.
2. **Phase 5a (DMs) — friends-only, alpha to ~50 users.**
3. **Phase 5b (plans) — friends-only, alpha to same group.**
4. **Phase 5c (discovery) — opt-in only, full release after 5a/5b are
   stable.**
5. **Phase 5e (friendship surfaces) — ongoing, never "done."**

Realistic timeline: **v1.5 at the earliest**, more likely v2.0. This is
post-LLC, post-organic-growth, post-some-kind-of-funding-or-revenue work.

## Changes made

- 2026-05-06: User asked why this isn't shipping now. Stayed gated on
  moderation infra. Reasons (recorded for the record): App Store
  Guideline 1.2 explicitly requires blocking + reporting + moderation
  for any user-to-user messaging app, and a one-person team launching
  DMs without a T&S queue is a who-gets-sued/uninstalled scenario, not
  a "ship and iterate" scenario. The "meet new people at a show"
  surface (Phase 5c) is the highest-stakes safety design in the whole
  product — stalking is the failure mode. Phase 5d (moderation
  infrastructure) remains the gate. Estimated 2-3 weeks of focused
  work to build before any social code goes public.

## Open questions / follow-ups

- **Section 230 / Digital Services Act exposure.** Once we host
  user-to-user content, US (S230) and EU (DSA) regulations apply.
  Need lawyer time before 5a goes public. Track in
  `2026-04-20-make-it-legal.md`.
- **Realtime infrastructure cost.** Supabase Realtime is generous on
  the free tier but DM volume can blow through it. Budget plan needed
  before 5a alpha.
- **Image hosting for DM/plan attachments.** Reuse existing Storage
  bucket from `2026-04-20-pre-launch-sprint.md` photos work? Probably
  separate bucket with stricter retention + scanning.
- **"Wave" terminology.** Likely needs better naming — "wave," "ping,"
  "tap on the shoulder." User test.
- **Anti-stalking design.** Discovery surface (5c) is the highest-risk
  feature in Melo's roadmap. The opt-in default + per-show scope (not
  global) is intentional. Revisit before launch.
- **Group chat scaling.** Per-plan chats with 50 attendees is fine.
  Per-festival "everyone going to Coachella" chats with 50k people is
  not. Cap plan-chat membership at 20–25.
- **Cross-link with `2026-05-05-buddies-phase-2.md`** — this entire
  initiative depends on real friendships existing first.
- **Cross-link with `2026-05-05-notifications-system.md`** — most
  social events fire notifications.
- **Cross-link with `2026-05-05-recommendations.md`** — taste-match
  score is a 5c surface input.
- **Open question: do we want this at all?** A real social layer makes
  Melo a different product than "the concert tracker that respects your
  data and isn't trying to be a network." Worth a decision document
  before Phase 5a writes its first line of code.
