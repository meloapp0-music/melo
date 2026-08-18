# Home — canonical spec

- Decided: 2026-08-16
- Supersedes: `~/Downloads/export-html/home.html` (Sleek v29) and every base44
  generation before this date.
- Implementation: `src/web/pages/Home.jsx`

This file is the source of truth. When base44, the Sleek export and the code
disagree, **this document wins** — and if it's wrong, change it here first.
It exists because Home existed in three mutually inconsistent versions at once
and there was no way to answer "does this match?" except by arguing.

---

## The rule the whole screen follows

> **The future is a ticket. The past is a photograph.**

Upcoming shows are drawn as ticket stubs. Past shows are drawn as tilted
photographic prints. Two object types, each meaning exactly one thing. A user
learns the language in about four seconds and it holds on every other screen.

## Section order

Fixed. Sections 3 and 4 are conditional and simply don't render when they have
no content — they never leave a gap or an empty state.

| # | Section | Always? |
|---|---|---|
| 1 | `UPCOMING` | yes — countdown, or the "nothing booked" invitation |
| 2 | `WHAT'S ON` | yes — discovery |
| 3 | `UNLOGGED` | only when a past `going` show was never logged |
| 4 | `ON THIS DAY` | only when an anniversary lands today |
| 5 | `IN YOUR CIRCLE` | yes — capped at 3 rows + `SEE ALL` |
| 6 | `YEAR SO FAR` | only when the year has ≥1 attended show |

`YEAR SO FAR` is hidden at zero deliberately: `00 SHOWS / 00 CITIES /
00 ARTISTS` reads as broken rather than as a beginning, and it is reachable —
a new user who marks one show as going has attended none.

## 1 · UPCOMING

The page leads with a **statement**, not a filing label. Two of the three Home
states already did this (`Tonight` at 96px, `Start your archive.` at 36px);
the ordinary state opened with a 10px grey category label, which is why it
read as a page in a magazine rather than a home screen.

```
UPCOMING
────────────────────────────────
26                       ┌─────┐
   DAYS UNTIL            │ SEP │
Fontaines D.C.           │ 12  │
THE WILTERN · LOS ANGELES│ SAT │
                         │ ──  │
                         │ADMIT│
                         │ ONE │
                         └─────┘
────────────────────────────────
```

- **The countdown number** is the largest element on the page — ~90px italic
  serif, tight leading. `DAYS UNTIL` beside it in the label style, baseline
  aligned.
