# IA Simplification — four tabs, one overlay stack, four-tap logging

- Started: 2026-07-28
- Status: main plan shipped · Edition A (Beli) shipped · B and C remain
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

- 2026-07-28: Phase 6 (four-tap logging). The `+` button opens `QuickLog`, and
  `navigate('log')` now means the fast path — the full sheet is one tap further
  in, and callers that specifically need it (the post-show rate prompt,
  tour-alert deep links) open it directly with `openOverlay('log', …)`.
  - **The four taps:** `+` → type a few letters → tap the show row → tap a
    score → Save. Venue, city, date, festival and the whole setlist come from
    the picked row. That autofill is the speed.
  - Picking a row now shows a **confirmation** ("📍 Rose Bowl · Pasadena",
    "🎵 22 songs from the setlist") instead of four more inputs. The venue field
    only appears when nothing filled it in.
  - **The handoff no longer loses work.** "Add photos, vibes & more →" used to
    call `onClose()` then open a *blank* LogShow. `prefill` is widened to seed
    artist/date/city/venue/festival/genre/score/setlist, guarded so
    `editingShow` always wins.
  - **Payload drift fixed.** QuickLog wrote the string literal `'attended'`
    instead of `SHOW_STATUS.ATTENDED` and omitted `festival`, `openers`,
    `venueUrl` and `videos` — a quick-logged show was a subtly different row.
  - **Funnel parity.** `show_log_started` / `show_log_abandoned` /
    `show_logged` now fire from both sheets with `surface: 'quick' | 'full'`.
    Without this, moving the `+` button would have dropped `show_logged` to
    near-zero and the dashboards would have lied.
  - **Bug found and fixed while verifying:** the "yesterday" default used
    `new Date(Date.now() - 86400000).toISOString()`. `toISOString()` is UTC, so
    west of Greenwich it serialises back to *today* for most of the evening —
    proven live (old code returned 2026-07-29 on 2026-07-29). Now built from
    local date parts, the same reason `App.jsx` has `localDayKey()`.
  - Going/Wishlist deliberately stays out of the fast path; it gets one quiet
    link to the full sheet. The 10-second case is "I just saw this".
  - Added `src/web/lib/__tests__/log-parity.test.mjs` — asserts both sheets
    write the same 17 payload keys, that neither uses a literal status, that
    all three funnel events fire from both with a `surface` tag, and that the
    date default doesn't go through `toISOString`.
  - Verified end-to-end in a harness: drove the four taps and inspected the
    saved row (artist title-cased, date 2026-07-28, score 9, status attended,
    all 17 fields present, toast fired); then drove the handoff and confirmed
    the draft — including a hand-typed venue — arrives in LogShow with every
    field seeded.

- 2026-07-28: **Edition A — the Beli mechanic.** Rank-at-log-time by binary
  insertion, replacing random-pair ELO as the source of truth.
  - **Why the old mechanic was wrong, not just slow.** `Rankings.jsx` voted on
    random pairs and fed ELO. That converges slowly, converges only to an
    *estimate*, and lives on a page two levels under You — so most libraries had
    no meaningful order at all. And it never asked about the show you just
    logged, which is the one moment you actually have an opinion.
  - **What replaced it.** `lib/ranking.js` binary-searches a new show into the
    existing ranked list. ⌈log₂(n+1)⌉ questions, and the answer is EXACT
    immediately: 7 shows → 3 questions, 31 → 5, 1000 → 9.
  - **Why it matters beyond the game:** it fixes a cut already shipped. "Where
    it ranks" sorted on the 1–10 score, and scores compress hard into 8–10
    because nobody buys tickets to shows they expect to hate. That cut was
    announcing a rank the user never agreed to. It now reads the true order.
  - `components/RankDuel.jsx` opens ~450ms after any *attended* show is saved
    (both sheets close before their `addShow` resolves, so it lands on a clean
    screen). Skippable, and "Good enough — place it here" commits at the best
    current guess rather than discarding the answers already given.
  - Migration `0019_ranking_position.sql` adds `position` to `rankings`. **`elo`
    is kept, not dropped** — Battle Mode still writes it and existing rows still
    carry it. Readers prefer `position` and fall back to score order. RLS is
    untouched; the 0001 "rankings self all" policy already scopes to `auth.uid()`
    and a new column inherits it.
  - Positions are rewritten **wholesale** on each insert rather than patched.
    Inserting at k shifts everything below anyway, and a partial update can
    leave a gap or two shows at #4 — invisible until a leaderboard renders it.
  - `rankPositions` loads once with the rest of app state and `RankDuel` writes
    back into it, so the leaderboard, the receipt and the recap cut all read one
    answer without each re-fetching.
  - Added `src/web/lib/__tests__/ranking.test.mjs` — **exhaustive**: every
    insertion position for every list size 0–30 (496 cases) checked against a
    known-correct ordering, plus question-count scaling, early exit, mixed
    placed/unplaced ordering, and immutability.
  - Verified in a browser harness against an 8-show library: the duel compared
    against indices 3 → 1 → 2 (textbook binary search), landed the show at #4
    of 8, and rewrote positions densely with no gaps or duplicate ranks. All
    four result-copy paths checked — #1, mid, last, and the "Better than Big
    Thief" displaced-show line.

