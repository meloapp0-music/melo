---
name: music-taste-discoverability
description: Music Taste (genres/artists/city) was 3 taps deep inside Settings even though it now powers real notification behavior. Promoted to its own Profile-level page, plus a one-time Home nudge for users who skipped it.
type: project
---

# Music Taste Discoverability

- Started: 2026-07-07
- Status: shipped
- Last updated: 2026-07-07

## Context
Right after [[genre-based-notifications]] shipped (genre picks now actually
alert on any matching artist), the user asked: "instead of having to go to
profile and then settings to set this, should it be somewhere on the front
home page or in the profile but not hidden behind settings?" Confirmed the
actual path: Home → Profile tab → tap "Settings" (buried in a list with
Rankings/Songs/Buddies) → scroll to "Music taste" → edit. Three taps deep for
a feature that now has real behavioral power (it drives what you get pushed
about) is a discoverability gap worth closing.

Recommendation given (and approved): promote it to its own Profile-level
entry (Profile is "about you," so a dedicated page fits, cuts to one tap) —
NOT Home, which is already busy (Get Started checklist, Up Next, stats,
Wrapped card, Friends feed) and isn't a "check daily" surface for taste
prefs. Compromise for discovery: a one-time dismissible nudge on Home for
users who fall through the cracks (see below).

## Plan
1. Extract the `MusicTaste` editor (previously an inline function nested
   inside `Settings.jsx`) into its own page, `src/web/pages/MusicTaste.jsx`
   — same save logic (`updateProfile({favGenres, favArtists, homeCity})`),
   now with its own header + back button (→ 'profile'), matching the
   Artists.jsx/Rankings.jsx subpage convention.
2. Wire it into `App.jsx` as a new `subPage`: `'music-taste'`.
3. `Profile.jsx` — add a dedicated "Music Taste" button in the nav-button
   grid (heart icon), alongside Rankings/Songs/Buddies/Settings — one tap
   from Profile.
4. `Settings.jsx` — replace the inline editor with a `settings-link-row`
   (matching the existing Legal & Attributions pattern) so Settings-first
   users can still find it, just via a link instead of inline duplication.
5. **Home nudge for the discoverability gap GetStarted can't cover**:
   `GetStarted.jsx` already has a 'taste' step in its 3-step checklist, but
   that card disappears forever once dismissed or all 3 steps complete —
   so an EXISTING user (or one who dismissed early) who never set taste has
   no further nudge. New `TasteNudge.jsx` component: shows ONLY once
   GetStarted's own dismiss flag is set (`melo_getstarted_done` in
   localStorage) AND taste is still unset — so it never doubles up with
   GetStarted's own step, it only fills the gap after GetStarted is gone.
   Independently dismissible (`melo_taste_nudge_dismissed`).
6. Repointed `GetStarted.jsx`'s own 'taste' step CTA from generic
   `navigate('settings')` to the new `navigate('music-taste')`.

## Security spine
No new tables/RLS — reuses the existing `profiles.fav_genres`/`fav_artists`/
`home_city` columns and their existing self-only RLS policy. Pure
navigation/UI change.

## Changes made
- 2026-07-07: Built and verified (production build clean, zero console/server
  errors on reload). New files: `pages/MusicTaste.jsx`,
  `components/TasteNudge.jsx`. Modified: `App.jsx` (routing), `Profile.jsx`
  (nav button), `Settings.jsx` (inline editor → link-row), `Home.jsx`
  (renders `<TasteNudge />` after `<GetStarted />`), `GetStarted.jsx` (CTA
  retarget), `App.css` (new `.taste-nudge-*` classes mirroring `.gs-*`'s
  visual language). Not click-tested on a signed-in device (preview is
  behind login) — worth a quick pass through Profile → Music Taste and
  Settings → Music Taste on next device test.

## Open questions / follow-ups
- `profile-nav-btns` is a 2-column grid; adding a 5th button leaves the last
  row with one dangling button (cosmetic only, not broken).
- Consider a small "✓ set" indicator on the Profile button once taste is
  configured, mirroring how GetStarted shows done-state — nice-to-have, not
  built.
