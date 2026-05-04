---
name: Commemorative Tickets
description: Auto-generated collectible digital tickets per attended show — vintage-stub aesthetic, rarity tiers, shareable, monetization hook
type: project
---

# Commemorative Tickets

- Started: 2026-04-30
- Status: planned
- Last updated: 2026-04-30

## Context

Melo's tagline is "Where concerts live forever." Right now that promise is
delivered through stats, setlists, and a year-end Wrapped — but there's no
single artifact that *embodies* a show. Concertgoers already collect physical
ticket stubs as relics; the digital equivalent doesn't exist in any
concert-tracking app today.

Adjacent products are circling this space:

- NCAA Final Four / season-ticket holders get **physical commemorative
  tickets** as collectibles
- **Topps Now / NBA Top Shot** turned game attendance into daily digital cards
- **Eras Tour & Renaissance** ticket designs became collectibles fans framed
- **POAP** (Proof of Attendance Protocol) attempted this with crypto and
  largely failed
- **Live Nation's "Token" tickets** are moving in this direction

No concert-tracking app — Setlist.fm, Songkick, Bandsintown — owns this
category. There's an obvious gap, and the brand emotion already lines up:
a beautiful collectible ticket *is* a concert living forever.

This is also a **monetization mechanic disguised as a delight**. Free users
get standard tickets; a future paid tier (Melo+) unlocks animated /
holographic / artist-collab designs and limited-edition festival drops.

And every shared ticket = a free user-acquisition moment on IG/iMessage.

## Plan

Phased rollout, beginning **after v1.0 ships and stabilizes**. Do not start
implementation while v1.0 is in App Review.

### Visual direction

Pick **one** to anchor the system. Recommended: **vintage paper stub** —
matches the brand emotion ("Where concerts live forever"), nostalgic, parallels
existing physical-stub-collecting behavior. Rejected alternatives:

- *Editorial magazine card* — premium but cold; less emotionally collectible
- *Topps-card / illustrated* — fun but conflicts with the editorial brand
  direction; could surface later as a Melo+ "alt design" option

### Phase 1 — v1.2 (post-launch, first major feature)

- New table `tickets` keyed to `shows.id` (RLS = owner-only, with a
  shareable public token for social previews)
- Server-side ticket image rendering (Edge Function, Satori or sharp).
  Render to PNG at 1080×1920 (Story) and 1080×1080 (Feed)
- One vintage-stub design template: artist name (display serif), venue +
  city, date, optional setlist highlight, serial number ("Show #47")
- Auto-generated ticket on every attended show — backfill existing
  attended shows in a one-time migration
- New "Collection" sub-page (probably under Profile or a new tab) showing
  all tickets in a grid; tap to view fullscreen, swipe to navigate
- Share button per ticket: native iOS share sheet, exports the rendered
  PNG with a subtle Melo logo + URL

### Phase 2 — v1.4

- Rarity tiers and visual differentiation:
  - Common: every show
  - Rare: festivals, sold-out shows, iconic venues (Red Rocks, MSG,
    Hollywood Bowl, The Sphere, Madison Square Garden)
  - Legendary: farewell tours, milestone shows (1st, 10th, 50th, 100th),
    shows attended with a Buddy
  - Special editions: Year-One Wrapped ticket, anniversary tickets
- Iconic-venue list curated in a `venues_iconic` table (admin-edited)
- Milestone detection runs on insert via Postgres trigger

### Phase 3 — v1.5+

- Animated tickets (Lottie or short MP4 export)
- Melo+ paid tier: animated/holographic tickets, exclusive artist-collab
  designs, custom personalization (name on the stub), early access to
  limited tickets for big festivals
- Limited-edition timed drops: Coachella weekend, Glastonbury, Lollapalooza,
  etc. — only attendees that weekend get the exclusive design

### Phase 4 — long term

- Print-on-demand physical tickets via Printify / Lob
- Ticket trading between users (likely never — Web3 trap)
- Artist-licensed exclusive designs (partnership / B2B revenue)

## Changes made

- 2026-04-30: Initiative created; planning only. No code changes. Awaiting
  v1.0 App Store approval before scoping Phase 1 properly.

## Open questions / follow-ups

- Where does the Collection live in the nav? Profile sub-page (cheapest)
  vs. a 6th tab (more visible but breaks the 5-slot bottom nav). Current
  lean: Profile sub-page in v1.2, promote to a tab once Collections feel
  like a daily-return surface.
- Render server-side or client-side? Server-side (Edge Function + Satori)
  is cleaner for sharing — the same PNG works for OG previews, IG share,
  push notifications. Client-side is faster but harder to share.
- How do we handle attended shows logged *before* this feature shipped?
  One-time backfill migration that generates tickets for every existing
  attended show on first launch of v1.2.
- Ticket data model: do we store a rendered PNG (S3/Storage) or
  re-render on demand from `shows` data + a `ticket_design` foreign key?
  Lean toward render-on-demand, cache aggressively, regenerate if design
  template version bumps.
- Should festival shows produce one ticket for the festival, one ticket
  per artist within the festival, or both? Probably one per festival
  (matching the Festivals page model) with the lineup as the back of the
  card.
- Is there a Melo-branded watermark on shared tickets, or a clean
  cream-and-equalizer-bars footer? Lean clean footer — every share is a
  marketing impression.
- Long-term: is there a play for an artist-side product? Artists get
  data on which of their shows generated the most ticket shares.