- 2026-07-28: **Edition A, part 2 — the back-catalogue ranker and the derived
  score.**
  - **The back catalogue.** The log-time duel only ever places NEW shows, so a
    library logged before ranking existed stayed ordered by the compressed 1–10
    score this was meant to replace. `RankDuel` now takes an optional `queue`
    and places shows back to back, re-reading positions between rounds so each
    one searches against the updated order. Entry point is a card on
    `Rankings.jsx` — "N shows have never been placed" — batching ten at a time.
  - **Correctness fix found while building it.** The duel was searching against
    `rankedOrder(all shows)`, which interleaves *unplaced* shows by score.
    Binary search requires a genuinely sorted list; feeding it a score-sorted
    tail meant it could confidently return the wrong slot. Now only shows that
    already hold a position are comparison candidates, so the ranked set builds
    up from nothing: first show is #1 unopposed, second takes one question.
  - **The melo score** (`meloScore` in lib/ranking.js) — a decimal DERIVED from
    rank rather than typed in, which is the actual Beli idea. The scale is
    relative to your own library: 9.4 means "near the top of what I've seen",
    not a claim about the show in the abstract, so two users' numbers aren't
    comparable by design.
    - The spread GROWS with the library — 3 shows → 9.9 / 9.6 / 9.2, not
      9.9 / 8.2 / 6.5. Calling your third-best night a 6.5 would be a lie: you
      know it's third, you don't know it's bad. The range opens to 9.9–6.5 once
      the collection has ~11 shows and earns the resolution.
    - The leaderboard shows it; unplaced shows show "–" rather than a fake
      number.
  - **NOT done, deliberately:** the hand-entered 1–10 still exists and still
    drives the receipt cut, the Avg Score tile and `ShowDetail`. Two numbers now
    coexist. Making the derived score the app-wide display value is a real
    product decision with a wide blast radius — it should be taken on purpose,
    not smuggled in with a mechanic change.
  - Verified: `ranking.test.mjs` grew 9 score assertions (monotonic descent,
    range bounds, small-library tightness, one-decimal formatting, order
    independence). Then drove the queue in a browser against five unplaced
    shows with a deterministic comparator — it fully ordered them in **six
    questions** and the final order matched the oracle exactly.

