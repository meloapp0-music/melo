---
name: ticket-stub-variants
description: Lean the share card into the ticket stub — multiple ticket ARCHETYPES (not themes) + a full-setlist-on-the-image variant. Trim Poster + Marquee. Public show page is a later phase.
type: project
---

# Ticket-stub variants + full-setlist on the card

- Started: 2026-06-29
- Status: in-progress
- Last updated: 2026-06-29

## Context
The share card is Melo's #1 organic funnel. From watching real use, the ticket
stub is the only style people actually post — "they don't care for the marquee
or the poster, but the ticket stub, that's something they'd post." Two gaps:

1. **The shared image looks bland** — it only prints ~6 setlist songs. The in-app
   "+N more" already opens a full-setlist popover ([ShareCardView.jsx:157](../../src/web/components/ShareCardView.jsx)),
   but the exported PNG is flat: no tap, only 6 songs. So "let people pull up the
   whole setlist" is really two needs: (a) a card that *prints* a long/full setlist,
   and (b) viewers of a posted card being able to expand it (→ public show page).
2. **Only one ticket look.** People want ticket-stub variety, not 5 unrelated styles.

## Decisions (Aidan, 2026-06-29)
- **Full setlist → BOTH:** a richer ticket image now (quick win) + a public show
  page later (the bigger build — see [[public-share-pages]]).
- **Ticket variants → different ARCHETYPES** (distinct real-world ticket types),
  not just color/era reskins.
- **Trim to the best:** keep Vibe (and maybe Player), **cut Poster + Marquee**, add
  the ticket archetypes.
- **Design first via Claude visual mockups**, pick from pictures, then build in canvas.

## Archetype mockups presented (pick which to build)
Rendered as branded mockups in-chat 2026-06-29:
1. **Classic stub** — current ticket, refined (cream, perforation, barcode, rating badge).
2. **Boarding pass** — the show as a flight (YOU → ARTIST, gate/seat/zone, tear stub).
3. **Receipt** — thermal-receipt that **itemizes the full setlist** line by line.
   *This is the direct answer to "looks bland with a few songs."*
4. **VIP laminate** — backstage pass on a lanyard (photo, ALL ACCESS, holographic accent).
5. **Festival band** — tyvek GA wristband on a dark festival card.

## Plan
- Build the chosen archetypes as native-canvas drawers in
  [shareCardCanvas.js](../../src/web/lib/shareCardCanvas.js), alongside the existing
  `drawTicket` (which migrated off html2canvas — see [[share-cards-native-canvas]]).
  Each is a `DRAWERS` entry + a STYLES picker entry.
- At least one variant (Receipt, and a "long" Classic) prints the **full / much-longer
  setlist** with auto-fit sizing so 20+ songs stay legible at 1080×1920.
- Remove `poster` + `marquee` from the `STYLES`/`CARD` maps in
  [ShareCardView.jsx](../../src/web/components/ShareCardView.jsx) and from the canvas
  dispatcher; keep `vibe` + `player`. (Leave the dead DOM components for now or delete.)
- Keep export reliability: a style not yet ported returns null → fallback card.

## Security spine
- Pure client-side rendering change; no DB/RLS surface touched. The public show page
  (later phase) is where RLS matters — opt-in `share_token`, RLS-safe read (tracked in
  [[public-share-pages]]). Do not weaken RLS for it.

## Open questions / follow-ups
- Which archetypes ship in v1 (awaiting Aidan's pick — recommend Classic + Receipt + Boarding pass).
- Keep Player, or go ticket-forward only?
- Theme layering on archetypes (ember/midnight) — phase 2.
- Public show page = the "viewers expand the setlist" half — separate initiative.

## Changes made
- 2026-06-29: Initiative created. Decisions captured; 5 archetype mockups presented for selection. No code yet.
