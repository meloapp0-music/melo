# Initiatives Index

Running log of the major pieces of work on Melo. Newest first. One line per
initiative. See `CLAUDE.md` in the repo root for the full process.

- `2026-05-06-v1-0-3-venue-links.md` — in-progress · v1.0.3 release
  tracker. Now bundles BOTH venue links (Phase 1 of
  `2026-05-05-venue-and-merch-links.md`) AND email confirmation
  on signup (Phase 1 of `2026-05-06-email-mfa.md`) — scope expanded
  late on 2026-05-06 at user's request. All code on main; pending
  Supabase Dashboard config + dev sanity test.
- `2026-05-06-email-mfa.md` — in-progress · Phase 1 (email
  confirmation) bundled into v1.0.3 instead of v1.0.4. Phase 2
  (optional TOTP 2FA in Settings) still planned for v1.2+.
  Prerequisite for `2026-05-06-contacts-buddy-discovery.md`.
- `2026-05-06-contacts-buddy-discovery.md` — planned · v1.2 · Sync
  iOS contacts (hashed client-side, never raw) → match against opted-in
  Melo users → "Add" for matches, "Invite via SMS" for the rest.
  Privacy-first: SHA-256 + server pepper, no raw phone/email ever
  leaves the device, opt-in for being discoverable. Depends on
  `2026-05-05-buddies-phase-2.md` Phase 2a.
- `2026-05-05-social-layer.md` — planned · v2.0+ · The big one. DMs,
  show plans (group event coordination), discoverability at shows,
  meet-new-people, "concert family" surfaces. Hard-blocked on a
  moderation/T&S layer (blocks, reports, admin tooling, image scanning,
  underage policy). Re-confirmed 2026-05-06 — App Store Guideline 1.2
  requires this floor; not shipping until ~2-3 weeks of T&S infra is in.
- `2026-05-05-notifications-system.md` — planned · v1.1+ · Full
  notification matrix on top of existing `tour-alerts` cron — tour
  announces, ticket price drops, festival lineup adds for liked
  artists, best-value alerts, buddy events. Re-cut 2026-05-06: in-app
  inbox + `lineup-watcher` pulled forward to v1.1 (~1 week), price-
  poller v1.2, buddy-events follow buddies-phase-2, best-value v1.4+.
- `2026-05-05-recommendations.md` — planned · v1.2 · The Melo
  algorithm. 3-tier recommender: content-based taste profile (Tier 1),
  festival fit scoring (Tier 2), collaborative filtering once we have
  enough users (Tier 3). Re-cut 2026-05-06: Tier 1 pulled forward to
  v1.2 (~1 week, no ML infra). Tier 3 honestly needs ~1k MAU first.
- `2026-05-05-venue-and-merch-links.md` — in-progress · v1.0.3 ·
  Per-show links to the official venue page + artist merch + tour-
  specific merch. Re-cut 2026-05-06: Phase 1 (venue links via
  Ticketmaster) pulled into v1.0.3 — the cheapest user-facing win in
  the whole roadmap. Implementation starting today.
- `2026-05-05-buddies-phase-2.md` — planned · v1.1 · Bridge from
  free-text buddy labels → real Melo accounts. Friendships table,
  username search + autocomplete, `show_attendees` for shared shows,
  buddy profile view, see-buddies-going on upcoming shows. Re-cut
  2026-05-06: Phase 2a + 2b pulled forward to v1.1 (~2-3 weeks),
  shipping with a basic `blocks` table from day one. Canonical
  Phase 2 of `2026-04-17-backend-and-social.md`.
- `2026-05-05-wrapped-map-slides.md` — planned · v1.1 Wrapped
  enhancement. New "You traveled for music" slide section: venue +
  city + state/country counts, total miles, animated map showing every
  concert location in chronological order. Reuses existing Leaflet
  stack from ConcertMap.
- `2026-05-03-v1-0-2-fixes.md` — shipped 2026-05-06 · Build 6 live
  in App Store. Inline username + display name editing in Settings,
  "Edit show" button on ShowDetail, "+ Add" buddy modal on the
  Buddies page.
- `2026-05-01-llc-formation.md` — planned · Form Melo LLC, get EIN +
  DUNS, switch Apple Developer account from Individual to Organization
  so the App Store seller name reads "Melo, LLC", move recurring expenses
  into the business. Kick off after v1.0 approval, before any paid feature
  ships.
- `2026-04-30-commemorative-tickets.md` — planned · Auto-generated digital
  ticket per attended show — vintage-stub aesthetic, rarity tiers (festivals,
  iconic venues, milestones), Collection view, share-to-IG, with a future
  Melo+ paid tier for animated/exclusive designs. Targeting v1.2+.
- `2026-04-28-v1-0-1-fixes.md` — in-progress · Post-launch hotfixes queued
  for v1.0.1 (Build 5). Setlist.fm picker now keeps empty-setlist rows
  for DJ/electronic acts (Zeds Dead, Subtronics, etc.); follow-ups to
  retire dead `corsproxy.io` fallback and add an empty-state nudge
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
