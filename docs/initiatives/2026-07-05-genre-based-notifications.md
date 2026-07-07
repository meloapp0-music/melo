---
name: genre-based-notifications
description: Settings' "favorite genres" were captured but never used for anything — tour-alerts only ever watched named artists. Now genres power their own "any artist in this genre, in my city" alerts, round-robin balanced across the genres a user picks.
type: project
---

# Genre-Based Notifications (round-robin balanced)

- Started: 2026-07-05
- Status: shipped — deployed to production
- Last updated: 2026-07-05

## Context
User's exact complaint: "I feel like I only get notified if an artist I enter
announces a show. It should be for every artist within that genre. And it
should balance all genres I select evenly." Verified in code: `fav_genres`
is captured at onboarding/Settings (`profiles.fav_genres`, migration 0013,
`TasteEditor.jsx`) but the `tour-alerts` cron (the only push-notification
source for "an artist you care about is playing") **never reads it** — it
only ever watches `fav_artists` (named artists) plus shows-derived
wishlist/going/loved artists. Picking genres in Settings did literally
nothing. This is the same underlying gap as [[artist-tracking-anywhere]]
(small-venue coverage) — Ticketmaster is the only signal source — but a
different axis: breadth of DISCOVERY (any artist in a genre) rather than
depth of VENUE coverage.

## Plan
1. Add a `GENRE_TM_MAP` in `tour-alerts/index.ts` mapping the 12
   `TasteEditor` genre labels to Ticketmaster Discovery `classificationName`
   values. 11 have a confident, stable TM match (verified against
   Festivals.jsx's already-proven-live genre mapping + TM's well-established
   public taxonomy). "Indie" isn't a standalone top-level TM genre, so it
   falls back to a `keyword` search (still scoped to the music segment) —
   approximate rather than a strict filter, but functional instead of silently
   dropping the genre.
2. `searchTmByGenre(genre, city)` — one Discovery call per genre, ANY artist
   (not name-filtered), scoped to the user's home city (genre-wide alerts
   without a city would be a firehose of every matching show worldwide, so
   — like the existing named-artist taste alerts — this only fires once a
   city is set).
3. **Balance evenly = round-robin, not first-come-first-served.** Query all
   the user's selected genres, collect not-yet-notified candidates per
   genre, shuffle the genre order (so whichever genre was picked first
   doesn't always win ties), then take ONE candidate per genre per pass
   until either a genre runs dry or the per-run cap is hit. A genre with 30
   matching shows in Chicago can't crowd out a genre with 2 — each gets a
   fair turn at the (small) notification budget every run, and dedup via
   `notifications_sent` means the "shortchanged" genre isn't
   double-penalized on subsequent days either.
4. New `MAX_GENRE_NOTIFS_PER_USER = 2` sub-cap (out of the existing
   `MAX_NOTIFS_PER_USER = 5`) so genre-wide discovery — inherently much
   noisier than a handful of named artists — can't crowd out the
   higher-signal pre-show reminders and named-artist alerts that run first
   in the same loop.
5. New `notifications_sent` kind: `'genre_alert'`. **Critical fix caught in
   review**: the query that loads PRIOR sends (`sentByUser`) didn't include
   `'genre_alert'` in its `.in('kind', [...])` filter — without that, dedup
   would silently never work and the same show could re-notify every day.
   Fixed before deploy.
6. Settings copy (`TasteEditor.jsx`) updated to actually describe the new
   behavior — genres now explicitly say "any artist in these genres,
   rotates fairly"; the city hint clarifies both genres and named artists
   are matched against it.

## Security spine
No new tables/RLS surface — reuses the existing `profiles.fav_genres`
column (already RLS'd self-only) and the existing `notifications_sent`
table/policy. The Edge Function already runs with the service role
(server-only), same as before; no client-exposed secrets added.

## Changes made
- 2026-07-05: Built and verified. `supabase/functions/tour-alerts/index.ts`:
  `GENRE_TM_MAP`, `MAX_GENRE_NOTIFS_PER_USER`, `searchTmByGenre`,
  `TmGenreEvent`, the round-robin genre-alert loop, `fav_genres` now selected
  and carried through `prefs`/`byUser`, and the `sentByUser` kind-filter fix.
  `TasteEditor.jsx` copy updated. Client build compiles clean, zero runtime
  console/server errors on reload. Could not run a Deno typecheck (CLI not
  installed locally) — verified by careful manual read-through of the whole
  file instead (types, braces, control-flow narrowing all check out).
  **DEPLOYED** — user approved; `supabase functions deploy tour-alerts
  --no-verify-jwt` pushed version 16 live (confirmed via `supabase functions
  list`: ACTIVE, version 16). Runs on the existing daily schedule (~1pm ET) —
  no separate schedule change needed, a deploy just updates the code the
  next scheduled run executes.

## Open questions / follow-ups
- `MAX_GENRE_NOTIFS_PER_USER = 2` and the 12-genre `GENRE_TM_MAP` are
  reasonable first defaults, not something the user explicitly signed off
  on the exact numbers — easy to tune once real usage shows if it's too
  loud/quiet.
- "Indie" approximate-match (keyword fallback) may need a look if
  Ticketmaster's Music genre taxonomy changes — verify against a live
  classifications call, blocked this session by TM's 429 rate limit on this
  account's key.
- Ties into [[artist-tracking-anywhere]] — the JamBase small-venue search
  isn't wired into this cron; genre alerts today are Ticketmaster-only, so
  the same big-venue-only limitation applies here too.