- **Artist name** is MEASURED, not bucketed — `<FitText min={24} max={46}>`
  renders at a probe size, reads the natural width, and scales by the ratio.
  It gets the **full sheet width** on its own line beneath the countdown row,
  not the ~187px left beside the stub. Past the 24px floor it wraps rather
  than overflowing, per the house rule that "never clip" beats "fill the
  width". Verified: `Fontaines D.C.` → 46px one line · `Godspeed You! Black
  Emperor` → 24.5px one line · `…And You Will Know Us by the Trail of Dead` →
  24px, two lines, no overflow.
- **Venue · city** in the label style. The date is **not** repeated here — the
  stub carries it.
- **The stub** sits right, rotated ~3°, white border, soft shadow. Filled with
  the artist's colour from `getArtistGradient` (the eight-colour palette).
  Prints `SEP / 12 / SAT`, a white 30% hairline, then `ADMIT ONE`. Its top
  aligns with the top of the countdown number and its bottom with the baseline
  of the `DAYS UNTIL` line.

**No photograph on the stub.** Tested 2026-08-16 as a duotone against the
artist colour: at any tint heavy enough to keep white type legible the image
becomes unreadable mush and the artist's colour is lost. More importantly the
duotone is only ever as good as the source photo, and the app doesn't control
those — the flat colour renders identically well for every artist, instantly,
with no network.

### The photograph sits BELOW the type, never behind it

Added 2026-08-19. A full-bleed image runs edge to edge beneath the countdown
block, ~224px tall, greyscale and slightly contrast-boosted, dissolving into
the paper at **both** ends (`--bg` → transparent at 20%, transparent → `--bg`
from 68%). It reads as printed *into* the sheet rather than dropped on top of
one.

**It is always one of the user's OWN photos**, never a press shot. A press
photo is identical for every show by that artist forever and is exactly what
every other concert app puts here.

Two chances at it, tried in order, each captioned so the photo reads as a
memory rather than as decoration:

| Source | Caption |
|---|---|
| Your last night in **that room** | `You were here · Aug 2025` |
| Your last night with **that artist** | `You saw them · Mar 2024` |
| Neither | no image, **no reserved height** |

The venue match alone is far too narrow to ship — it needs a prior attended
show at the same room that you also photographed, which for most people is
never. Going back to see an artist you've already seen is the far more common
pattern in a concert log, so it's the second pass. Both are personal; neither
is stock.

Verified 2026-08-19 across all three cases: the block measures 515px with a
photo and 229px without — a 286px difference, exactly the image, caption and
margins, with zero images inside the section in the empty case.

Seventeen rounds were spent trying to float the type *over* the image with a
cream wash. It cannot be made safe: no single wash survives both a blown-out
festival shot and a near-black venue interior, and the photos aren't ours to
control. The house style already said `never full-bleed behind text` — that
rule was right, and this is the shape that honours it while still getting the
image.

**Day-of:** the number is replaced by the word `Tonight` in the same serif and
the `DAYS UNTIL` line is dropped. The day-of state is also the **only** place
on Home that gets a full 16:10 photograph. That exclusivity is the point —
type for six weeks, a photograph on the night.

**Pluralization:** 1 day reads `DAY UNTIL`, never `1 DAYS UNTIL`.

**Nothing booked** — the most common state, since most people don't have a
ticket most of the time. The whole block is replaced:

- `UPCOMING` becomes `NOTHING BOOKED`
- A serif line: *What's on in Los Angeles*
- Three real upcoming shows in the user's city as compact rows
- A full-width **outlined** button (not solid ember): `SEE EVERYTHING`

## 2 · WHAT'S ON

Permanent. Discovery's only visible entry point on Home — the header
magnifying glass is not discoverable and cannot be the whole answer.

Placed second so the top of the page is one idea: the future you own, then the
future you could. Everything below is the past and other people.

Label left, the user's city right. Three rows: date stacked `SEP / 12` in a
narrow left column, artist ~22px serif, venue in the label style, and a small
circular `+` to save. Then a right-aligned `SEE EVERYTHING ›`.

These are suggestions, not the user's shows, so they read **lighter** than the
countdown — smaller type, no stubs, no photographs.

> **Offline contract.** This is the only section that needs the network
> (Ticketmaster). On failure it must collapse to nothing — silently. No
> spinner, no error, no empty box. Home renders from local data in a venue
> with no signal and that must stay true.

## 3 · UNLOGGED

The capture prompt the entire archive depends on: no logging, no rankings, no
Wrapped, no share cards. It had only ever been wired into the `tonight` state,
so on an ordinary day nothing on Home asked the user to log anything.

Tilted photographic print (−2°) left, text filling all remaining width beside
it, `LOG SHOW` pill on its **own line** underneath, right-aligned. With the
photo and the pill on one line only ~140px is left for text and both the date
and the city wrap.

Copy: *You were at **Geese** on Saturday.* — the **weekday within the last 7
days**, the date beyond it. The unlogged show can be any age, and "on
Wednesday" for something five months back is nonsense.

## 4 · ON THIS DAY

Label left, year right in the label style — the year is metadata, not a
headline. The **quote** from that night's note is the headline: ~26px italic
serif. Tilted print (+3°, the opposite way to UNLOGGED so the two never read
as a repeating pattern), ~80px.

## 5 · IN YOUR CIRCLE

Three rows maximum, then `SEE ALL ›`. Artist names ~24px — smaller than
yours. This is someone else's night.

## 6 · YEAR SO FAR

Three figures on one line, zero-padded two digits with labels beside them.
Closes the page.

---

## Rules that apply to everything on this screen

1. **Judge every text field against the longest plausible value**, never the
   one in the mockup. Artist names to 30 characters, venues to 40. Nothing
   clips, nothing reaches a third line. This is the single most common way
   these designs have broken.
2. **No `hover:` anywhere.** It never fires on touch and on iOS Safari a tap
   can strand an element in its hover appearance. `active:scale-95` instead.
3. **Nothing renders under the nav bar.** In the app this is free — the nav is
   a flex sibling, not `position: fixed`, so content physically cannot go
   beneath it. Clipping seen in base44 previews is an artifact of *their*
   fixed nav and is not a real bug.
4. **No remote images, no CDN scripts.** The app has to work in a venue with
   no signal.
5. **Small ember text uses `--ember-text` (`#C74B32`)**, not the accent —
   `#F93827` is 3.63:1 on paper and fails AA.
6. **An empty state is never an empty box.** Either render something
   deliberate or render nothing at all.
