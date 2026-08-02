# Notes as the currency

- Started: 2026-07-31
- Status: shipped (dev)
- Last updated: 2026-07-31

## Context

From the comp analysis: on Letterboxd **the review is the currency, not the
score** — and Letterboxd is the closest model to Melo by a distance. This was
point 3 of the Edition C spec and it got skipped; the drawer and the public
profile shipped without it.

What notes actually were on `ShowDetail`:

- **Third in the section order**, below Photos and Videos
- Set in **15px muted body text** (`--brown-light`) under a "Notes" heading
- Which reads as *metadata about* the night rather than *the account of* it

Meanwhile the same text already renders in the friends feed (`snippet(show.notes)`),
so the feed treated it as more important than the show page did.

## Changes made

- 2026-07-31:
  - **Moved above the media.** What you wrote now comes before Photos and
    Videos. It's the one part of a logged show that is entirely the user's
    voice; the photos are evidence, the note is the account.
  - **Restyled as a pull quote** — 17px ink-coloured, an amber left rule, a
    hanging quote mark, and a warm gradient wash. Dropped the "Notes" heading
    entirely: a label that says "Notes" frames it as a field.
  - **`white-space: pre-wrap`** so the user's own line breaks survive. They
    were being collapsed, which silently reformatted people's writing.
  - An owner-only **Edit** affordance inline, so the note is directly editable
    from where it's read rather than via the full log sheet's Notes section.

## Open questions / follow-ups

- **The feed snippet is still a truncated one-liner.** If notes are the
  currency, the feed card should give a longer excerpt — that's where other
  people actually encounter someone's writing.
- **Nothing prompts for a note.** The four-tap log deliberately skips it, and
  the full sheet buries it. If this is the currency, something should ask —
  perhaps the recap end card ("say something about this night").
- The public profile (`melo.show/@handle`) does **not** publish notes, which is
  correct by default but worth revisiting as an opt-in: a résumé of shows with
  no writing is a list, not a voice.
