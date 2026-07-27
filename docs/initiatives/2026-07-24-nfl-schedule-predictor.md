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
imports nothing. It ships as its own static site under `pickem/` — one
self-contained HTML file plus a manifest, a service worker and icons — with no
build step and no dependencies, so it can be dropped on any HTTPS host, or the
single HTML file handed to someone as an attachment.

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
- 2026-07-24: Round two, from the user's "make it more fun" pass. Picked three
  of five proposals: head-to-head compare, a speed lane, and a receipts screen.

  **Compare** — a new tab that takes a friend's share link and decodes their
  whole season next to yours: agreement count, the ten clubs your two seasons
  disagree on most (as a diverging bar of win differential), both playoff fields
  seeded side by side with mismatched seeds highlighted, and a filterable list
  of every game you called differently. Friends are stored as their share codes
  under `pickem26.rivals` and re-decoded at boot; multiple friends are supported
  and switchable. Nothing is uploaded — the whole comparison is local.

  Analysing someone else's sheet reuses every existing record/seed/bracket
  helper by swapping the state globals inside `withState()`, which also sets a
  `computing` flag that hard-locks `save()` for the duration, so a friend's
  season can never overwrite yours.

  **Speed lane** — the Season tab gains a By team / By week toggle. The week
  lane shows a full slate grouped by day, a week bar with per-week completion
  dots, and the bye teams. Arrow keys drive a cursor through whichever lane is
  open (↑↓ to move, ←→ to pick a side, ⌫ to clear), auto-advancing after each
  pick. Key handling bails out inside inputs so score entry is untouched.

  **Receipts** — a payoff screen: champion hero, the eight division winners, and
  computed takes measured against how 2025 actually finished (biggest riser and
  faller, best and worst clubs, the most dramatic seeding upset in the bracket,
  who crashed the playoff field and who fell out of it, whether the reigning
  champions repeat, and how often you took the home side). It renders to a
  1080×1350 PNG via canvas for download or clipboard copy.

  Added 2025 final records, the 2025 playoff field, and the Super Bowl LX result
  (Seattle 29, New England 13) to the dataset for the comparisons above.

- 2026-07-24: Fixed a latent bug found while testing the compare screen.
  `standings()` read the module-level record cache `R` but never populated it,
  relying on `render()` having done so first. Every real call path happened to
  refresh it, but a stale cache would feed wrong seeds into `bracketFor()`,
  which prunes postseason picks whose matchup no longer exists — silently
  deleting the user's bracket. `standings()` now rebuilds `R` itself.
  Regression tests cover idempotent analysis and pick preservation.

- 2026-07-24: Round three — the team lane redesign, crests, and a trim.

  **Team lane is now W/L, not pick-a-side.** The two-sided slab is the right
  control for the week lane, where neither club is yours, but it was the wrong
  mental model for a single team's schedule: you think "W, W, L, W", not "who
  wins Bills–Texans". The team lane now renders one row per game in schedule
  format — opponent crest, "at/vs Opponent", their record and kickoff — with W
  and L buttons and a green or red edge bar. It writes exactly the same pick the
  week lane does (a W for the club is a win for whichever side it is on), so the
  two lanes stay in sync and the opponent's own page shows the mirror image.
  Score fields are ordered your-team-first in this lane. Keyboard follows: W/L
  or ←/→ in the team lane, ←/→ for away/home in the week lane.

  **Crests for all 32 clubs.** Not NFL logos — those live on CDNs this
  environment cannot reach, the published page blocks external requests, and
  baking the league's trademarks into a file meant to be passed around is not
  something to do casually. Instead each club gets a generated crest: a tile in
  its official primary colour, a helmet stripe in its secondary, and the
  abbreviation in the condensed face, with the text colour picked per club by
  whichever of white or near-black actually contrasts. Used in the club rail,
  team header, opponent rows, week slabs, standings, bracket and receipts. On
  narrow screens the rail becomes crest-only (the label would just repeat the
  abbreviation) and auto-scrolls to keep the selected club in view.

  **Five tabs down to four.** Receipts folded into the foot of Postseason,
  which is also the natural reading order — crown a champion, then scroll into
  what that commits you to.

- 2026-07-24: Round four — your club. The tool treated all 32 teams as equals,
  so a Bears fan had no home base; their own season was one of thirty-two.

  You now favourite a club and it follows you everywhere: pinned to the console
  bar on every screen (crest + predicted record), a summary card above the club
  rail on the Season page, a ★ toggle on any team header, its row highlighted in
  the division table and the conference seed list, and a dedicated "Your club"
  card at the top of the receipts — including how far it goes in your bracket
  ("wins it all", "falls in the NFC Championship", "misses the playoffs") and
  its swing against last season.

  A first-run picker (32 crests, grouped by conference) asks once before the
  wall of teams, so a friend opening the link starts personal rather than
  staring at a list. The app then opens on your club unless you navigated
  elsewhere. Compare gains a fourth headline card — your club's record in your
  sheet vs theirs, the disagreement you actually care about — and rival chips
  carry their club's crest.

  The club rides in the share payload as a new trailing field, so a friend sees
  "a Bears fan" on your sheet. Cloning someone's picks deliberately does *not*
  inherit their club: it keeps yours, or none. Links made before this field
  existed still decode (`p[7]` absent → empty).

