# Merch Collection — Digital Cabinet

- Started: 2026-05-08
- Status: planned (Phase 1 targeted for v1.3, ~1 week)
- Last updated: 2026-05-08

## Context

User asked (2026-05-08):
> "Digital merch cabinet - Photo log of all concert merch you've
>  bought. Spending tracker - See total merch expenditure per
>  artist/year. Rarity indicator - Mark limited edition or tour-
>  exclusive items. 'Merch impact' - Did buying merch correlate
>  with higher show ratings?"

Concert merch is one of the most-photographed tangible takeaways from
a show — t-shirts, posters, vinyl, hats, totes. Users already
photograph their hauls and post on Instagram. Melo can be the home
for that collection, with the show context that other apps lack.

Pairs naturally with `2026-04-30-commemorative-tickets.md` (the
ticket stub aesthetic) — a user's Melo Profile becomes a visual
collection of their entire concert life: tickets, photos, merch.

Skipping the **trading marketplace** part of the original ask
intentionally — payments + fraud + Apple Marketplace policies =
scope explosion. If users want to trade merch they can use Mercari
or eBay; we just track the collection.

## Plan

Phased so the visual cabinet (the fun part) ships first; financial
analysis ships when concert-economics ships.

### Phase 1 — Digital cabinet (v1.3)

- New `merch` field on shows: array of items, each
  `{ id, photoUrl, name, type, isRare }`
- LogShow + ShowDetail get a "Merch" section with photo upload + name
  per item
- New tab on Profile: "Collection" — grid of every merch item across
  all shows, grouped by artist or year (toggle)
- Tap an item → bottom sheet with photo + show context ("from
  {artist} at {venue}, {date}")
- Storage: same Supabase Storage bucket already used for show photos

### Phase 2 — Spending tracker (v1.4, follows concert-economics Phase 3)

Once cost-itemization is shipped per `2026-05-08-concert-economics.md`
Phase 3 (which adds `cost_merch` per show), aggregate views light up:

- "$X spent on merch this year"
- Top spending artists (you've spent the most on merch from these
  artists)
- Wrapped slide: "You bought {N} pieces of merch worth $X"

### Phase 3 — Rarity tagging (v1.5+)

- Add `is_rare` boolean per item with a star toggle ("limited edition,
  tour exclusive, signed")
- Filter on Collection: "show only rare"
- Wrapped slide: "Your collection has {N} rare items"
- Rarity is user-marked, not community-rated. Subjective is fine
  at this scale; community rating needs critical mass we don't have.

### Phase 4 — "Merch impact" derived metric (v1.5+, optional)

Cute analysis surface: "Shows where you bought merch averaged
{N}/10. Shows where you didn't averaged {M}/10. So you tend to buy
merch when the show was great." Or the inverse — could go either way.

Surfaced on the Profile "By the numbers" section. Don't make a big
deal of it — it's a fun observation, not a recommendation engine.

## Schema

Migration `0012_merch_items.sql`:

```sql
create table if not exists public.merch_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  show_id uuid not null references public.shows on delete cascade,
  name text not null,
  type text,                  -- 'shirt' | 'vinyl' | 'poster' | 'hat' | etc.
  photo_url text,
  is_rare boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.merch_items enable row level security;
create index if not exists merch_items_user on public.merch_items(user_id);
create index if not exists merch_items_show on public.merch_items(show_id);
create policy "merch_select_own" on public.merch_items
  for select using (user_id = auth.uid());
create policy "merch_insert_own" on public.merch_items
  for insert with check (user_id = auth.uid());
create policy "merch_update_own" on public.merch_items
  for update using (user_id = auth.uid());
create policy "merch_delete_own" on public.merch_items
  for delete using (user_id = auth.uid());
```

Storage: reuse the existing `show-photos` bucket (or create
`merch-photos` for organizational clarity).

## Changes made

_None yet — planning only._

## Open questions / follow-ups

- **No trading marketplace.** Documented above. If demand becomes
  overwhelming, revisit — but only with a real lawyer, real Apple
  Marketplace review, and a fraud-detection plan.
- **Photo storage cost.** Each merch item adds a photo. At Melo's
  scale this is fine on Supabase free tier (1GB). Once we hit
  ~10k MAU with active merch loggers, plan a switch to Cloudflare
  R2 (zero egress, $0.015/GB-month, native S3-compatible).
- **Type taxonomy.** Free-text vs. enum (shirt, vinyl, poster, hat,
  pin, sticker, tote, jacket, signed-item, other)? Lean enum so
  the Collection grid can group cleanly.
- **Cross-link with `2026-04-30-commemorative-tickets.md`** — both
  ship "collection" surfaces. Keep them as separate tabs in Profile
  rather than merging.
- **Cross-link with `2026-05-08-concert-economics.md`** — Phase 2
  here depends on `cost_merch` from concert-economics Phase 3.
