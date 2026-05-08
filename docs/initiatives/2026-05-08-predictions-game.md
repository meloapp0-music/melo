# Predictions & Gamification

- Started: 2026-05-08
- Status: planned (Phase 1 targeted for v1.4, ~2 weeks)
- Last updated: 2026-05-08

## Context

User asked (2026-05-08):
> "Show rating predictions - Predict your rating before the show, see
>  how accurate you are. Setlist predictions - Guess which songs will
>  be played. 'Over/Under' game - Will they play for over/under 90
>  minutes? Encore predictions - Will there be an encore? Leaderboard."

This is one of the most original ideas in the roadmap. Nobody else in
the concert-tracker space has prediction games. It plays to:
- The user's interest in betting / prediction markets
- Loyal-user retention (returning to log predictions before AND after
  shows = 2 sessions per show vs 1)
- Data flywheel — accumulated predictions become a personal "scout
  report" for that user

The mechanic also happens to fit Melo's existing data model perfectly:
shows already have `score`, `setlist`, `vibes` — predictions are just
"the same fields, but logged before the show, then compared against
the actual after."

Ships AFTER buddies-phase-2 if leaderboards are wanted across friends.
Solo predictions can ship earlier without that dependency.

## Plan

Phased so solo predictions ship first (no social dependency).

### Phase 1 — Solo predictions (v1.4)

For any **Going** show with a date in the future, a new "Predict"
button appears on ShowDetail. Tapping opens a sheet with up to
4 prediction inputs:

1. **Score prediction** — slider 0-10, what you THINK you'll rate it
2. **Setlist prediction** — text input for songs you guess they'll play
   (autocompleting against the artist's recent Setlist.fm history)
3. **Show length** — over/under a default median for that artist
   (computed from their Setlist.fm setlist lengths)
4. **Encore?** — yes / no

Saved as a `predictions` row attached to the show. After the user logs
the actual show, an "Accuracy" card appears on ShowDetail:

- Score: predicted 8.5 → actual 9.2 → "you under-estimated by 0.7"
- Setlist: 4 of 6 predictions matched → "67% setlist accuracy"
- Length: predicted over 90 min → actual 102 min → ✓ correct
- Encore: predicted yes → actual yes → ✓ correct

Each component contributes to an overall accuracy %. Shown on the
show + aggregated on Profile.

### Phase 2 — Profile-level prediction stats (v1.4)

New "Predictor" card on Profile:
- Overall prediction accuracy (rolling)
- Best category (e.g., "you're 92% on encore predictions, 41% on
  setlists")
- Streak (consecutive correct over/under calls)
- Year-over-year improvement

Wrapped slide tie-in: "You called the encore right 14 of 18 times
this year."

### Phase 3 — Shared prediction games (v2.0+, depends on social-layer)

- "Predict together" mode for shows multiple buddies are going to
- Pre-show: each friend logs predictions privately
- Post-show: predictions revealed, leaderboard within the group
- Rolling leaderboard of "best predictor in your friend group"
- Trash talk in plan-chat (depends on social-layer DMs)

Hard-blocked on `2026-05-05-social-layer.md` Phases 5b + 5d.

## Schema

Migration `0011_predictions.sql`:

```sql
create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  show_id uuid not null references public.shows on delete cascade,
  score numeric(3, 1),                         -- 0.0–10.0
  setlist text[] not null default '{}',        -- predicted song titles
  length_over_under text check (length_over_under in ('over', 'under')),
  length_threshold integer,                    -- minutes (e.g. 90)
  encore boolean,
  created_at timestamptz not null default now(),
  unique (user_id, show_id)
);
alter table public.predictions enable row level security;
create policy "predictions_select_own" on public.predictions
  for select using (user_id = auth.uid());
create policy "predictions_insert_own" on public.predictions
  for insert with check (user_id = auth.uid());
create policy "predictions_update_own" on public.predictions
  for update using (user_id = auth.uid());
create policy "predictions_delete_own" on public.predictions
  for delete using (user_id = auth.uid());
```

Accuracy is computed at read time — no need to denormalize.

## Changes made

_None yet — planning only._

## Open questions / follow-ups

- **Setlist prediction input UX.** Free-text gets messy ("Black",
  "Black Crow", "Black Crows" — same song?). Better: autocomplete
  against the artist's recent Setlist.fm history (last 20 setlists).
  Predictions are stored as the canonical Setlist.fm song name.
- **What counts as "correct" on setlist predictions.** Exact match
  on title, ignoring case + punctuation. Cover songs are tricky —
  Setlist.fm flags them but the song titles overlap with original
  artists. Probably treat covers as separate.
- **Lock-in deadline.** Predictions should lock at showtime so users
  can't predict after the fact. Need to know the show's local start
  time — Ticketmaster has this for upcoming events; Setlist.fm
  doesn't. Soft-lock at midnight local time on the show date as a
  fallback.
- **Honest framing.** This is "for fun" — no money, no social
  betting markets, no real-money gambling. Frame copy carefully so
  Apple Review doesn't classify it as gambling (App Store guideline
  4.7).
- **Cross-link with `2026-05-05-buddies-phase-2.md`** — Phase 3
  here depends on friendships existing.
- **Cross-link with `2026-05-05-social-layer.md`** — leaderboards
  + group prediction pools depend on the social infrastructure.