- 2026-07-24: Caught by the new tests, worth recording: the first draft of the
  boot sequence declared `const saved` for the last-viewed team while `saved`
  was already the rivals list a few lines up. That is a `SyntaxError`, which
  kills the entire script tag — the page rendered nothing at all. Renamed to
  `lastTeam`. A reminder that this file is one long script with a single shared
  scope, so new locals in `boot()` need checking against what is already there.

- 2026-07-24: Round five — the club becomes structural, and a layout bug found
  while doing it.

  User pushback, and it was fair: "should there be a separate tab for your club?
  i feel like we are over complicating things." A separate tab was the wrong fix
  — it would have duplicated the by-team view exactly — but the diagnosis was
  right. Round four *sprinkled* the club across six weak signals (console chip,
  a card above the rail, a star button, a standings row tint, a seed row tint, a
  receipts card) instead of making it structural, and the Season tab made you
  walk past a lane toggle, a hint sentence, a club card and a rail of 32 crests
  before reaching a single game.

  The lane toggle is now named after your club: **`Bears · All clubs · By week`**.
  On your club's lane there is no rail, no club card and no hint line — you land
  directly on their 17 games, full width, and the toggle itself is the "you are
  a Bears fan" signal. Browsing other clubs moved behind "All clubs", where a
  picker actually belongs, and "Next club with gaps" now only appears there. The
  star on the team header becomes "Change club" on your own lane. Picking a club
  (or tapping the console chip) drops you straight onto its lane. Clearing your
  club collapses the toggle back to two segments. Still four tabs, and roughly a
  third less chrome on the screen that gets the most use.

  **Bug found:** the week lane rendered inside `.season`, whose desktop rule is
  `grid-template-columns: 224px minmax(0,1fr)` for the rail plus panel. The lane
  passed only one child and never had a CSS rule of its own, so on desktop the
  entire week view was squeezed into the 224px rail column with 922px of empty
  space beside it. It had only ever been screenshotted at mobile width, where
  the grid collapses to a single column and it looked correct. Both rail-less
  lanes now share a `.season.solo` rule — one column, capped at 960px and
  centred so the pick controls stay near the club they belong to. `gridcheck.py`
  asserts the column widths in both lanes so this cannot regress silently.

- 2026-07-24: Round six — two on-ramps, so a bracket no longer costs 272 picks.

  User: "its a lot for people to go through every team but i want the postseason
  to be part of it. thats the only way though right?" It wasn't. The bracket
  needs *records*, not 272 individual calls — but partial picking produced a
  useless bracket (everyone near 0-0, seeds falling through to the manual
  tiebreak), so in practice the full season had been the only path.

  **Fill the rest.** One button completes every game you have not called. Last
  season's record becomes a rating, shrunk hard toward .500 (×0.135) because
  year-over-year correlation is weak — without that the previous year's best
  team sweeps and the projection looks silly. Home field is worth ~0.26, and a
  FNV hash of the fixture decides each coin-flip, so it is deterministic but not
  a pure ranking. The resulting league looks like a real season: a 14-3 top, a
  2-15 bottom, 55% home wins, and the wins necessarily sum to 272. Offered from
  the team tools, the week lane, and — most usefully — the "N games open"
  warnings on Standings and Postseason.

  **Win totals lane.** A fourth lane: 32 steppers grouped by division, each
  showing last season's record for reference and how many of that club's games
  you have called by hand. A running "league wins / 272" readout flags a total
  that cannot exist. "Build the season" runs a solver: free games (anything not
  hand-called) are assigned by urgency, then improved by straight swaps, then by
  a two-step chain repair for the case where a club short of its target never
  plays one with a surplus. On feasible targets it lands within 0–2 wins across
  the whole league; the first draft without chain repair was off by 6, and
  blaming that on "the fixtures" would have been a lie — it was a local optimum.

  **Filled games are never passed off as yours.** They carry an `a` flag, render
  with a dashed edge and outlined rather than filled W/L buttons, and are tagged
  "filled". Touching one — a tap or a score — clears the flag and makes it
  yours. The console bar splits the progress bar in two and reads "88/272 +184
  filled". The receipts state the split outright, and the share card footer
  drops "every pick made by hand" for "88 of 272 games called by hand · the rest
  projected" whenever anything was filled. The share payload encodes the
  distinction (winner chars gain `4`/`5` for filled away/home), so it survives a
  round trip to a friend.

  Also: the totals screen rounds 32 records to whole wins, which came to 271
  because last season contained a tie — it now nudges the closest calls so the
  screen does not open complaining about a gap the user did not create.

- 2026-07-24: Predicted scores moved behind a toggle. They were the highest
  noise-per-use element on the screen that gets the most traffic — two number
  boxes on all 272 rows for something most people never fill in. A `Scores`
  switch now sits in the lane bar and governs both the team lane and the week
  lane; off by default. Any scores already entered stay in the data and keep
  counting toward point differential and ties, so hiding is purely visual. The
  preference is remembered per browser and is *not* part of the share payload —
  but when it has never been set, it defaults to whether the sheet being opened
  actually contains scores, so a friend receiving a scored sheet sees them.

