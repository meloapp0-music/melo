# Recommendations Engine — Shows & Festivals

- Started: 2026-05-05
- Status: planned (Tier 1 targeted for v1.2, ~1 week)
- Last updated: 2026-05-06

## Context

Asked by user (2026-05-05):

> "i want the melo algorithm to be able to recommend shows/festivals
> based on users past shows and festivals."

Today, Melo has discovery surfaces:

- `Festivals.jsx` — Ticketmaster festivals, with "N of your artists
  playing" badges (artist-overlap matching only)
- `Discovery` events on Home — surfaces upcoming shows for artists you've
  rated highly
- "How was [show]?" CTA on Home for past Going shows

What it doesn't do:

- Recommend shows by artists you *haven't* heard of but who match your
  taste profile
- Recommend festivals by overall vibe/genre fit, not just lineup overlap
- Surface "venues you've loved" for upcoming shows there
- Surface "you went to Coachella in 2023, here's Coachella 2026 lineup"
  proactively
- Recommend tours based on geographic patterns (you've gone to LA shows,
  here's a Vegas one)

## Plan

Build a 3-tier recommender. Each tier is independently shippable. Don't
build a deep-learning anything — Melo's data shape is small enough that
classical collaborative-filtering + content tags will outperform anything
fancy until we have 100k+ users.

### Tier 1 — Taste profile (content-based)

**Inputs:** user's rated shows (artist, score, genre), top venues, top
cities, festival history.

**Profile vector** stored in `user_taste_profile`:

- `top_genres` — weighted by show count × avg score
- `top_subgenres` — Spotify Audio Features aggregated across rated artists
- `geo_centroid` — weighted lat/lng of attended shows
- `venue_size_bias` — small-club vs arena vs festival distribution
- `recency_weighting` — last 12 months count 2×

Recompute nightly via Edge Function `compute-taste-profile`.

**Recommendation surfaces:**

- "More like {artist you rated 9}" — Spotify "related artists" filtered
  by upcoming-shows-near-you
- "Genre matches near you" — Ticketmaster Discovery filtered by genre
- "Venues you've loved" — upcoming shows at venues where you've rated
  3+ shows above 7

### Tier 2 — Collaborative filtering

**Inputs:** the full `shows` × `users` matrix.

**Approach:** matrix factorization (ALS or simple SVD) producing
`user_factors[20]` and `artist_factors[20]`. Recompute weekly via Edge
Function `compute-cf-matrix`.

Output table `user_artist_recommendations(user_id, artist_id, score,
computed_at)` — top 50 per user.

**Recommendation surface:**

- "People with your taste are also into..." — top artists with upcoming
  shows the user hasn't logged
- "Festivals your crew is going to" — collaborative weight on the
  buddies-phase-2 graph (this is the cross-link)

### Tier 3 — Festival fit scoring

**Goal:** Score each upcoming festival 0–100 for the user.

```
festival_fit =
   0.40 × (artists_you_love_in_lineup / total_lineup)
 + 0.20 × genre_overlap
 + 0.20 × geographic_distance_decay
 + 0.10 × buddy_attendance_signal
 + 0.10 × past_attendance_at_this_festival
```

Display on Festivals page as a fit bar above each festival card. Sort
order toggles: by date / by fit score / by distance.

**Recommendation surface:**

- New "For You" tab on Festivals page, sorted by fit score
- "Coachella 2026 just dropped — your fit: 87/100" notification
  (cross-link to **notifications-system**)

## Phasing

- **Phase 1 (v1.2):** Tier 1 — taste profile + content-based recs.
  Quickest win, no ML infra.
- **Phase 2 (v1.3):** Tier 3 — festival fit scoring. Builds on Tier 1.
- **Phase 3 (v1.4+):** Tier 2 — collaborative filtering. Needs enough
  users for the matrix to be non-sparse (~1k MAU minimum).

## Surfaces in the app

- **Home** — new "For You" carousel above existing Discovery section
- **Festivals page** — "For You" tab with fit-scored festivals
- **ShowDetail (past show)** — "More like this" footer card with 3
  similar upcoming shows
- **Search** — re-rank results by taste profile when query is generic
  ("rock", "festival")

## Changes made

- 2026-05-06: Re-prioritized in response to user feedback. Tier 1
  (taste profile + content-based recs) pulled forward to v1.2. No ML
  infra required; aggregation queries + Spotify related-artists API.
  Tier 2 (festival fit scoring) follows in v1.3. Tier 3 (collaborative
  filtering) genuinely needs ~1k MAU before the matrix is non-sparse,
  so its v1.4+ slot stands.

## Open questions / follow-ups

- **Cold start.** New user with 0 shows logged. Onboarding asks "pick
  3 favorite artists" → seed taste profile from Spotify related-artists.
  Already have Spotify integration via existing API proxy.
- **Genre source of truth.** Spotify per-artist genres are noisy ("dance
  pop", "alt z", "stomp and holler"). Map to a controlled vocabulary of
  ~30 macro-genres. Seed manually, expand as needed.
- **Negative signal.** Rated below 5 = "less of this." Worth
  experimenting but not v1.
- **Festival fit weights are guesses.** Need A/B testing infrastructure
  to tune. v1.2 ships with the static formula above; v1.3 adds eval
  framework.
- **Spotify API rate limits.** Related-artists endpoint is fine for
  per-user calls but the offline batch (computing top-20 related per
  artist for the whole catalog) will need careful pacing.
- **Cross-link with `2026-05-05-notifications-system.md`** — fit-score
  changes ("Festival X added an artist that bumped your fit from 60 →
  85") are a notification trigger.
- **Cross-link with `2026-05-05-buddies-phase-2.md`** — buddy attendance
  is a Tier-3 signal and a Tier-2 collaborative seed.
- **Cross-link with `2026-05-05-venue-and-merch-links.md`** — venue
  metadata enriches the "venues you've loved" surface.
