# "Going" Tier — third status between Wishlist and Attended

- Started: 2026-04-20
- Status: shipped
- Last updated: 2026-04-20

## Context

Until today, every show in Melo was binary: `wishlist: true` (vague
want) or `wishlist: false` (already attended and scored). There was no
middle state for **"I have a ticket / I'm going."** Those shows were
awkward — dropping them in Wishlist meant they sat next to "someday
maybe" entries, and they couldn't have the countdown / "how was it?"
affordances they deserved.

User's request (verbatim, continuing from the wishlist-and-detail-fixes
initiative):

> "ok one more fix. for the wishlist if im going or want to go to a
> show thats a few months away, for example mt joy at red rocks in
> august, i want to be able to log that in my wishlist or maybe add a
> feature with something of like concerts i bought tickets to or shows
> i am going to"

Two-step plan approved: Step 1 (broaden Ticketmaster search so the
right future show is actually discoverable) shipped as part of
`2026-04-19-wishlist-and-detail-fixes.md`. This initiative is Step 2.

## Plan

Backwards-compatible data model + a helper-driven read path so every
reader gets updated exactly once.

- New `status: 'attended' | 'going' | 'wishlist'` column + field as
  the source of truth.
- Legacy `wishlist` boolean stays in the DB + in-memory shape as a
  compat shadow so any reader we miss degrades least-wrong. Going
  shows write `wishlist: false` (visible bug — missed filter
  over-counts Attended — which is what we want to catch).
- Helpers (`isAttended`, `isGoing`, `isWishlist`, `getShowStatus`)
  live in `store.js`. All readers switch to these.
- Home gets two new sections:
  - **Going countdown** — up to 3 future Going shows with
    "in 12 days" / "Tomorrow" copy.
  - **"How was [show]?" CTA** — past Going shows (date < today) get a
    tap-to-score card at the top of Home. One tap opens LogShow in
    edit mode with status pre-flipped to Attended so the user lands
    directly in the score/vibes editor.
- LogShow's 2-tab toggle becomes a 3-tab segmented control. Attended
  shows full form; Going + Wishlist show only artist/date/city/venue.
- MyShows' 2-tab toggle becomes 3-tab with counts.

## Changes made

- 2026-04-20: `supabase/migrations/0002_show_status.sql` — NEW. Adds
  `shows.status text not null default 'attended'` with
  `check (status in ('attended','going','wishlist'))`, backfills from
  existing `wishlist` boolean, and adds `shows_user_status_idx` for
  the MyShows tab queries.
- 2026-04-20: `src/web/store.js` — added `SHOW_STATUS` enum +
  `getShowStatus()` / `isAttended()` / `isGoing()` / `isWishlist()`
  helpers. `calculateStreak` and `getWrappedYears` now use
  `isAttended` instead of `!s.wishlist`.
- 2026-04-20: `src/web/lib/db/shows.js` — `fromRow` + `toRow` now
  always emit both `status` and the legacy `wishlist` shadow derived
  from it via a new `deriveStatus()` helper. `updateShow`'s field
  allowlist adds `status`; patches that set `status` without an
  explicit `wishlist` update auto-sync the shadow.
- 2026-04-20: `src/web/pages/LogShow.jsx` — replaced 2-tab toggle
  (`wishlist` boolean state) with a 3-tab segmented control
  (`status` enum state). The 6 `!wishlist &&` guards on
  score/vibes/setlist/buddies/notes become `isAttendedTab &&`. Added
  optional `editingShow` prop — when set, hydrates all fields,
  default-pivots Going → Attended (so the "how was it?" CTA lands in
  score mode), and `handleSubmit` calls `updateShow` instead of
  `addShow`. Autocomplete branching now picks Setlist.fm for Attended
  vs Ticketmaster for Going+Wishlist. Submit button label varies:
  "Log Show" / "I'm Going" / "Add to Wishlist" / "Save Show".
- 2026-04-20: `src/web/App.jsx` — added `logEditTarget` state +
  `setLogEditTarget` in context. Renders `<LogShow editingShow={...}>`
  when either `showLog` or `logEditTarget` is set. onClose resets
  both.
- 2026-04-20: `src/web/pages/MyShows.jsx` — 3-tab UI with
  `SHOW_STATUS.ATTENDED / GOING / WISHLIST` tabs, live counts via
  `isAttended`/`isGoing`/`isWishlist`. Filter is now
  `getShowStatus(s) === activeTab`. Score badges guarded by
  `isAttended(show)`. New empty-state copy per tab.
- 2026-04-20: `src/web/pages/Home.jsx` — renamed `nonWishlist` →
  `attended` everywhere. Added **"How was [show]?"** recap section
  above the hero stats (shows up to 3 past Going shows), each card
  opens LogShow in edit mode via `setLogEditTarget(show)`. Added
  **"You're Going"** section with countdown ("Tomorrow", "in 12 days",
  "in 3 weeks", etc.) below the Wrapped banner. Quick-add-wishlist
  button now writes `status: 'wishlist'` alongside the legacy boolean.
- 2026-04-20: `src/web/pages/Profile.jsx`, `Wrapped.jsx`,
  `Rankings.jsx`, `Songs.jsx`, `Buddies.jsx`, `ConcertMap.jsx`,
  `components/ShowComparison.jsx`, `components/QuickLog.jsx` — all
  converted from raw `!s.wishlist` checks to `isAttended(s)` /
  `shows.filter(isAttended)`. QuickLog payload now writes
  `status: 'attended'` explicitly.
- 2026-04-20: `src/web/App.css` — added `.log-status-tabs` (flexes
  each `.shows-tab` child to 1/3 width with tighter padding so the
  three-way segmented control doesn't overflow the sheet on narrow
  screens), `.going-recap` + children (warm amber-tint gradient card
  family matching the Wrapped banner language), and
  `.upcoming-btn-going` (green tint for the ticket chip on Going
  countdown cards — distinct from the orange Tickets / Wishlist
  buttons on discovery cards).
- 2026-04-20: `npm run build` passes clean (87 modules, 0 warnings).

## Verification plan

1. Apply migration via Supabase dashboard or `npx supabase db push`.
   Confirm `select status, count(*) from shows group by status;`
   returns sensible buckets (legacy rows all backfilled to
   `attended` or `wishlist`).
2. Hard-refresh Melo.
3. **LogShow**: Tap `+`. See Attended | Going | Wishlist tabs.
   - Attended: existing flow unchanged.
   - Going: Ticketmaster autocomplete (Mt Joy + Denver finds Red
     Rocks Aug). Save writes `status: 'going'`.
   - Wishlist: same Ticketmaster flow; save writes `status:
     'wishlist'`.
4. **MyShows**: 3 tabs with live counts; score badges only on
   Attended.
5. **Home**: With a future Going show, "You're Going" section
   appears with countdown. With a past Going show (shift a row's
   date in the DB to verify), "How was [Artist]?" CTA appears at
   top of Home; tap opens LogShow in edit mode with status pivoted
   to Attended and score/vibes/setlist all visible.
6. **Stats**: Profile, Wrapped, Rankings, Streak should not count
   Going shows as attended.

## Open questions / follow-ups

- Push/calendar reminders for upcoming Going shows — nice-to-have,
  deferred.
- Showing Going shows in the social feed — defer to Phase 3 social
  work.
- A one-tap "convert Wishlist → Going" button in MyShows (today the
  user edits the show and switches the tab). Polish for later.
- Supabase migration `0002_show_status.sql` still needs to be run
  against prod. Local dev is fine either way because `deriveStatus`
  in the DB layer handles rows without a `status` column.
