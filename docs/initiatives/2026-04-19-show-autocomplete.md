# Real-Show Autocomplete in LogShow

- Started: 2026-04-19
- Status: shipped
- Last updated: 2026-04-19

## Context

The original LogShow flow asked the user to type artist, date, venue, city,
and full setlist by hand. Setlist.fm integration existed, but it was hidden
behind a collapsible "Real Setlists from Setlist.fm" section that only
appeared after the user had already typed an artist *and* set up an API key.
Brand new users had no idea the feature existed.

User asked: "I want to be able to type 'luke combs' and it should auto
populate with a list of shows to pick from and then based on the show I
picked it adds the setlist."

This is the discoverability + flow upgrade that turns logging from
type-everything-from-scratch into a 2-tap action.

## Plan

Replace the collapsible picker with a real inline autocomplete dropdown
under the Artist input, mirroring the existing City/Venue autocomplete
pattern (`.log-input-wrap` + `.log-autocomplete`).

Tab-aware data source:
- **Attended tab** → Setlist.fm `fetchSetlists` (past shows + setlists,
  requires user-provided API key, free 30-sec signup)
- **Wishlist tab** → Bandsintown `fetchUpcomingEvents` (upcoming shows,
  no key needed, ticket links)

Both endpoints already existed in `src/web/api.js`. The work was UX —
surface them inline, debounce as the user types, render a rich dropdown
item (artist · venue · location · date · songCount or "Upcoming" badge),
and on selection autofill artist/venue/city/date/setlist in one shot.

## Changes made

- 2026-04-19: Updated `src/web/api.js` `fetchSetlists` to also return
  `artist` (the canonical name from Setlist.fm) so picking a result
  auto-corrects user-typed casing like "luke combs" → "Luke Combs".
- 2026-04-19: Rewrote `src/web/pages/LogShow.jsx`:
  - Removed the collapsible "Real Setlists from Setlist.fm" section.
  - Artist input is now a real autocomplete (`.log-artist-wrap`) with the
    Deezer artist photo shown as a circular avatar inside the input on
    the left, a spinner on the right while fetching, and a dropdown of
    real shows that auto-opens when results arrive.
  - Tab-aware fetch: Wishlist → `fetchUpcomingEvents` (no key);
    Attended → `fetchSetlists` (requires `settings.setlistFmKey`).
  - Debounce 600ms, minimum 3 chars, max 8 results in the dropdown.
  - `pickShow()` autofills artist/venue/city/date/setlist; uses
    `justPickedRef` to suppress the immediate re-search that would
    otherwise re-open the dropdown right after selection.
  - No-API-key inline hint (Attended mode only) — sleek mini-banner
    that opens Settings on tap. Replaces the old larger hint block.
  - Helper `titleCase()` falls back when API doesn't return canonical
    artist name.
- 2026-04-19: Appended ~120 lines of CSS to `src/web/App.css`:
  `.log-artist-wrap`, `.log-artist-avatar`, `.log-input.with-avatar`,
  `.log-input-spinner` + `log-input-spin` keyframe, `.log-show-picker`,
  `.log-show-empty`, `.log-show-item`, `.log-show-item-main`,
  `.log-show-item-title`, `.log-show-item-venue`, `.log-show-item-meta`,
  `.log-show-item-songs` (orange gradient pill, blue variant for
  Upcoming), `.log-show-attr` ("Powered by Setlist.fm/Bandsintown"
  attribution).
- 2026-04-19: `npm run build` passes clean (86 modules, 0 warnings).

## Open questions / follow-ups

- Setlist.fm API key still per-user. Phase 4 of the backend initiative
  centralizes it into a Supabase Edge Function with a server-side key,
  so brand-new users would get the full experience with no setup.
- Bandsintown returns up to 5 events by default; could expand if wishlist
  users complain about not finding their target show.
- Consider also calling the Deezer artist search (`fetchArtistImage`)
  when the user types — already happens for the avatar, could also be
  used to suggest "Did you mean…?" for misspelled artist names.
- The old `.setlist-picker*` CSS classes (lines 2506-2580 of App.css)
  are now unused and could be removed in a future cleanup pass.