- 2026-07-24: Test-harness flaw worth recording. The Playwright suites seed
  `localStorage` via `add_init_script`, which re-runs on **every** navigation —
  including `page.reload()`. It was unconditionally overwriting `pickem26.v1`,
  so every "survives reload" assertion was passing against freshly-seeded state
  rather than anything the page had saved. It surfaced only because the scores
  toggle needed a genuine reload to prove persistence. All seeds are now
  conditional (`if (!localStorage.getItem(...))`). Any future harness seeding
  must do the same or the persistence coverage is theatre.

- 2026-07-24: Turned into an installable web app. The artifact link cannot be
  one — a Claude artifact has no manifest, no service worker and no control over
  its own scope — so this needs hosting the user controls.

  `public/nfl-2026-predictor.html` **moved to `pickem/`**, which is now a
  self-contained static site: `index.html`, `manifest.webmanifest`, `sw.js` and
  `icons/`. There is deliberately no second copy to drift.

  - **Manifest**: standalone display, relative `start_url`/`scope` (so it works
    at any subpath, including a project Pages URL), theme and background both
    `#0A0D12`, five icons including two maskable with a 12% safe area.
  - **Icons** are generated (`icons.py`, Pillow + the same Saira face the app
    uses) rather than hand-drawn: the crest motif the app already leans on —
    dark ground, yard-line texture, "26" in condensed white, brass helmet
    stripe. 192/512/1024, a 180px `apple-touch-icon`, maskable pair, favicons.
  - **Service worker**: precaches the shell and icons; navigations are
    network-first falling back to the cached page, everything else cache-first
    with a background refresh. `CACHE` is stamped with a hash of the built HTML,
    so each deploy installs a fresh worker and drops the previous cache.
    Verified offline: the page loads with no network, picks are intact, and you
    can keep picking.
  - **iOS**: `apple-mobile-web-app-capable`, black-translucent status bar,
    app title, and an in-app sheet explaining Share → Add to Home Screen, since
    iOS has no install prompt. That sheet also warns about the real trap — iOS
    gives a home-screen app storage separate from Safari, so picks made in the
    browser do not appear inside the installed app; the fix is to open your own
    share link once from inside it.
  - **Install button** appears only when a manifest is present, so the artifact
    copy never offers to install itself (which would have bookmarked the wrong
    page entirely). Asserted in the build and covered by `artcheck.py`.

  The build now emits both targets from the one template: `pickem/index.html`
  with the PWA head and worker registration, and `artifact.html` with neither.

  ### Deploying it

  `pickem/` is a plain static directory — no build step, no dependencies, no
  server code. Any of these work:

  - **GitHub Pages** — `.github/workflows/pickem-pages.yml` deploys `pickem/`
    on pushes to `main` that touch it. A repo admin must first set
    Settings → Pages → Source to "GitHub Actions". Pages on a *private* repo
    needs a paid plan; public repos are free. Lands on
    `https://<owner>.github.io/melo/`.
  - **Netlify / Cloudflare Pages / Vercel** — drag the `pickem` folder onto
    their drop target, or point the project at the repo with publish directory
    `pickem` and no build command.
  - **Any web host** — copy the four items to a directory served over HTTPS.
    HTTPS is required: without it the service worker will not register and the
    app will not be installable.

- 2026-07-24: Domain chosen — **football-sundays.com**. Wired in:

  - **Link previews.** `canonical`, Open Graph and Twitter card tags, all
    absolute against the domain, plus a generated 1200x630 `social-card.png`
    (same crest motif: field wash, yard lines, the wordmark in Saira, the brass
    stripe). Pasting the link into a group chat now shows a title card instead
    of a bare URL. Site build only — the artifact copy still ships no `<meta>`
    or `<link>`, which the build asserts.
  - **`pickem/CNAME`** so GitHub Pages serves the custom domain.
  - **The manifest deliberately stays relative** (`start_url`, `scope` and `id`
    all `./`). An absolute `id`/`start_url` on football-sundays.com would be
    out of scope — and therefore invalid — on any preview deploy or staging
    host, breaking installability exactly where you want to test it. Relative
    works identically on the real domain and anywhere else.
  - The Pages workflow now cross-checks that `CNAME` matches the domain the
    canonical and og tags claim, so the two can never drift apart silently.

  Worth recording: `footballsundays.com` (no hyphen) is registered to someone
  else. Anyone typing the name by hand will land there, so this should be shared
  as a link or QR code rather than dictated.

## Open questions / follow-ups

- No way for friends to compare picks side by side — that needs a backend. The
  user chose the no-account share-link model; a Supabase-backed "league" with a
  room code and a leaderboard is the natural next step if it gets used.
- Records are scored against predictions only. Nothing grades the picks against
  real results once the season starts; that would need a live results feed.
- The schedule is a snapshot. If the league flexes games (common from Week 5
  on), the page will not know — dates and kickoff times may drift from reality
  even though the matchups stay correct.
