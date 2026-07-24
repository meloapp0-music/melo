# NFL 2026-27 Schedule Predictor ("Pick 'Em '26")

- Started: 2026-07-24
- Status: shipped
- Last updated: 2026-07-24

## Context

User request: a standalone interactive page they can send to friends — filter
by any NFL team, walk the real 2026-27 schedule team by team, call each game
a win or a loss (with an optional predicted score), save and revise it, and
have the site build a playoff bracket off the resulting records that the user
also picks through to a Super Bowl winner.

This is **not** a Melo product feature. It is a personal, shareable one-off
that happens to live in this repo. It deliberately does not touch `AppContext`,
Supabase, `src/web/lib/db/*`, or any Melo surface — nothing imports it and it
imports nothing. It ships as a single self-contained file under `public/`, so
Vite serves it at `/nfl-2026-predictor.html` without a build step, and the same
file can be handed to anyone as an attachment.

## Plan

Four decisions were confirmed with the user before building:

| Question | Choice |
|---|---|
| Delivery | Shareable link (published Artifact), file also committed here |
| Save + share | Local save in the browser + a share link that carries picks in the URL |
| Pick depth | Winner required, score optional |
| Seeding | Real NFL tiebreakers, with a manual override for genuine ties |

### Schedule data

The container's egress allowlist blocks nfl.com / ESPN / CBS / Wikipedia, and
`WebFetch` 403s on all of them, so the schedule could not be scraped. GitHub
*is* reachable, so the data came from
[`nflverse/nfldata`](https://github.com/nflverse/nfldata) `data/games.csv`,
filtered to `season == 2026 && game_type == REG`.

Verified before use:

- 272 games, weeks 1–18
- 17 games per team, exactly one bye each, 8 or 9 home games per team
- division rivals played twice
- spot-checked against reported facts: SEA hosting NE on Wed Sep 9, and
  SF–LAR at the Melbourne Cricket Ground on Thu Sep 10

The 8 international games (Melbourne, Rio, London ×2, Paris, Madrid, Munich,
Mexico City) are flagged in the UI and show "VS" instead of "AT".

### Design

Deliberately a single dark visual world — a stadium scoreboard / broadcast
console. Light mode was skipped on purpose: 32 official team palettes skew
navy, maroon and black, and they only read as identity against a dark ground.
Selecting a team re-tints the whole console to that franchise's colors.

- Type: Saira Condensed 700 (display/scoreboard) + IBM Plex Sans 400/600 (UI),
  both subset to Latin and inlined as woff2 data URIs (~46 KB total) because
  the Artifact CSP blocks font CDNs.
- Team colors are the official primary (or secondary where the primary is too
  dark to be characteristic), then run through a `readable()` helper that
  lightens the hue until it clears 4.5:1 against the page ground. All 32 pass.

### Tiebreakers

Implemented as the league sequences them, applied to a tied group with the
standard reduce-and-restart loop:

- division ties: head-to-head → division record → common games (4 min) →
  conference record → strength of victory → strength of schedule → net points
- conference ties: head-to-head (a sweep only, for 3+ clubs) → conference
  record → common games → SOV → SOS → net points
- wild cards respect the rule that only the highest-ranked club in a division
  is eligible at a time
- a step that cannot apply (e.g. common games under the 4-game minimum) is
  skipped, not scored as zero
- anything still level falls to a user-ordered list, editable with the ▲▼
  arrows in the standings; the seed list shows which criterion placed each team

Ties are supported: entering equal scores records the game as a tie and it
counts as half a win.

### Bracket

Seven seeds a side, #1 on a bye, re-seeded every round the way the league does.
Picks are keyed to the matchup, so a pick whose matchup stops existing (because
the underlying records moved) is pruned rather than left dangling.

### Share links

State is serialized to a compact string (one character per game for the winner,
sparse lists for scores/bracket/manual order), deflated via `CompressionStream`,
and base64url-encoded into the URL fragment — a full 272-game season is ~77–205
characters. Opening someone's link is read-only and writes nothing to local
storage until "Use as my starting point" is pressed.

## Changes made

- 2026-07-24: Added `public/nfl-2026-predictor.html` — a single self-contained
  120 KB page (no build step, no network calls, no dependencies) covering the
  full 2026-27 schedule, per-team pick sheets, standings with real tiebreakers,
  the playoff bracket, and share links. Published as an Artifact for sending
  around.
- 2026-07-24: Verified in Chromium — 62 logic assertions (seeding invariants,
  the wild-card division rule, re-seeding, stale-pick pruning, tie handling,
  schedule integrity, color contrast), share round-trip across separate browser
  profiles, zero console errors, and no horizontal overflow at 390 px.

## Open questions / follow-ups

- No way for friends to compare picks side by side — that needs a backend. The
  user chose the no-account share-link model; a Supabase-backed "league" with a
  room code and a leaderboard is the natural next step if it gets used.
- Records are scored against predictions only. Nothing grades the picks against
  real results once the season starts; that would need a live results feed.
- The schedule is a snapshot. If the league flexes games (common from Week 5
  on), the page will not know — dates and kickoff times may drift from reality
  even though the matchups stay correct.
