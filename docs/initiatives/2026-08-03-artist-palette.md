# The artist palette — eight colours instead of one

- Started: 2026-08-03
- Status: built (dev)
- Last updated: 2026-08-03

## Context

While reviewing a set of alternative-layout mockups, the light surfaces read as
flat and colourless next to the dark ones. The instinct was that this was an
empty-data illusion — no users, no photos, so of course it looks bare. It was
partly that. But the larger cause turned out to be a real defect in the shipped
app.

`getArtistGradient()` hashed every artist name into a hue between **8° and 44°**
— ember red through amber to gold, and nothing else. The constraint was
deliberate; the original comment explains it kept "a wall of fallback posters
in-family with the cream palette instead of reading as a saturated rainbow." The
intent was right and still holds. The band was simply far too narrow: every
artist in Melo came out a shade of the same orange-brown, so a full drawer could
never have any variety at all, no matter how many shows were in it.

A *curated* set fixes this where a *wider hash* would not. Chosen colours can
all be deep, desaturated and archival; a wider generated band just produces the
rainbow the original author was rightly avoiding.

Two secondary findings, recorded because they were surprising:

- **The mockups were less colourful than the shipped app, not more.** Home's Up
  Next hero has rendered a full-bleed artist photo over a gradient since v1.x
  (`Home.jsx`); the mockup tool simply hadn't carried it over.
- **Night mode reads richer partly because walnut is a *material*** — grain,
  depth, light falloff — while bone paper is a flat fill. That is a texture gap
  rather than a colour gap, and it is a design-side fix, not a code one.

## Plan

Approved plan: `~/.claude/plans/compressed-gathering-wren.md`.

1. Replace the hue hash in `getArtistGradient()` with a curated eight-colour
   palette, keeping the signature and return type byte-identical so no call
   site has to change.
2. Give Home's upcoming-show card a dimmed, desaturated photo treatment, so
   anticipation reads differently from memory.
3. Extract the copy-pasted photo-over-gradient composition into one helper.
4. Cover the invariant that can silently regress: text legibility.

## Changes made

- 2026-08-03: **`getArtistGradient()` rewritten** (`src/web/store.js`) around a
  curated `ARTIST_PALETTE` of eight deep colours — oxblood, ember, ochre, bottle
  green, deep teal, navy, plum, walnut. The name hash now selects a swatch
  rather than a hue, with a bounded ±2% lightness drift so two artists sharing a
  swatch aren't identical. Signature and return type unchanged, so all ~21 call
  sites picked up the new palette with no edit. Verified across 20 sample artist
  names: all eight swatches reachable, distribution 4/4/4/2/2/2/1/1.

  Cream/bone from the design language is deliberately **excluded** from this
  generator — it only works where the text on it is dark, which is the ticket
  stub, not the photo heroes. A cream stub variant needs its own token and a
  dark-text rule.

- 2026-08-03: **Home's Up Next hero split into three layers**
  (`Home.jsx`, `App.css`). The artist colour now sits underneath at full
  strength with the photo over it at `mix-blend-mode: luminosity`, so the photo
  reads as a tinted ghost rather than a photograph. Filtering the element as a
  whole was rejected: it would have desaturated the artist colour too, which is
  the opposite of what the card needs. Scrim lightened `0.78 → 0.62` — with the
  photo already knocked back, the old scrim buried the colour the card exists to
  show. The hardcoded `#C34A36` CSS fallback (a fixed orange predating the
  generator, which fought whatever colour the artist actually was) is now a
  neutral.

  Rationale: a show you haven't been to yet is a promise, not a memory. The
  archive keeps full-colour photographs for nights that actually happened.

- 2026-08-03: **`artistBackground(name, img)` added** to `store.js` and adopted
  in `Home.jsx`, `MyShows.jsx`, `Rankings.jsx`, `You.jsx`, `FriendsFeed.jsx`
  (×2), `FestivalDetail.jsx` (×2) and `ShowDetail.jsx` (×3).

  This was not purely cosmetic. There were **two** duplicated patterns, not one:
  some sites layered the photo *over* the gradient, but four (`FriendsFeed`,
  `You`, `Rankings`, `ShowDetail`) had the photo *replace* it with no fallback
  layer — so a slow or failed image left a blank box. Consolidating on the
  layered form fixes that latent bug on every one of those surfaces.

- 2026-08-03: **`src/web/lib/__tests__/artist-palette.test.mjs`** — 19
  assertions. Determinism, the 20–42% lightness band, variety (explicitly
  asserting hues above the old 44° ceiling — this test would have failed before
  the rewrite), edge cases, and `artistBackground` layer order.

  The load-bearing one is a **WCAG contrast check**: white text over each bare
  swatch, no scrim, since several surfaces paint the gradient with no scrim at
  all. All eight clear AA; ochre is the tightest at 4.63:1 bare, 12.37:1 under
  the Up Next scrim. This matters because nothing else catches it — Vite doesn't
  type-check, CSS never throws, and an unreadable card looks fine in a diff.

## Open questions / follow-ups

- **Bone paper has no material presence.** The real remaining light-mode gap:
  walnut has grain and falloff, bone paper is a flat fill. Needs a texture pass
  (paper fibre, edge shadow where sheets overlap, slight warmth variation) —
  explicitly not a photographic wash and not a gradient.
- **A cream stub variant** for the drawer, with its own dark-text rule, if the
  ticket-stub treatment from the mockups is ever built.
- The other ~13 files calling `getArtistGradient` directly (`ArtistDetail`,
  `VenueDetail`, `Wrapped`, `shareCardKit`, `recapCuts`, …) inherited the new
  palette for free but were not audited for the same photo-over-gradient
  duplication. Worth a sweep if one of them ever shows a blank card.
- Distribution across the eight swatches is hash-dependent and not uniform
  (4/4/4/2/2/2/1/1 on the 20-name sample). Acceptable, but if a real library
  ever looks lopsided, the mixing step is where to look.
