---
name: cold-start-activation
description: First-run "starting navigation" — a Get Started checklist on Home that gives a new user clear next actions (log a show → add friends → turn on alerts) so they don't land on an empty social feed and churn. Borrows Showgoer's "obvious first move," adapted to Melo's social-future wedge.
type: project
---

# Cold-start activation — the "starting navigation"

- Started: 2026-06-23
- Status: in-progress
- Last updated: 2026-06-23

## Context
New users download Melo and land on a Home whose social value (the friends
feed) is empty until they have friends — so they feel lost and churn. Showgoer
(a competing concert-passport app) gets one thing right: it gives a new user an
*obvious first move*. We borrow that, but adapt it: Melo's cold-start is worse
(empty feed, not a solo collection), so the starting navigation must give
**solo value first, then layer in the social**.

Prompted by the user: *"users probably feel lost when they first download it so
there should be a starting navigation."* The user approved the design (a 3-step
Get Started checklist) before implementation. The premium [[premium-polish-pass]]
was done first, at the user's request, so the new card lands on the upgraded
visual base.

## Plan
A **Get Started** card pinned to the top of Home — one unified surface that
replaces the two older, overlapping nags (the zero-show "Pick your way in" block
and the standalone music-taste prompt). Three steps, each ticking off against
**real state**, the whole card hiding once all three are done or dismissed:

1. **Log your first show** — solo value, no friends needed. Done when
   `shows.length > 0`. → `navigate('log')`.
2. **Add your people** — the fix for the empty feed (the social wedge). Done when
   `listFriends().length > 0`. → `navigate('buddies')`.
3. **Turn on alerts** — retention. Done when the profile has any fav genre/artist
   (which powers the tour/"artist in your city" alerts). → `navigate('settings')`.

Design verified against the approved mockup: progress bar, green-tick done rows
(strikethrough + dimmed), ember CTA pills, Melo cream/ember styling.

### Follow-ups deferred from this first cut (not built yet)
- **First-show reward**: after the very first log, auto-open the share card
  ("here's your first Melo card") — the Showgoer "you collected a stub" dopamine,
  which doubles as the viral loop. (Share card already exists — see
  [[share-card-redesign]].)
- **Smart empty states**: teach instead of showing blank feed/Up Next.
- **One-time pulse** on the + (Log) tab so the first action is unmissable.

## Changes made
- 2026-06-23: Initiative created. Built the Get Started checklist.
- 2026-06-23: **Get Started card shipped (in code).** New
  `src/web/components/GetStarted.jsx` — 3-step checklist reading `shows` +
  `profile` from `useApp()` and `listFriends()` from `lib/db/friendships`; hides
  when complete or dismissed (`localStorage 'melo_getstarted_done'`); waits for the
  friends query before first paint so an already-activated user never sees a flash.
  Wired into `pages/Home.jsx` directly under the hero, **removing** the old
  `home-firstrun` (zero-show) block and the `taste-prompt` + its dead state.
  Added `.gs-*` styles to `App.css`. `npm run build` clean; card verified rendering
  against the real CSS in the dev preview. (Festival-discovery entry point is
  preserved by the existing "Discover shows" CTA lower on Home.)

## Open questions / follow-ups
- Build the three deferred follow-ups above (first-show reward is the highest-value).
- The old `.home-firstrun*` / `.taste-prompt*` CSS is now unused (left in place;
  harmless) — remove in a later cleanup if desired.
- Consider a one-time "You're all set 🎉" state when the 3rd step completes while
  the card is visible (currently it just disappears).
