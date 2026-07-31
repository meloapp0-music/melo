# Rank outings, not shows — festivals as first-class ranked entities

- Started: 2026-07-30
- Status: shipped (dev) — migration 0020 applied 2026-07-30
- Last updated: 2026-07-30

## Context

Every layer of Melo already treats a festival as **one night out**:
`groupIntoOutings` collapses it, the Shows count counts it once, `festivalKey`
excludes its stages from the venue count. Every layer except ranking, which
still sees N separate show rows.

That inconsistency is not theoretical. Today:

- **The batch festival log never opens a duel.** `addShows` (App.jsx) doesn't
  call `addShow`, so logging a twelve-act Coachella produces twelve unranked
  rows and zero placements.
- **The leaderboard floods.** `Rankings.jsx:22` builds from
  `shows.filter(isAttended)` — raw rows — so that Coachella appears as twelve
  separate leaderboard entries.
- **The back-catalogue ranker would make it worse.** It counts those twelve as
  "never been placed" (`Rankings.jsx:104`) and would try to place each one
  individually against the whole library — roughly fifty questions for one
  weekend, half of them meaningless ("was Doja's 45-minute festival set better
  than Radiohead's headline show?").

Two options were weighed and rejected:

- **Bucket-once interim** — ask the bucket for the weekend, skip the duel.
  An afternoon, but it makes festivals *permanently unrankable*, which for a
  heavy festival-goer hides most of their year. Thrown-away work.
- **Proxy row** — let one show row hold the position for the group. No
  migration, ~90% of the value, but it can't express within-festival ranking
  and leaves an invariant a future session can silently break.

**The deciding factor** was judging within-festival ranking ("best set of
Coachella 2025") to be a headline feature rather than a nice-to-have — because
a festival is the only place *density* naturally exists in a product otherwise
defined by sparseness, and "my festival top 5, ranked" is the strongest share
artifact in the roadmap after the recap itself. The proxy row can't get there,
so it would have to be unwound.

## Plan

### The core idea

One function decides everything:

```js
// lib/ranking.js
export const entityKeyOf = (show) => festivalKey(show) || show.id;
```

A festival's twelve rows all resolve to `coachella|2025`; a standalone show
resolves to its own uuid. Rank **entity keys**, not show ids.

### Two scopes

| scope | entities | question it answers |
|---|---|---|
| `outing` | festivals + standalone shows | "Coachella or Radiohead at Salt Shed?" |
| `festival:<key>` | the shows inside one festival | "Best set of Coachella 2025" |

Never mixed — same principle as the buckets. A festival set competes with other
sets from that festival; the festival competes with other nights out.

### Schema — a new table, not an alter

`rankings.show_id` is a **primary key with an FK and `on delete cascade`**
(0001_init.sql:104). It cannot be widened in place. New table alongside:

```sql
-- 0020_ranking_entries.sql
create table public.ranking_entries (
  user_id    uuid    not null references auth.users(id) on delete cascade,
  scope      text    not null,      -- 'outing' | 'festival:<key>'
  entity_key text    not null,      -- a show uuid OR a festival key
  position   integer not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, scope, entity_key)
);

create index ranking_entries_lookup_idx
  on public.ranking_entries(user_id, scope, position);

alter table public.ranking_entries enable row level security;

-- Identical shape to the existing "rankings self all" policy (0001:164-168).
-- Nothing here widens access.
create policy "ranking_entries self all" on public.ranking_entries
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create trigger ranking_entries_touch before update on public.ranking_entries
  for each row execute function public.touch_updated_at();
```

**Backfill** from the existing `rankings.position` data. A festival whose rows
were individually ranked collapses to one entity, so take the best (lowest)
position per entity, then re-densify:

```sql
insert into public.ranking_entries (user_id, scope, entity_key, position)
select user_id, 'outing', entity_key,
       row_number() over (partition by user_id order by best_pos)
from (
  select r.user_id,
         coalesce(nullif(lower(trim(s.festival)), '') || '|' || left(s.date, 4),
                  s.id::text) as entity_key,
         min(r.position) as best_pos
  from public.rankings r
  join public.shows s on s.id = r.show_id
  where r.position is not null
  group by 1, 2
) t
on conflict do nothing;
```

The `entity_key` expression must match `festivalKey()` in store.js exactly —
`lower(trim(festival)) + '|' + year`. **Verify this against a real row before
running**; a mismatch silently orphans every migrated ranking.

**Keep `rankings` intact and unread.** The client stops reading it; the table
stays. That's the rollback: revert the client and the old order is still there.
Drop it in a later migration once this has proven out.

### Orphans (the cost of losing cascade delete)

`entity_key` is text, so nothing cascades when a show is deleted. Three things
make that safe rather than merely tolerable:

1. **Readers ignore unknown keys.** `rankedOrder` only orders entities it can
   resolve to a real show/outing, so an orphan is inert.
2. **Writes are wholesale.** `savePositions` rewrites the entire scope, so
   orphans disappear the next time the user ranks anything.
3. A `after delete on shows` trigger removes `scope='outing'` rows whose
   `entity_key = old.id::text`, covering the standalone case cheaply.

Festival-key orphans (last show of a festival deleted) survive until the next
re-rank. Inert, and not worth a trigger.

### Client changes

Small, because the score sweep already funnelled 14 files through
`showScore(show)` — only these touch positions directly:

| File | Change |
|---|---|
| `lib/ranking.js` | `entityKeyOf`; key `rankedOrder` / `meloScores` / `startPlacement` by entity; `rankedOrder` returns **outings**, not shows |
| `lib/db/rankings.js` | `getPositions(scope)` / `savePositions(orderedKeys, userId, scope)` against the new table |
| `components/RankDuel.jsx` | takes a `scope`; compares outings at `outing` scope, shows at `festival:<key>` |
| `pages/Rankings.jsx` | leaderboard over outings (**fixes the flooding**); backlog counts unranked outings |
| `App.jsx` | `addShows` opens ONE duel for the festival outing; load `outing` scope with app data, festival scopes on demand |
| `components/FestivalDetail.jsx` | "Rank the sets" entry point + the resulting order |

### The display rule

**One score per outing.** All twelve Coachella shows display the festival's
derived score. Within-festival ranking produces a **rank badge** ("#2 of 12 at
Coachella"), never a second score — two different numbers for the same show
would be worse than the problem being solved.

`meloScores` therefore maps show → *its outing's* score, so `showScore(show)`
keeps its current signature and none of the 14 swept files change.

## Changes made

- 2026-07-30: Built. `entityKeyOf(show) = festivalKey(show) || show.id` is the
  whole idea; everything else follows from it.
  - **`lib/ranking.js`** — `toEntities` / `rankedEntities` collapse shows into
    the things that get ranked. `meloScores` now maps show → *its entity's*
    score, so `showScore(show)` kept its signature and none of the 14 files from
    the score sweep changed. Entities carry `city`/`venue`/`date` so one can be
    handed straight to `FestivalDetail` with no translation step.
  - **`0020_ranking_entries.sql`** — new table keyed by
    `(user_id, scope, entity_key)`. `rankings` is left populated and unread;
    that IS the rollback. Backfill collapses per-show positions to one per
    entity (best position wins) and re-densifies. An `after delete on shows`
    trigger prunes by key, and `savePositions` prunes stale keys per scope.
  - **`RankDuel`** — takes `scope` and `pool`. At outing scope it places
    entities; at `festival:<key>` it places that festival's sets against each
    other only, and reports a RANK rather than a score (one score per outing).
  - **`App.jsx`** — the batch festival log now opens ONE duel for the weekend
    (it opened none before), deduped by entity key. The single-show path skips
    the duel when the show's outing is already ranked, so adding a thirteenth
    act to a placed festival doesn't re-ask.
  - **`Rankings.jsx`** — leaderboard over entities. **A four-act festival is one
    row, not four.** Backlog counts unranked *outings*.
  - **`FestivalDetail`** — "Rank the sets", the second scope, offered here
    rather than at log time so twelve comparisons don't undo the four-tap log.
    Ranked sets show `#1`, `#2` … and the list reorders.
  - **Found while building:** `Rankings.jsx` was re-fetching positions into its
    own state instead of reading app state, so the leaderboard went stale after
    a duel until remount. Now reads `rankPositions`.
  - Verified the SQL `entity_key` expression against `festivalKey()` on real row
    shapes **before** writing the migration, including the whitespace/caps case
    — a mismatch there would have silently orphaned every migrated ranking.
  - 18 new assertions on the entity layer; in-browser a four-act Lollapalooza
    renders as **one** leaderboard row tagged "🎪 4 acts" with the backlog
    reading "1 outing", where it previously showed four rows and counted four.

## Open questions / follow-ups

- **The batch log still asks the bucket per act** in LogShow's festival
  multi-select — only the DUEL was collapsed to one. Asking once for the weekend
  is the natural follow-up; the ranking side is already ready for it, since a
  festival's entity bucket comes from whichever act is the entity lead.
- **Migration 0020 applied 2026-07-30** via the dashboard SQL editor. The CLI
  still isn't linked to the project (`supabase link` needs the db password), so
  `db push` fails — use the editor for 0021+ too, or link it once.
- **`rankings` (0001) is now dead weight.** Nothing reads it; Battle Mode still
  writes `elo`. Drop it in a later migration once this has run for a while —
  keeping it is the rollback path until then.
- **Lollapalooza is the first weekend of August** (~days from this writing) and
  is Chicago — the best natural test this will get all year. That's an argument
  for doing it now, but "ship a migration in under a week on the security
  spine" is a real risk; the new-table-alongside approach is what makes it
  survivable.
- Retire `rankings` (and the ELO Battle Mode that writes it) in a later
  migration once `ranking_entries` has proven out.

## Verification

- `entityKeyOf` matches the SQL backfill expression on a real festival row —
  **check before running the migration**, not after.
- Extend `ranking.test.mjs`: a festival's N shows collapse to one entity; two
  scopes stay independent; `meloScores` gives every show in a festival the
  same score.
- In-browser: log a multi-act festival → exactly ONE duel; leaderboard shows
  the festival once, not N times; back-catalogue count treats it as one.
- Confirm a signed-in read of `ranking_entries` returns only own rows.
