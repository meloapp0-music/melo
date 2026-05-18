# Comparative Rating System (Beli-style)

- Started: 2026-05-18
- Status: planned (headline-worthy — release slot TBD)
- Last updated: 2026-05-18

## Context

Today a show's `score` is an absolute integer 1–10 the user types on
the LogShow 1–10 button row. The problem: **people are bad at absolute
scores.** "Is this an 8 or an 8.5?" is unanswerable in a vacuum, so the
numbers drift, don't mean much, and aren't consistent across a library.

User request (2026-05-18):
> "when i rate a show, and then rate another show, is there a way for
>  the score of previous shows to be edited automatically? like how
>  Beli does it — based on what you rated it and battle mode, it
>  provides specific ratings 0–10 including decimals."

This is the **Beli model**: you don't score in a vacuum, you score by
**comparison**, and the precise decimal score is *derived* from where a
show lands in your ranked list. Adding a new show re-places it and
shifts other scores, because the whole system is relative.

**This also resolves an earlier tension.** On 2026-05-13 the user
rejected "Compare" as a *marketed* competitive feature ("i just dont
think that makes sense to make it a main aspect"), and it was demoted
to a silent Wrapped tiebreaker. The Beli framing fixes that: comparison
is no longer *battling* — it's **calibration**, the app helping you be
honest about how a night actually felt. Not competitive, introspective.
That fits Melo, and it makes comparison a legitimate core mechanic.

**Existing groundwork** — the app is already half-pointed here:
`src/utils/elo.js` (an Elo implementation), the `battle_wins` column
(migration 0007), the `ShowComparison` component, and the `Rankings`
page. This initiative finishes a road that's already started.

## Plan

### The model — positional (true Beli), not Elo

Two candidate engines:

- **Elo** (`elo.js` groundwork): each comparison is a match; both
  shows' ratings nudge; score = normalized Elo. Rejected as the
  primary model — scores only move for shows you *directly* compare,
  so "previous shows update automatically" is weak, and Elo values are
  unpredictable to users.
- **Positional / Beli** (recommended): maintain a **total order** of
  attended shows. A new show is **binary-searched** into the order via
  a few head-to-head comparisons. Each show's **score = its position
  in the order, scaled to 0–10**. Adding a show shifts positions →
  every score recomputes. This is literally how Beli works, the score
  is explainable ("4th of 22 → 9.1"), and it delivers exactly the
  "previous shows auto-update" the user asked for.

### The logging flow (Beli's actual UX)

When a show is logged/edited as **Attended**:

1. **Gut bucket** — instead of (or seeding from) the 1–10 row, ask a
   coarse sentiment: **Loved it / It was solid / Not for me**. Each
   bucket maps to a score band (e.g. Loved = 6.7–10, Solid = 3.4–6.6,
   Not for me = 0–3.3).
2. **Binary-compare within the bucket** — "Which hit harder —
   {new show} or {existing show}?" Repeated ~log2(bucket size) times
   (cap ~5) to binary-search the new show's exact slot.
3. **Score is derived** from final position within the bucket's band.

A new show with an empty library skips comparisons (it's #1 by
default). The flow is fast — 2–4 taps.

### Schema (sketch — finalize before building)

- `shows.rank` — a float sort-key giving the total order. New shows get
  a key between their two neighbors (gap-keyed, so inserts don't
  renumber the table).
- `shows.score` — **kept, but its meaning changes**: it is now the
  *computed* positional score, not user input. Recomputed across the
  user's library whenever the order changes.
- `shows.sentiment` — the coarse bucket (`loved` | `solid` | `not_for_me`).
- Optional `show_comparisons(winner_id, loser_id, created_at)` — a log
  of every head-to-head. Not strictly required for the positional
  model, but valuable for auditing / a future Elo refinement / undo.
- `battle_wins` (0007) is superseded — fold into the migration or leave
  inert.

### Backfill

Existing users already have typed `score`s. Seed the initial total
order by sorting the existing library on `score` DESC, `battle_wins`
DESC, `date` ASC. No user re-rates everything — their history just
becomes the starting ranked list, refined naturally as they log/compare
going forward.

### Phasing

1. **Ranking engine + schema.** `rank` sort-key, the positional
   score function, backfill, computed-score read path. No new UI yet —
   verify scores compute correctly against seeded data.
2. **Calibration flow in LogShow.** Gut bucket + binary comparison
   step. Replaces the raw 1–10 row.
3. **Surfaces.** Rankings page becomes the real ranked list;
   ShowDetail / Wrapped / data-export read the computed decimal score;
   a "re-rank this show" action for re-calibration.
4. **Rename + polish.** "Compare / battle" → "Rank it" / "Calibrate"
   language. Decimal-aware score display everywhere (some surfaces
   already do `Number.isInteger(s) ? s : s.toFixed(1)`).

Rough size: 1–2 weeks of focused work.

## Changes made

- 2026-05-18: Initiative created. No code yet — planning only.

## Open questions / follow-ups

- **3-way sentiment vs. keep the 1–10 seed.** Beli uses 3 buckets.
  Melo users know the 1–10 row. Lean 3 buckets (it's the whole point —
  absolute numbers are the problem), but this is the biggest UX call.
- **Comparisons per new show.** Binary search = ~log2(N). Cap at ~5 so
  a 100-show library never feels like a quiz. Confirm the cap.
- **Fully replace the typed score?** Beli does. Recommend yes — a
  computed score the user can't hand-edit is the integrity of the
  system. (A "this feels wrong, re-rank it" escape hatch covers
  disagreement.)
- **Going/Wishlist shows** have no score — calibration only triggers
  for Attended. Unchanged.
- **Release slot.** Headline-worthy — a real differentiator vs. other
  concert apps ("ratings that reflect your *actual* ranking"). Stronger
  pitch than Dark Mode. User to decide whether it headlines v1.1, v1.2,
  or its own release; the README release table is not yet updated
  pending that call.
- **Cross-link** `2026-05-07-v1-0-4-wrapped-juice.md` (battle_wins
  tiebreaker) and the `Rankings` page — both get reworked here.
