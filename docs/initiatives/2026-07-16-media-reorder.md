---
name: media-reorder
description: Drag-to-reorder for show photos and videos. Order became load-bearing once photos[0] started driving the share-card hero, the og:image in link previews, and the video poster — but the only way to change it was to delete everything and re-upload.
type: project
---

# Reorder photos & videos

- Started: 2026-07-16
- Status: built (dev) — **drag verified with pointer events; NOT verified on real iOS touch**
- Last updated: 2026-07-16

## Context
Aidan: *"users should be able to switch the order of the pictures instead of
having to delete them all and then add them in the order they want them to show.
should be able to just grab one and move it to the front or back."*

This got more important than it looks. `photos[0]` is now load-bearing in three
places, all added in the last two days:
- the share card's hero photo (`ShareCardPhotos.jsx`),
- the **`og:image`** on the public show page — i.e. the image every link preview
  shows (`marketing/functions/s/[token].js:81`),
- the **poster frame** for tap-to-play videos on that page (`:110`).

So "which photo is first" is what the world sees when a share goes out, and the
only way to change it was delete-everything-and-re-upload. Same for `videos[0]`,
which is the clip `og:video` hands iMessage to autoplay in the link bubble.

## Why dnd-kit and not a hand-rolled drag
The pickers live inside LogShow's **scrollable** form. A drag that activates on
touch-down fights page scroll, so it needs a long-press activation delay to
disambiguate scroll-vs-drag. Getting that right on real iOS touch is precisely
what cannot be verified from this machine — so a battle-tested library was the
honest call over hand-rolling pointer events I can't test. `TouchSensor` with
`{ delay: 200, tolerance: 6 }` does it properly; `PointerSensor` with a 6px
distance keeps mouse clicks working.

### A pre-existing dep bug this surfaced
`npm install` failed with ERESOLVE — **not dnd-kit's fault**. `package.json` had
`react` pinned exactly (`"19.1.0"`) while `react-dom` floated (`"^19.1.0"`). Any
new install re-resolves, floats react-dom to 19.2.7, which peer-requires
react `^19.2.7`, and collides with the pinned react. It would have blocked EVERY
future install. Fixed by pinning `react-dom` to `19.1.0` — matching the pinned
react and exactly what was already in `node_modules`, so nothing installed
changed.

## Changes made
- 2026-07-16: **`components/SortableMediaGrid.jsx`** (new) — shared drag-to-reorder
  grid used by both pickers. Keeps their controlled-component contract (parent
  owns the array; we only call `onReorder(next)`). Sortable tiles render first;
  non-sortable extras (in-flight uploads, the add button) render after so they
  can't become drop targets.
- 2026-07-16: **PhotoPicker + VideoPicker** wired through it. The remove button
  gets `onPointerDown` → `stopPropagation` so tapping the X can't start a drag.
- 2026-07-16: **A "Cover" badge on photo 1 / "1st" on clip 1.** Position 1 was
  silently load-bearing; naming it teaches why the order is worth arranging.
- 2026-07-16: **CSS** — `touch-action: none` on tiles (without it iOS scrolls the
  form instead of handing the gesture to the sensor), `-webkit-touch-callout:
  none` (no "Save Image" sheet on long-press), lift + shadow while dragging.
  Hint copy: "Hold and drag to reorder — the first photo is your cover."
- 2026-07-16: **Verified** by driving the real PhotoPicker with synthetic pointer
  events: `[1,2,3,4]` → drag 4 to front → `[4,1,2,3]` → drag 3 to front →
  `[3,4,1,2]`, with the DOM order matching state exactly. Cover badge follows the
  new first tile (exactly one). The X still removes without dragging
  (`[3,4,1,2]` → `[3,1,2]`). `touch-action` computes to `none`. Build clean.

## Open questions / follow-ups
- **The real risk is untested:** pointer events are the same code path for mouse
  and touch, but the scroll-vs-drag disambiguation on a real iPhone inside the
  log form is NOT verified. This is the thing to try first on TestFlight — if a
  long-press fights the form scroll, the fix is tuning `TouchSensor`'s
  `delay`/`tolerance`, not a rewrite.
- Reordering only persists when the parent saves (LogShow's submit /
  FestivalDetail's `savePhotos`). Worth confirming a reorder-then-save round-trips
  on a real account.
- No haptic on pick-up. `@capacitor/haptics` would make the long-press feel
  native, but it's a new dep + native sync — deferred.
