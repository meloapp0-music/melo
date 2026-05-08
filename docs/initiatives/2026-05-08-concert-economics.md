# Concert Economics — Budget + Cost Tracking

- Started: 2026-05-08
- Status: planned (Phase 1 targeted for v1.3, ~1 week)
- Last updated: 2026-05-08

## Context

User asked (2026-05-08):
> "Annual concert budget - Set budget, track spending vs. budget.
>  Cost per show breakdown - Tickets + merch + food + travel = total
>  cost. 'Worth it' analysis - Correlate cost vs. your rating.
>  Best value venues - Which venues give best experience per dollar."

Two real audiences for this:
1. The user (financially-aware, wants to know if a $200 ticket was
   worth it)
2. Concert-goers building budget discipline ("can I afford another show
   this month?")

The challenge: cost data is voluntary, manual entry, and high-friction.
If we make this feature mandatory or invasive, users will skip it. The
right shape: optional, lightweight, with the analysis only firing when
data exists.

This is also a strong differentiator vs. Spotify/Last.fm style apps —
nobody else asks "was the show worth what you paid?"

## Plan

Phased so the cheapest, lowest-friction parts ship first.

### Phase 1 — Optional cost field on shows (v1.3)

Single new field `cost_total` on shows (currency: USD by default,
extensible). Captured during LogShow as one optional input below
"Notes":

```
[💵 Total cost     $___        ]
[ "tickets, merch, travel — whatever you spent" ]
```

Most users won't fill it in. That's fine — when set, downstream
analysis lights up. When not, surfaces hide.

ShowDetail surfaces a small line under the score: "Cost: $X · You
rated this {N}/10 · ${X/N} per rating point." Cheeky but real.

### Phase 2 — Annual budget + tracker (v1.4)

- Settings → "Annual concert budget" → user enters number
- Home gains a small dashboard card: "$X of $Y spent this year"
  with a progress ring
- When user goes ≥80% of budget: subtle warning copy + a "you have
  $Z left for the year"
- When at 100%+: doesn't block anything — just shows a "$X over
  budget" stat. We're a tracker, not a parent.

### Phase 3 — Itemized cost breakdown (v1.5)

Replace the single `cost_total` field with itemized:
- Ticket
- Merch
- Food
- Travel (gas / flight / lodging)
- Other

Total auto-sums. ShowDetail breakdown chart. Wrapped slide:
"You spent $X on tickets, $Y on merch this year."

### Phase 4 — "Worth it" analysis (v1.5+)

Derived metrics on a new "By the numbers" section in Profile:
- Average $/rating (cost ÷ score per show)
- Best value: top 3 shows with highest score-per-dollar
- Worst value: shows where cost > avg AND rating < 7
- Best value venues: aggregate score-per-dollar by venue
- Top spending categories per year

These are ALL derived from the per-show cost data. No new schema.

## Schema

Migration `0009_concert_economics.sql` (Phase 1):

```sql
alter table public.shows
  add column if not exists cost_total numeric(10, 2);
```

Phase 3 itemized:

```sql
alter table public.shows
  add column if not exists cost_ticket numeric(10, 2),
  add column if not exists cost_merch numeric(10, 2),
  add column if not exists cost_food numeric(10, 2),
  add column if not exists cost_travel numeric(10, 2),
  add column if not exists cost_other numeric(10, 2);
-- cost_total derived as the sum at read time
```

Migration `0010_user_budget.sql` (Phase 2):

```sql
alter table public.user_settings
  add column if not exists annual_concert_budget numeric(10, 2);
```

## Changes made

_None yet — planning only._

## Open questions / follow-ups

- **Currency.** Hardcoded USD for v1. Future: detect via locale,
  let users override. Show conversion isn't critical — most users
  attend shows in their home currency.
- **Friend split tracking** is intentionally NOT in this initiative.
  Splitwise already does that exceptionally well. Building a
  competing splits feature is busywork that pulls focus from
  Melo's actual differentiator.
- **Privacy.** Cost data is sensitive. RLS already restricts shows
  to `user_id = auth.uid()` — same protection extends to costs.
  Don't surface cost on any shared/social view by default.
- **Dishonest data.** Users may misremember costs months later. The
  feature is best when captured at log-time (right after the show
  when the receipt is fresh). Frame the input copy accordingly.
- **Cross-link with `2026-05-05-buddies-phase-2.md`** — buddy
  comparisons could include "$/rating" once both initiatives ship.
- **Cross-link with `2026-05-08-merch-collection.md`** — the merch
  spending in Phase 3 here partially overlaps with merch totals
  there. Resolve by having merch-collection compute totals from
  `cost_merch` directly, not duplicating data.
