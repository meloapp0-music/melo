---
name: home-declutter
description: Home screen felt hectic (stats + Up Next + Wrapped + streak). First pass — Wrapped off Home (lives in Profile), streak out of the stat bar into a subtle header chip, music taste added as a quiet header entry.
type: project
---

# Home screen declutter

- Started: 2026-07-13
- Status: in-progress (first pass shipped to dev)
- Last updated: 2026-07-13

## Context
User (live-testing on localhost) said the Home screen looks "too much / hectic"
— stats bar + Up Next + Wrapped banner + streak all competing. Brand is
premium / luxury / fun / social-diary, and premium = restraint. First pass of
targeted cuts, plus competitor/brand notes for the fuller direction.

## Changes made
- 2026-07-13: Removed the Wrapped banner from Home (it already lives in Profile
  as the "Your Wrapped" archive — no orphan). Removed the streak from the main
  stat bar; it's now a small "🔥 N" chip top-right in the header. Added a quiet
  music-taste entry (bell icon) top-right in the header → navigates to the
  Music Taste page — accessible from Home but out of the way. `home-brand-row`
  is now a flex header (logo left, actions right).

## Header gradient fix (2026-07-13)
- User: the peach header "just ends… looks god awful." It was a rectangular wash
  that faded to `transparent` (which greys off-tone through transparent-black)
  and stopped right at the box edge → a visible hard seam before "Up Next".
  Fixed `.home-hero`: fade to the cream bg at **zero alpha** (`rgba(250,248,245,0)`,
  not `transparent`), a straight 180° vertical fade finishing at ~84% so the
  lower strip is already pure page color, softer alphas, and the corner glow
  (`::before`) toned down + de-greyed. Verified with a before/after harness — the
  tint now dissolves into the page instead of ending in a block.

## Changes made (bigger pass, 2026-07-13)
- Reordered Home to lead with what's next + who's going: hero → GetStarted/
  TasteNudge (gated) → Up Next → Friends feed → You're Going → slim stats →
  Discover/Recent/etc. The stat bar no longer sits under the hero.
- Trimmed the Home stat bar from 5 to **3** (Shows · Artists · Avg Score) and
  demoted it below the social/upcoming content (`home-stats-slim`, no hero
  overlap, lighter shadow). Only renders once ≥1 show is logged.
- Moved the full stat set to Profile: Cities/Songs came off Home. The Concert
  Map was ONLY reachable via Home's Cities stat — added a **Map** nav button to
  Profile so it isn't orphaned. Home's Avg now deep-links to Rankings; Profile
  already has Shows/Artists/Songs/Venues + the Streak block + Wrapped archive.

## Restructure (2026-07-13, user chose "Stats tab" direction)
User feedback: home felt "boring at top, a lot on scroll"; didn't want to
scroll to reach numbers; friends feed felt repetitive (sister going to the same
Noah Kahan show). Chosen direction: dedicated Stats tab + feed-first home +
merged friends feed + trimmed discovery.
- **Nav:** Buddies tab → replaced by a **Stats** tab (Home · Shows · (+) ·
  Stats · Profile). Buddies still reachable from the Profile nav grid; the
  friends FEED stays on Home. NavBar TAB_ALIAS: buddies→profile, map/songs→
  stats. App.jsx: 'stats' added to the tab list + route + `<Stats/>` import.
- **New `pages/Stats.jsx`:** a concert-specific numbers page — 6-tile stat grid
  (Shows/Artists/Cities/Songs/Venues/Avg, tappable to their destinations),
  current/longest streak, Most Seen artists, Top Genres bar chart. Empty state
  for zero shows.
- **Home:** removed the mid-scroll stat bar entirely (numbers now live on the
  Stats tab). Home leads Up Next → Friends feed. Trimmed discovery from FIVE
  sections to TWO: kept the Discover CTA + the Upcoming Shows (wishlist) rail;
  removed Recent Shows, "You Might Like", and Top Rated.
- **Friends feed merge:** a friend's GOING show you're ALSO going to now reads
  "You + {name} are going to {artist}" with a "🎟️ Going together" badge, instead
  of a card that just repeats your own Up Next.

## Open questions / follow-ups
- Dead code in Home.jsx after the trim: `recent`, `topRated`, and the
  `discovery`/`discoveryLoading` state + its fetch effect are now unused. The
  discovery fetch still fires an API call for nothing — worth removing in a
  cleanup sweep (left in for now to avoid churn mid-testing).
- `cities`/`songsHeard`/Wrapped vars in Home.jsx are now computed-but-unused —
  harmless (build is clean); tidy up in a later pass.
- Consider a subtle "Cities" count somewhere in Profile (the count is no longer
  shown anywhere; the Map button gives the destination but not the number).
- GetStarted + TasteNudge gating overlap — still worth re-checking on a real
  new-user account.
