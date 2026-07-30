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

- 2026-07-28: Phase 3 (the merge). `pages/Stats.jsx` + `pages/Profile.jsx` →
  `pages/You.jsx`; both originals deleted. Built from Stats as the base (year
  scope, festival-aware counts, navigating tiles) with Profile's five unique
  blocks folded in: avatar hero, Wrapped archive, Milestones, Your Story, nav row.
  - **The two pages disagreed more than the inventory suggested.** On a library
    with one three-set Coachella weekend, Profile showed **4 shows / 4 venues**
    and Stats showed **2 shows / 1 venue**. You keeps Stats' math: a festival is
    one night out, and "Sahara Tent" is not a room you've been to. Users with
    festivals WILL see their Shows and Venues counts drop. That's the bug being
    fixed, not a regression.
  - Deleted three duplicated blocks (stat grid, streak cards, Top Genres) and
    the three memos behind them.
  - **The empty-state early return was a landmine and is gone.** Stats returned
    early at zero shows; carried over verbatim that would have hidden the avatar
    AND the nav row — and Settings (so sign-out and account deletion) is linked
    from this page and nowhere else. The hero and nav row now render outside the
    branch, so a brand-new account is never stranded.
  - Nav row trimmed 6 buttons → 3 (Buddies, Music Taste, Settings). Rankings,
    Songs and Map are reachable from the stat tiles.
  - Scope decisions: Your Story is year-scoped (already year-grouped, so it
    reads as "that chapter"); Milestones stay all-time and now *say* "All time"
    when a year is picked, because a "First Show" badge that locks when you
    select 2024 is a bug, not a filter; the Wrapped archive is all-time (it IS a
    year picker).
  - Fixed a latent mutation while transcribing: Profile sorted `yearShows`
    in place inside render.
  - Both tabs route to `You` for now — the merge ships before the nav change.
  - Added `src/web/lib/__tests__/you-counts.test.mjs` pinning the count change.

- 2026-07-28: Phase 4 (four tabs). `Home | Shows | + | You`. The grid was
  already `repeat(5, 1fr)` and the FAB still occupies the middle slot, so the
  tab bar needed **no CSS change at all**.
  - `TAB_ALIAS` deleted. It solved the opposite problem — mapping orphan *tabs*
    (map/songs/buddies) onto a visible tab — and those are subPages now.
    Replaced with `SUBPAGE_PARENT`, which keeps the parent tab lit inside a
    drill-in. **This fixed a live bug:** `activeKey = subPage || …` resolved to
    a value matching no tab on every subPage, so the whole bar went dark.
  - `PAGE_ALIAS = { stats: 'you', profile: 'you' }` inside `navigate()` means
    the tab rename didn't have to be a mechanical find-and-replace across eight
    files. `setStatsYear` runs BEFORE alias resolution so a legacy
    `navigate('stats', { year })` keeps its scope.
  - Re-pointed nine back buttons and corrected their labels (three still said
    "Stats"/"Profile", two said "Back" while going somewhere specific).
  - **`Songs.jsx` had no back button** — it never needed one as a tab, and as a
    drill-in it was a dead end. Added one floated over its full-bleed hero
    (new `.hero-back`), plus `navigate` to its `useApp()` destructure.
  - **The `friend_request` push was the highest-risk item and is fixed.** It
    did `setTab('buddies')`; with buddies no longer a tab that falls through
    `renderPage`'s switch to `default: <Home />` and silently lands on the wrong
    screen — the exact regression a user already reported for genre alerts. Now
    `setTab('you') + setSubPage('buddies')`.
  - Added `src/web/lib/__tests__/nav-graph.test.mjs` — a static audit that
    parses TABS, PAGE_ALIAS, SUBPAGE_PARENT, every `navigate('…')` literal and
    every `<Tile to="…">`, then asserts every target resolves and every drill-in
    has a real parent tab. It strips comments first, so prose about the old
    routing can't be mistaken for the old routing.

- 2026-07-28: Phase 5 (`ArtistShowPicker`). Pure refactor — no UI change.
  Pulled the artist input, both upstream searches, the artist avatar, the
  dropdown and the "use what I typed" escape hatch out of `LogShow.jsx` into
  `components/ArtistShowPicker.jsx`. **LogShow lost 252 lines** (1641 → 1389).
  - The split is at *search* vs *what a pick does*. The component emits a
    normalised draft (`{ kind: 'show'|'artist'|'typed', artist, venue, city,
    date, festival, songs, lineup }`); the sheet decides which fields to fill.
    LogShow fills thirteen sections and chases co-acts for opener suggestions;
    QuickLog will fill four. Putting that decision in the component would mean
    it knew about forms.
  - This is where logging speed actually comes from — picking a real row
    autofills venue, city, date, festival and the setlist in one tap. Without
    it a "quick" log is four text inputs and no faster than the long form.
  - Also removed four now-dead `api` imports and the orphaned
    `showResultLocation` helper from LogShow.
  - Verified in a browser harness: typed a query, the Setlist.fm search ran,
    the empty state rendered with the right copy and attribution, and clicking
    the escape hatch fired `onPick({ kind:'typed', artist:'Goose' })` — correct
    shape, `titleCase` applied, input updated, dropdown closed. Then rendered
    the whole of `LogShow` against a mock context and confirmed all thirteen
    sections still render with the picker in place.

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
