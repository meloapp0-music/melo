# Pre-Show Toolkit

- Started: 2026-05-08
- Status: planned (Phase 1 mostly fits in v1.0.5 quick-wins)
- Last updated: 2026-05-08

## Context

User asked (2026-05-08):
> "Last time you saw them - 'Your last Radiohead show was 2 years ago,
>  rated 9.8'. Opener research - Quick bio of opening acts you might
>  not know. Parking & transit tips - Crowdsourced from venue visitors.
>  Presale code sharing - Friends share codes for artists you love."

Cluster of small features that all answer "what should I know before
this show?" Most are cheap derived data wins; a few need real
infrastructure (presale codes need social, parking tips need scale).

## Plan

### Phase 1 — Cheap wins (v1.0.5)

These are all derivable from data we already have. Ship them as a
single "Pre-show" card on ShowDetail for any Going / Wishlist show:

- **"Last time you saw them"** — search the user's attended shows for
  the same artist, sort by date desc, surface the most recent. Shows
  the date + venue + rating: "Your last Radiohead show: Madison Square
  Garden, Apr 14 2024 — you rated it 9/10."
  - Edge case: artist with no prior attended show → suppress the line
    or replace with "First time seeing them"
- **"Opener research"** — when LogShow autofill captures `lineup` for
  a show (multi-artist Ticketmaster events already do this), render a
  small card per opener with their MusicBrainz bio (already shipped
  via `fetchArtistBio`). Tap → expands to full bio.
  - Hidden when there's no lineup data or only one artist on the bill.

Both of these are pure UI work. ~3-4 hours total.

### Phase 2 — Presale code sharing (v1.2+, after buddies-phase-2)

Real users share presale codes for artists they love — Reddit's
r/aegpresale subreddit is built on this. Melo can do it natively.

- New `presale_codes` table: `(artist, code, source, posted_by,
  expires_at, created_at)`
- "Got a code?" CTA on Wishlist / Going show cards
- "Codes for artists you like" surface on Home, gated to artists the
  user has rated 7+ or has a Wishlist for
- Codes ARE shared publicly in a controlled way — one user sharing
  their AmEx presale code lets it circulate. Apple Review will
  scrutinize this; need explicit policy on user-supplied content.
- Anti-abuse: rate-limit code submissions (5/day/user), flag codes
  that don't work (community report → auto-hide after 3 reports),
  expire codes 30 days after the artist's tour starts.
- Depends on `2026-05-05-buddies-phase-2.md` for the trust signal
  ("got this code from someone you actually know") and on the
  social-layer's moderation infra for the report flow.

### Phase 3 — Parking & transit tips (v3+, deferred)

Premature today — chicken-and-egg with user count. Defer until Melo
has 10k+ MAU with real per-venue density. At that point: a
crowd-sourced free-text "Tips for getting here" field per venue, with
upvotes. Not implemented yet, just acknowledged.

## Schema

No schema changes needed for Phase 1 — pure UI over existing data.

Phase 2 (`0013_presale_codes.sql`) when we get there:

```sql
create table if not exists public.presale_codes (
  id uuid primary key default gen_random_uuid(),
  artist text not null,
  code text not null,
  source text,                              -- 'AmEx' | 'Verified Fan' | 'Live Nation' | 'Spotify' | etc.
  posted_by uuid references auth.users,
  expires_at timestamptz,
  reports integer not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists presale_artist on public.presale_codes(lower(artist));
alter table public.presale_codes enable row level security;
-- Read: anyone authenticated, but only non-hidden codes
create policy "presale_read_visible" on public.presale_codes
  for select using (auth.role() = 'authenticated' and not hidden);
-- Insert: any authenticated user, attributed to themselves
create policy "presale_insert" on public.presale_codes
  for insert with check (auth.uid() = posted_by);
```

## Changes made

_None yet — planning only._

## Open questions / follow-ups

- **"Last time you saw them" placement.** ShowDetail card is one
  option; Home upcoming-show card is another. Probably both — they
  serve different moments (planning vs. day-of).
- **Privacy on presale codes.** Codes are public-ish (Reddit shares
  them daily) but tying a user's identity to "I posted this AmEx
  code" might trigger AmEx terms-of-service issues. Surface only
  the code + source, not the username, on the public list. Username
  visible only to admins for moderation.
- **Fake presale codes as abuse vector.** A bad actor could spam
  fake codes to grief users. Rate limits + community reports help;
  long-term may need a "verified contributor" signal (users with
  N successful real codes get a badge).
- **Cross-link with `2026-05-05-buddies-phase-2.md`** — Phase 2
  works much better with friend-graph trust signals.
- **Cross-link with `2026-05-05-social-layer.md`** — Phase 2's
  moderation depends on the report queue from Phase 5d there.
