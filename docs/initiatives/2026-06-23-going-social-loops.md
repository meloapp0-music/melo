---
name: going-social-loops
description: Two growth/retention loops around "Going" shows — (1) invite-on-going: when a user marks Going, prompt "invite who you're going with" → SMS → they join to coordinate; (2) a "friends going this weekend" push. The network-effect wedge Showgoer lacks. Held out of the lean 1.3, planned for 1.4.
type: project
---

# Going Social Loops

- Started: 2026-06-23
- Status: planned
- Last updated: 2026-06-23

## Context
Melo's wedge vs Showgoer is **future + together** ("the group chat for the shows you're
*going* to"), and the strongest version of that is turning a "Going" into a group plan.
Two loops:
1. **Invite-on-going** — when someone marks Going, prompt *"invite who you're going
   with"* → native share / SMS with an install + show link → invitees join to coordinate
   the night. Pure network effect (a plan needs your friends); Showgoer has no equivalent.
2. **"Friends going this weekend" push** — a proactive social pull: when friends have
   Going shows in the next few days, nudge the user ("3 friends are going out this
   weekend"). Retention + re-engagement off the going graph.

Both were part of the Showgoer "widen-the-gap" plan; held out of the lean 1.3 so it could
ship fast (the bottleneck at ~50 users is distribution, and these are the loops that make
marketing *compound*). Slotted for 1.4. Nicer invite links depend on
[[public-share-pages]].

## Plan
- **Invite-on-going**: hook the Going action (LogShow / status change) → an invite sheet
  (native share with prefilled text + a `melo.show/show/:id` link). Track invites →
  installs for attribution.
- **Friends-going push**: extend the existing notification pipeline (`tour-alerts` /
  `notify-*` edge functions + cron) with a weekly "friends going this weekend" digest
  computed from friends' Going shows. Respect notification prefs + frequency caps.
- Builds on the friend graph (Get Started step 2, [[cold-start-activation]]) and Show Day.

## Changes made
- 2026-06-23: Initiative created (idea capture; held from 1.3 → planned for 1.4).

## Open questions / follow-ups
- Invite attribution (deferred-deep-link install tracking).
- Push frequency/caps so the weekend digest never feels spammy.
