# All-Photos Gallery — browse every concert photo by show

- Started: 2026-05-22
- Status: planned (follow-up; not blocking v1.1)
- Last updated: 2026-05-22

## Context

User feedback (2026-05-22) on the new "Your Year in Photos" Wrapped
slide:
> "I think there should be a link to where you can scroll through all
> your pics by show. This just seems pointless? unless I'm wrong."

Partly right. The Wrapped photo-wall slide is a *one-off montage* built
for a full year — and it can't be interactive (Wrapped is swipe-to-
advance, you can't scroll inside a slide). What the user actually wants
is a **persistent, browsable gallery of all their concert photos,
grouped by show** — a genuinely more useful feature, and one that lives
better on the **Profile** than inside Wrapped.

Per-show photos already exist (`PhotoGallery.jsx` on ShowDetail), but
there's no single place to see *all* your photos across every show.

## Plan (when picked up)

- New **"Photos"** section/entry on the Profile page (near the Wrapped
  year-archive cards).
- Tapping it opens a gallery: all photos across the user's shows,
  **grouped by show** (show header → that show's photo strip), newest
  first. Tapping a photo opens it full-screen; tapping a show header
  jumps to that ShowDetail.
- Pure client-side over existing `shows[].photos` — no schema change.
- Reuses `PhotoGallery.jsx` patterns + the existing photo URLs.

## Open questions / follow-ups

- **Entry point** — a Profile card vs. a Home stat tile vs. both.
- **Lazy loading** — a heavy concert-goer could have hundreds of
  photos; paginate/virtualize.
- **Relationship to the Wrapped slide** — keep the year montage in
  Wrapped (now visually fixed: square-tile collage, gradient fill, only
  shows at 3+ photos) AND add this persistent gallery. They serve
  different moments (year recap vs. anytime browsing).
