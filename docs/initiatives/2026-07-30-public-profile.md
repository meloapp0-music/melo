# Edition C — the stub drawer and the public profile

- Started: 2026-07-30
- Status: built (dev) — migration 0021 NOT applied, worker NOT deployed
- Last updated: 2026-07-30

## Context

Letterboxd gets enormous visual richness for free: every film ships with a
poster. **Concerts ship with nothing.** A logged show is a string of text. So
Melo has to *manufacture* the artifact Letterboxd is handed — which reframes the
recap cuts, the share cards and the drawer from "features" to load-bearing.

Two pieces here:

1. **The stub drawer.** `MyShows` was a filtered grid — a database view. The
   digital ticket killed the shoebox and there is nothing left to keep; this
   puts the object back. It's the most defensible design idea in the app
   precisely because it restores something that was taken away.
2. **The public profile.** `melo.show/@username` — a concert résumé people put
   in a bio, which markets Melo continuously without anyone paying for it.

## The drawer

A third view mode alongside grid and list. Stubs overlap by 6px, each rotated a
fraction of a degree seeded by its index so the pile looks handled rather than
stacked; paper stock is picked deterministically from the name (five shades) so
a drawer reads like different tickets and a given show always looks the same.
Oswald caps, a dotted perforation down the left edge, the derived score in
brick. A festival gets a brick left border and its act count — one stub for the
weekend, consistent with the outing ranking.

## The public profile

Server-rendered in the Cloudflare Worker (`marketing/routes/profile.js`) so link
previews work — a client-rendered SPA can't produce per-profile OG tags and
scrapers don't run JS.

**The privacy difference from the share page, which is the whole design.** A
share token is unguessable, so `/s/<token>` is safe by obscurity plus opt-in.
A profile URL is `@username` — **guessable by design, that's the point.** So:

- `public_profile` defaults to **false**. Existing users publish nothing.
- `get_public_profile()` hard-filters on that flag; an un-published handle
  returns zero rows and the page 404s.
- A missing handle and an un-published handle return the **same 404** —
  distinguishing them would leak which usernames are taken.
- Hand-picked column lists only. Never `user_id`, notes, ratings, buddies,
  wishlist, or anything not marked attended.
- No RLS policy was added to `profiles` or `shows`. `anon` still cannot read
  either table directly; the functions are the only public path.

The Settings toggle states exactly what becomes visible, confirms before the
first publish (never on the way back to private), and links to the live page.

## Changes made

- 2026-07-30: Built. Migration `0021_public_profile.sql` (opt-in flag + two
  SECURITY DEFINER readers with pinned `search_path`), `marketing/routes/
  profile.js` + a `/@handle` route in the worker, `publicProfile` mapped through
  `lib/db/profiles.js`, the Settings toggle, and the drawer view in `MyShows`.
- Verified the drawer in-browser against a mixed library: six stubs, the
  festival collapsed to one with its act count, derived scores rendering, paper
  varying per name.

## Open questions / follow-ups

- **RUN 0021 AND DEPLOY THE WORKER.** Until both, the toggle writes a column
  that doesn't exist and `/@handle` falls through to the static assets.
  Deploy is `cd marketing && npx wrangler deploy` — from the repo root it
  silently ships zero routes.
- The profile page has no OG *image*. A generated card (the drawer, rendered)
  would make shared links far stronger — the share-card canvas renderer already
  exists and could serve it.
- Reserved handles: `@tonight` and `@s` would currently be matched by the
  profile route before their own routes if anyone registered them. The route
  order protects `/tonight` and `/s/…`, but a username blocklist would be safer.
- The drawer doesn't yet offer the ranked order as a sort. It's date-desc like
  the rest of MyShows; "best first" would make it a different, also-good object.