- 2026-07-28: **The derived score became the primary one** — swept across every
  surface that shows a rating.
  - `showScore(show)` on the app context is now the single place anything asks
    "what number goes here?": the derived score when the show has been ranked,
    the entered 1–10 when it hasn't, null when neither. One resolver, one answer.
  - Swept: `ShowDetail` (hero + "your rating that night"), `MyShows` (all four
    card variants), `ArtistDetail` / `VenueDetail` / `FestivalDetail` (per-row
    AND their averages), `ShowComparison`, `Artists` averages, the `You` Avg
    Score tile, `Wrapped` (best show + year average), the recap `receipt` and
    `setlist` cuts, and all seven share-card renderers.
  - **Share cards took one substitution, not seven.** Five React styles and two
    canvas paths all read `show.score`, so `ShareCardView` hands them a shallow
    copy with the derived score already in place. Same trick for the MP4
    exporter, which rebuilds scenes from the show alone.
  - `groupIntoOutings(shows, scoreOf)` grew an optional resolver so a festival's
    averaged score agrees with the shows inside it. Defaults to the entered
    score, so any caller that doesn't opt in is unchanged.
  - **Friends' shows deliberately keep the RAW score.** `rankings` is RLS
    self-only: another user's order is invisible by design, and applying our own
    scale to their show would be wrong even if we could. `FriendsFeed` and
    `UserProfileView` are commented so this doesn't get "fixed" later.
  - **"Perfect 10" could never unlock again** once scores cap at 9.9, so that
    milestone became "Number One — ranked a show as your all-time best", which
    is the thing it was really trying to celebrate.
  - Three real breaks caught before commit, none of which the build flagged
    (Vite doesn't type-check): `ShareCardView` renamed its prop without the
    replacement landing, leaving `show` undefined; `You` and `Artists` used
    `showScore`/`rankPositions` without destructuring them. Added a
    multiline-aware scan for context identifiers used but not destructured.
  - Verified live: three shows all entered as **9** now render **9.9 / 9.6 /
    9.2**, and an unranked fourth falls back to its entered 7 — the compression
    the whole mechanic exists to fix, visibly broken open.

- 2026-07-28: **The 1–10 input became three buckets** — Loved it / It was
  fine / Not for me — which answers the open question the sweep raised.
  - A ten-point scale asks for precision nobody has on the way home, and the
    answers piled up at 8–10 anyway. Three options are a question people can
    actually answer, and the duel already does the fine ordering.
  - **The bucket does real work: the ranked list is now PARTITIONED by it.**
    Every "Loved it" sits above every "It was fine", which sits above every
    "Not for me". Two consequences: placement searches only within the bucket
    (fewer questions), and you are never asked whether a night you loved beat
    one you disliked — a comparison with no useful answer.
  - **No migration.** The bucket is stored in the existing numeric `score`
    column as a representative value (9 / 6.5 / 3), so every pre-existing 1–10
    classifies itself: ≥8 loved, ≥5 fine, else not-for-me. Editing an old show
    shows the right bucket already selected. Export is unaffected.
  - `startPlacement(list, id, { bucket, bucketOf })` confines the window; called
    without those options it searches the whole list, which is what a library
    predating buckets needs.
  - Deleted 10 now-dead CSS rule blocks (~1.7KB) for the old pickers.
  - Verified: 12 new assertions covering classification, round-tripping,
    in-bucket confinement, and — the important one — that the resulting list is
    still bucket-partitioned after *every* possible landing spot. Then drove it
    live: picking "It was fine" stored 6.5, and the duel over a partitioned
    nine-show library asked only **two** questions, both against fine-bucket
    shows, landing the show last in its block and above both "not for me" ones.

- 2026-07-31: **Reworded the duel, and made ranking opt-out.**
  - **"Which was better?" → "Which would you relive?"** Beli's wording is a
    quality judgement, which is right for restaurants and wrong here: it reads
    as scoring the artist rather than remembering the night, and that's the
    thing people object to about ranking music. Same mechanic, same data, but
    it's also a *more accurate* question — the mediocre band on the night you
    fell in love beats the technically better show you saw alone, and everyone
    knows it.
  - **Settings → "Compare shows after logging"**, default ON. Ranking stays
    opt-OUT because it's what makes the scores honest and almost nobody would
    turn it on deliberately — but plenty of people find ranking music
    distasteful and shouldn't be stuck with it. Off stops the duel and the
    backlog prompt; the bucket stays the score, and the drawer, recaps and
    leaderboard are untouched. Existing rankings are kept, not deleted.
  - Stored in `lib/prefs.js` (localStorage), **per-device rather than synced**:
    `user_settings` writes proxy through the `setlistfm-set-key` Edge Function,
    so a synced column would mean a migration plus a new write path — out of
    proportion to a UI preference. Promote it if it ever needs to follow a user.
  - Verified in-browser: defaults ON, both directions persist, a corrupted
    value degrades instead of throwing (localStorage throws outright in
    private-mode Safari and some WKWebView configs).

- 2026-07-31: **Made the score recessive on show surfaces.** The ranking now
  reads as memory rather than criticism; the number didn't. Three surfaces
  softened, two deliberately left alone.
  - `.detail-hero-score` — was a 60px ember-gradient circle at 24px bold with a
    white ring and a coloured glow, which made it the second-loudest element on
    the screen after the artist's name. Now a small translucent pill. The ring
    and glow were removed too: on a quiet pill they'd have re-created exactly
    the prominence being taken away.
  - `.show-poster-score` — filled circle → small dark pill, 12px → 11px.
  - `.show-list-score` — was gradient-clipped text at 20px/800, which reads as
    "this is the important part of the row". Now plain muted text at 14px/700.
    The row's subject is the show, not its rating.
  - **Left alone on purpose:** the leaderboard (`.rank-elo`) and the duel result
    (`.duel-result-score`). In both places the number IS the content — a
    leaderboard without visible scores is just a list, and the duel's payoff is
    seeing where the night landed.

## Open questions / follow-ups

- **`Rankings.jsx` ignores the year it's given.** `Stats.jsx:173` navigates with
  `{ year: navYear }` but `Rankings.jsx` never calls `useYearScope`, so a
  year-scoped Avg Score tile opens an all-time leaderboard. Fix during Phase 3
  or drop the year from that tile.
- **Migration 0019 applied 2026-07-28** (dashboard SQL editor; the CLI isn't
  linked to the project — `supabase link` needs the db password).
- **Unranked shows still display a bucket's representative number** (9.0 / 6.5
  / 3.0) as their fallback, which is slightly false precision. Showing the
  bucket LABEL instead until a show is placed would be more honest — worth
  doing if the back-catalogue ranker doesn't get used much.
- **Export still writes the raw score** (`lib/exportShows.js`) — correct, since
  it's a data dump, but a `melo_score` column alongside it would be useful.
- **Battle Mode still writes ELO** and is now a third ordering nothing reads.
  Strongest option: rebrand it as "settle some ties" and have it write
  `position` (swap two adjacent shows) instead of `elo`.
- **Re-ranking isn't possible yet.** A show placed once can never be moved
  without re-logging it. A "move this up/down" affordance on ShowDetail, or the
  Battle Mode rebrand above, would close that.
- **No hardware-back / `popstate` handling exists anywhere in `src/web`.** The
  Phase 2 overlay stack makes a real back handler trivial
  (`dispatch({type:'pop'})`) — worth doing as a follow-up.
- The "Shows" count will **drop** for users with festivals once Phase 3 adopts
  Stats' festival-collapsed math. Correct, but surprising.
- `App.css` is 284KB and `LogShow.jsx` 68KB — both are candidates for a split
  after this lands.
