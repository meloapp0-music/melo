# Engagement & Retention Loops — reasons to keep logging

- Started: 2026-05-22
- Status: planned
- Last updated: 2026-05-22

## Context

The #1 long-term challenge for Melo is **retention** — giving users a
reason to keep coming back and keep logging. A concert tracker is only
valuable if people actually log shows over time. User framing
(2026-05-22): "a reason to keep logging is the biggest thing," plus a
request for **friends-leaderboards** (friends comparing with each other
to drive return visits).

This initiative collects the engagement/retention mechanics. Many are
cheap and build on existing pieces (streaks, milestones, the Home "How
was X?" CTA, the friend system, the notification cron).

**Note on competitiveness:** an earlier decision kept Melo "emotional,
not cutthroat" (Compare was demoted). That caution applies to *global*
leaderboards, NOT friends-comparison. Comparing with people you actually
know is a proven, healthy retention engine (Strava/Letterboxd/BeReal).
The rule here: **friends-only, multi-dimensional, celebratory** — not a
single brutal global rank.

## The mechanics (prioritized by retention impact)

### 1. Post-show "rate it" prompt — close the Going → Rated loop (highest leverage) ✅ SHIPPED (cron)
**2026-05-22: Built** in `tour-alerts/index.ts` — the day after a Going
show (d === -1), the cron sends "How was {artist}? Rate it" (kind
`postshow_rate`, deduped). Converts intent → a logged, rated show and
creates a guaranteed return visit. Deploy via
`supabase functions deploy tour-alerts`. The in-app side (tap → rate)
reuses the existing Home "How was {show}?" CTA.

When a show is marked **Going**, prompt the user the **day after** the
date: "How was {artist}? Rate it ⭐."
- Notification (`postshow_rate` kind in the cron) + the existing Home
  "How was {show}?" CTA.
- Converts intent into logged/rated data AND creates a guaranteed return
  visit tied to a real event. Every Going show → a re-engagement moment.
- Cheap: reuses the Going-tier data + notification infra + the existing
  Home CTA that pivots a Going show into the score editor.

### 2. Friends activity + leaderboards (the social engine)
Depends on `2026-05-05-buddies-phase-2.md` (real friends).
- **Friend activity** — "Sarah logged a 10/10 at Red Rocks." Seeing
  friends log pulls people back daily.
- **Friends-leaderboards — multi-dimensional** (everyone wins at
  something): most shows, most miles traveled, most shows *together*,
  most new artists discovered, genre diversity. Friends-only, opt-in.
- **"Shows together"** — already in the friend system; surface it.

### 3. Streaks + goals (always slightly ahead)
- **Streaks** exist (Profile). Add **streak-at-risk reminders** ("your
  concert streak ends in 5 days") via the cron.
- **Annual goal** — user sets "20 shows this year"; progress bar +
  nudges ("12 of 20 — 5 more to beat last year").

### 4. Collection / completion (the completionist itch)
People log to finish a set:
- Collect **venues / cities / states / countries / festivals / decades**.
  "You've seen 8 of 10 iconic US venues." "3 states to go."
- Cheap — derived from existing show data; just needs the collection
  surfaces + targets.

### 5. Badges & milestones (expand existing)
- Profile already has milestones. Add more: 50 shows, 10 venues, first
  festival, 5 countries, genre-specific ("Country Connoisseur"). Visible
  + satisfying, near-zero cost.

### 6. Monthly mini-recap
- Beyond December Wrapped: a **"your {month} in music"** mini-recap each
  month → more frequent dopamine + a monthly open reason. Reuses Wrapped
  computation, scoped to a month.

## Friends-leaderboard design (the user's specific ask)
- **Friends-only.** No global rank. Lives in the Buddies section.
- **Multiple boards**, each its own tab/segment so leading one feels
  achievable: Shows · Miles · Together · Discoveries · Genres.
- **Time windows:** this year / all-time (maybe this month).
- **Tone:** celebratory ("Sarah's leading the year with 14 shows 🎉"),
  with a friendly nudge ("2 more to catch her"). Never shaming.
- **Privacy/opt-in:** respects the friend-privacy + block model already
  built. A user can be on leaderboards only with mutual friends.

## Schema
- Mostly **derived** from existing `shows` + friendships — no new tables
  for v1 of most mechanics.
- Likely small additions later: an annual-goal value on `user_settings`,
  a `badges` table if we want server-tracked unlocks, and a
  `postshow_rate` notification kind (no schema — uses `notifications_sent`).

## Dependencies
- **Friend system** (`2026-05-05-buddies-phase-2.md`) — required for
  leaderboards + activity. Build those *after* friends ship + are tested.
- **Notification cron** — for post-show prompts + streak reminders
  (extends `tour-alerts`).
- Existing streaks/milestones (Profile) + Home "How was X?" CTA.

## Suggested sequencing
1. **Post-show "rate it" prompt** — highest leverage, cheap, no friend
   dependency. Do first.
2. **Collection + expanded badges + monthly recap** — solo, cheap,
   derived data.
3. **Friends activity + leaderboards** — after the friend system is live
   and tested.

## Open questions / follow-ups
- **Leaderboard with few friends** — at low friend counts a board is
  thin; seed with "shows together" + all-time so it's not empty.
- **Goal-setting UX** — keep optional; don't force a goal on users who
  just want to log.
- **Notification fatigue** — post-show + streak prompts must honor the
  Settings toggles from `2026-05-22-notification-expansion.md`.
- **Cross-links:** `2026-05-05-buddies-phase-2.md`,
  `2026-05-22-notification-expansion.md`,
  `2026-05-13-time-capsule-notifications.md`,
  `2026-05-22-cold-start-activation.md` (logging incentives ARE
  activation), `2026-04-17-phase-3-features.md` (streak cards origin).
