# IA Simplification — four tabs, one overlay stack, four-tap logging

- Started: 2026-07-28
- Status: in-progress
- Last updated: 2026-07-28

## Context

Melo works but has sprawled. A full inventory of the user-facing surface found:

- **Six overlapping analytics surfaces** — `Stats.jsx`, `Profile.jsx`,
  `Wrapped.jsx`, `Rankings.jsx`, the four per-entity pages (`Artists`, `Venues`,
  `Songs`, `ConcertMap`), and the recap subsystem.
- **A live data bug**: Stats and Profile report *different numbers under the
  same label*. `Profile.jsx:69` counts raw rows; `Stats.jsx:74` counts
  festival-collapsed outings. Same word "Shows", two tabs apart, two answers.
  Same for Venues (`Profile.jsx:57` counts every venue string, `Stats.jsx:59`
  excludes festival stages).
- **Thirteen separate overlay `useState`s in App.jsx** (`:76-100`), three of
  which (`showLog`/`logEditTarget`/`logPrefill`) describe one overlay.
- **Dead and blocked surfaces**: `RecapSpike.jsx` (founder-gated, its own header
  says delete after the spike — the spike passed 2026-07-24), `QuickLog.jsx`
  (unreachable — `setShowQuickLog` has no caller), `ImportFromCalendar.jsx`
  (unreachable, but see below — it's blocked, not dead).
- **Logging friction**: `LogShow.jsx` is 68KB, one long form with 13 sections
  behind two levels of segmented control and five entry paths, whose own
  subtitle promises "Capture the night in 30 seconds".

The goal is the app every concert-goer opens after a show. That needs fewer,
clearer surfaces and much faster logging.

## Plan

Approved plan: `~/.claude/plans/compressed-gathering-wren.md`.

Six phases, each independently shippable and revertable:

1. Dead-code sweep
2. One overlay stack (reducer) replacing 13 useStates, with back-compat shims
3. Merge `Stats.jsx` + `Profile.jsx` → `pages/You.jsx`
4. Four tabs: Home | Shows | + | You
5. Extract `ArtistShowPicker` from `LogShow` (pure refactor)
6. `QuickLog` becomes the `+` button — four-tap logging

Then three optional "editions" drawn from the comparable apps: **Beli**
(rank-at-log-time via binary insertion, replacing random-pair ELO), **Strava**
(camera-roll backfill — the log writes itself), **Letterboxd** (the stub drawer
as the Shows tab + a public profile at `melo.show/<username>`). Untappd is
deliberately excluded: badge mechanics need a frequency concert-going doesn't
have.

### Supersedes

This supersedes decisions recorded in:
- `2026-04-19-bottom-nav-restructure.md` — which established the 5-tab layout
  and left open the question *"Should the + button trigger QuickLog directly
  instead of the full LogShow modal?"* Phase 6 answers it: yes.
- `2026-07-13-home-declutter.md`
- `2026-07-13-stat-collection-pages.md` — which created the Stats tab that
  Phase 3 now merges away.

Read those before re-deriving anything here.

## Changes made

- 2026-07-28: Created this initiative. Phase 1 (dead-code sweep):
  - Deleted `pages/RecapSpike.jsx` + its import (`App.jsx:42`), its route
    (`App.jsx:688`), and the founder-gated Settings row (`Settings.jsx:393-396`).
    The spike it existed to run passed on-device 2026-07-24 (all green:
    VideoEncoder present, AVC+HEVC decode, 30-frame encode in 0.3s) and its
    findings are recorded in `2026-07-16-show-recap-reel.md`. The file's own
    header instructed deletion once the spike was done.
  - **Kept `pages/ImportFromCalendar.jsx`.** The inventory flagged it as dead,
    but it is *blocked*, not dead: the Settings link is commented out
    (`Settings.jsx:386-388`) and the Onboarding step disabled
    (`Onboarding.jsx:4-9`) pending an `@ebarooni/capacitor-calendar` iOS bridge
    fix, with a documented restore path. Deleting it would discard working
    backfill machinery that the planned camera-roll backfill (Edition B) builds
    on. Instead the orphaned route at `App.jsx` was annotated so it reads as
    parked-with-a-blocker rather than as an accident.

- 2026-07-28: Phase 2 (overlay stack). Replaced the thirteen overlay `useState`s
  in `App.jsx` with one `{ id, type, props }` stack in `lib/overlays.js`.
  - Shipped with **back-compat shims on the context**, so all 15 consumer files
    were untouched by this commit — `setSelectedShow(show)` still opens and
    `setSelectedShow(null)` still closes.
  - **Two bugs fixed on the way.** (1) A push notification arriving while a
    sheet was open left that sheet stranded on top of the destination — the
    handlers only reset `tab`/`subPage`. Now the effect clears the stack first.
    (2) The moment pop-up guard was three copies of a nine-term `&&` chain that
    listed overlays by hand and **missed four of them** (festival, venue,
    artist, recap), so a rate prompt could pop over an open VenueDetail. Now one
    `quiet` flag derived from the stack, which can't drift.
  - `recap_ready` uses a single atomic `set` action — it's the only handler that
    opens two overlays, and a partial commit would show a detail page with no
    reel, contradicting the notification.
  - `id` is a monotonic counter, never an array index: an index key would
    remount every overlay above one that closes, losing scroll position and
    local state.
  - Added `src/web/lib/__tests__/overlays.test.mjs` — 18 assertions covering the
    remount invariant, atomic set, close semantics, clear-identity and
    immutability. There's no test runner in the repo, so it's a plain node
    script: `node src/web/lib/__tests__/overlays.test.mjs`.

## Open questions / follow-ups

- **`Rankings.jsx` ignores the year it's given.** `Stats.jsx:173` navigates with
  `{ year: navYear }` but `Rankings.jsx` never calls `useYearScope`, so a
  year-scoped Avg Score tile opens an all-time leaderboard. Fix during Phase 3
  or drop the year from that tile.
- **No hardware-back / `popstate` handling exists anywhere in `src/web`.** The
  Phase 2 overlay stack makes a real back handler trivial
  (`dispatch({type:'pop'})`) — worth doing as a follow-up.
- The "Shows" count will **drop** for users with festivals once Phase 3 adopts
  Stats' festival-collapsed math. Correct, but surprising.
- `App.css` is 284KB and `LogShow.jsx` 68KB — both are candidates for a split
  after this lands.
