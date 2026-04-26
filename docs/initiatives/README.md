# Initiatives Index

Running log of the major pieces of work on Melo. Newest first. One line per
initiative. See `CLAUDE.md` in the repo root for the full process.

- `2026-04-20-pre-launch-sprint.md` — shipped · Pre-launch combo —
  push notifications + daily `tour-alerts` cron (APNs via .p8),
  photos on shows (Storage bucket + PhotoPicker/Gallery, Wrapped
  prefers user photos), first-run Calendar import, AES-GCM
  encryption-at-rest for the Setlist.fm key (now proxied through
  `setlistfm-proxy` Edge Function), and a marketing site at
  `marketing/` with App Store listing copy
- `2026-04-20-make-it-legal.md` — shipped · Legal page
  (Attributions/Privacy/Terms), Settings entry point, in-context
  attributions on ShowDetail/PlayableSetlist/Festivals, account
  deletion via new `delete-account` Edge Function, Supabase-hosted
  `api-proxy` Edge Function replacing third-party corsproxy.io
- `2026-04-20-clickable-home-stats.md` — shipped · Home's Shows /
  Artists / Cities stat blocks are now tappable drill-downs — Shows
  routes to MyShows, Cities opens the Concert Map globe (now
  reachable again + with a back button), Artists opens a new
  collapsible-list subpage with per-artist show count + avg score
- `2026-04-20-festivals.md` — shipped · Festivals discovery page
  powered by Ticketmaster (classificationName=Festival) with Near
  Me/Anywhere toggle, "N of your artists playing" badges matching
  the festival lineup against a new weighted `topArtists` helper,
  one-tap "+ Going" that reuses the Going tier
- `2026-04-20-going-tier.md` — shipped · third show status between
  Wishlist and Attended ("I have tickets"); LogShow/MyShows get
  Attended/Going/Wishlist tabs, Home gets a Going countdown and
  a "How was [show]?" CTA that pivots past Going shows into the
  score editor on one tap
- `2026-04-20-historical-show-search.md` — shipped · LogShow's
  Setlist.fm autocomplete now honors the City and Date fields, so
  historical shows (e.g. Goose at Salt Shed, Chicago, 2022) surface
  in the dropdown instead of only the 10 most recent setlists
- `2026-04-19-wishlist-and-detail-fixes.md` — shipped · ShowDetail
  score moved to hero corner, wishlist autocomplete rewired through
  Deezer (canonical artist lookup) + Ticketmaster Discovery API
  (upcoming shows) after Bandsintown locked down their public API
- `2026-04-19-playable-setlists.md` — shipped · Setlist songs in
  ShowDetail are now tappable: 30-sec preview plays inline, sibling
  Spotify + Apple Music deep-link icons
- `2026-04-19-show-autocomplete.md` — shipped · Inline real-show
  autocomplete in LogShow (Setlist.fm for past, Bandsintown for upcoming)
  with artist avatar, spinner, and one-tap autofill
- `2026-04-19-capacitor-ios-wrap.md` — in-progress · Capacitor wrap so
  Melo ships as a real iOS app (TestFlight → App Store)
- `2026-04-19-wrapped-overhaul.md` — shipped · Photo-backed slides with
  Ken-Burns zoom, gradient overlays, staggered reveals, personality collage
- `2026-04-19-songs-by-artist.md` — shipped · Songs page grouped into
  collapsible artist cards with inline iTunes 30s previews + Spotify
  deep-link
- `2026-04-19-bottom-nav-restructure.md` — shipped · 5-slot symmetric grid
  with raised + button and Buddies promoted to a top-level tab
- `2026-04-17-backend-and-social.md` — in-progress · Supabase auth + cloud
  sync + friends + shared-show attendance (5-phase rollout)
- `2026-04-17-brand-system.md` — shipped · MeloIcon/Wordmark/Lockup SVG
  components integrated across Home, Profile, Wrapped
- `2026-04-17-setlistfm-onboarding.md` — shipped · 3-step walkthrough in
  Settings + clickable hint in LogShow so users can self-serve the API key
- `2026-04-17-phase-3-features.md` — shipped · Streak cards, Wrapped year,
  Show Comparison, Quick Log pill, Discovery events
