# Initiatives Index

Running log of the major pieces of work on Melo. Newest first. One line per
initiative. See `CLAUDE.md` in the repo root for the full process.

## Release sequence (as of 2026-05-08)

| Version | Theme | Initiatives | ETA |
|---|---|---|---|
| **v1.0.3** ✅ shipped | venue links + email confirm | venue-and-merch-links P1, email-mfa P1 | live |
| **v1.0.4** ⏳ in review | Wrapped juice | wrapped-juice (kinetic + map + battles) | this week |
| **v1.0.5** ✅ shipped | quick polish wins | pre-show-toolkit P1 (last-time), email-template fixes, ★ Favorite toggle + trimmed vibes (15 → 9), product-analytics (PostHog instrumentation), data-export (CSV/JSON), "So Far" Wrapped relabel + year archive, Wishlist→Going upgrade, setlistfm-proxy 404 fix, venue overrides | live |
| **v1.0.6** | post-ship polish | photos-and-openers (Your Year in Photos slide + openers field with TM+SLF auto-suggest), time-capsule notifications, Music Explorer kv-fallback fix | this week |
| **v1.0.7** | logging retention fix | festival-past-show-finder — "Find a past show" mode: location-first Setlist.fm search (city/year/venue, no artist) + festival grouping + multi-select batch log. Fixes the churn point (hard to log past/festival shows). Pulled ahead of Wrapped Depth. | this week |
| **v1.0.8** | Wrapped depth | wrapped-depth — Quotes from your notes slide + Songs you heard most + Year-over-year delta. No new schema; reads existing notes/setlist/cross-year shows. Includes a dynamic-slide-index refactor (was overdue). | ~1 week |
| **v1.1** | **Dark Mode** | dark-mode (headline) — CSS variable refactor + dark palette + theme toggle + persistence. Closes the marketing-vs-product gap (carousel + single-image posts already show dark UI). | ~1-1.5 weeks |
| **v1.2** | **Wishlist Watching** | wishlist-watching (headline) — "notify me when Goose announces Chicago" + notifications-system P1 (inbox + lineup) | ~2-3 weeks |
| **v1.3** | the social pivot begins | buddies-phase-2 P2a+2b, contacts-buddy-discovery, recommendations Tier 1, venue-and-merch P2, notifications price-poller, email-mfa P2 (TOTP) | ~6-8 weeks |
| **v1.4** | financial + collection | concert-economics P1+2, merch-collection P1, recommendations Tier 2 (festival fit), commemorative-tickets P1, buddies-phase-2 P2c-d (going + seats) | ~3 months |
| **v1.5** | gamification + music | predictions-game P1+2, music-integration P1+2 (Spotify), notifications buddy events | ~4 months |
| **v1.5+** | polish + premium | concert-economics P3+4 (itemized + worth-it), merch-collection P3+4 (rarity + impact), commemorative-tickets P2+ (rarity, share), music-integration P3 (Apple Music) | ~5-6 months |
| **v2.0+** | social layer | social-layer (DMs + plans + discoverability + moderation), pre-show-toolkit P2 (presale codes), predictions-game P3 (group leaderboards) | ~6-9 months |

The order above respects dependencies: nothing social ships before
buddies + moderation infra. Cost analysis (concert-economics P4) waits
on itemized cost capture (P3). Etc.

- `2026-05-21-festival-past-show-finder.md` — in-progress · v1.0.7 ·
  Fixes the #1 churn point: logging past/festival shows was
  100% artist-driven. Adds a "Find a past show" mode on the Attended
  tab — location-first Setlist.fm search (city/year/venue, no artist
  required), results grouped by festival, multi-select, batch "Log N
  shows" with festival/setlist auto-filled. New `searchPastShows` API
  + `createShows`/`addShows` batch helpers. No schema change. Pulled
  ahead of Wrapped Depth.
- `2026-05-22-growth-strategy.md` — strategy (living) · Master growth &
  retention playbook synthesized from a 7-agent / 71-idea brainstorm.
  Core: "The Pass" identity-and-collection system (archetype tiers,
  per-artist Superfan badges, Collection Passport, Founding scarcity,
  earned Streak Freeze). Quick wins (wire the dead Wrapped share button,
  branded footer, per-slide share, archetype evolution, superfan
  badges), big bets (year-round Wrapped/stubs, Bust-out Rarity Radar,
  friends compare cards, programmatic SEO, Setlist Bingo), outside-the-
  box plays (lot-scene QR cards, adopt-a-band scribe, Show Twins,
  Founding 100), and an anti-burnout plan. Favors $0 status rewards.
- `2026-05-22-wrapped-share-export.md` — planned · QUICK WIN #1 (before
  December) · Wire the confirmed dead "Share your year" button
  (Wrapped.jsx:717) → branded 1080×1920 IG-Story export, reusing the
  existing deliverFile() share path; then per-slide share. The #1 viral
  gap.
- `2026-05-22-engagement-retention-loops.md` — planned · "A reason to
  keep logging" (the biggest retention lever). Post-show "rate it"
  prompt (Going→Rated loop, highest leverage), friends activity +
  **multi-dimensional friends-leaderboards** (shows/miles/together/
  discoveries/genres — friends-only, celebratory), streaks + goals,
  collection/completion (venues/cities/states/festivals), expanded
  badges, monthly mini-recaps. Mostly derived data; depends on the
  friend system for leaderboards.
- `2026-05-22-home-screen-widget.md` — planned · Daily home-screen
  presence users *choose* (vs. notification spam): a WidgetKit/SwiftUI
  widget showing next-show countdown (P1), on-this-day memory (P2), and
  streak/stats (P3). Honest flag: this is the most native work in Melo
  (Swift, separate Xcode target, App Group shared storage, JS→native
  bridge) — consider native-iOS help for the Swift portion. No schema.
- `2026-05-22-notification-expansion.md` — planned · next notification
  build · Adds two notification kinds to the cron: **discovery**
  (taste-based — artists you'd like, via Deezer related-artists,
  playing your city) and **festival_lineup** (a festival's lineup
  dropped with N of your artists). Plus a Settings notifications-toggle
  section (migration 0011) now that there are 5+ kinds. Builds on the
  existing tour-alerts cron, pre-show reminders, and city alerts.
- `2026-05-22-cold-start-activation.md` — planned · v1.2 (build after
  v1.1 ships, informed by the PostHog funnel) · Fixes the empty-new-user
  churn. Activation onboarding funneling into the past-show finder +
  reviving calendar import + "popular near you" cold-start content +
  new-user reminders. Feasibility note: Ticketmaster order-history sync
  is NOT possible (no consumer API); calendar sync is feasible (plugin +
  hidden ImportFromCalendar already exist); email-confirmation parsing
  is powerful but heavy (Gmail OAuth + verification) — deferred.
- `2026-05-22-artist-in-your-city-alerts.md` — in-progress (code done,
  pending Edge Function redeploy) · The one part of Seated the user
  wanted, built natively: a push when an artist you care about is
  playing your city. Extends the existing `tour-alerts` cron —
  broadens the watch set to loved (score≥7) + going + wishlist
  artists, derives home city server-side from logged shows (no GPS),
  filters the TM lookup to that metro, and sends "{artist} is playing
  {city} 🎟️". No schema change, no new dependency. Deploy:
  `supabase functions deploy tour-alerts`.
- `2026-05-21-trip-discovery.md` — in-progress · Phase 1 shipped ·
  "Who's playing in [city]?" Festivals page → **Discover** page with a
  Shows | Festivals toggle. Shows = instant city search (type Austin →
  all concerts there, taste-matched first, with prices + Tickets links
  + one-tap Wishlist). New `fetchEventsByCity` API. No migration, no
  geolocation in v1. Deferred phases: GPS "near me," saved `trips`
  table for advance planning, calendar auto-trips, trip notifications.
- `2026-05-21-v1-0-7-wrapped-depth.md` — planned · v1.0.8 (bumped to
  make room for the festival finder) · Three new
  Wrapped slides that triple emotional density with zero new schema:
  Quotes from your notes (surface a memorable note line on a show
  background), Songs you heard live the most (top 5 across all
  setlists), and Year-over-year delta vs the prior year. All three
  are conditional (skip when data missing). Bundles in a
  dynamic-slide-index refactor so the slide order stops being a hard-
  coded literal across the file. Sets up a future share-to-IG-Stories
  export (deferred to v1.0.8).
- `2026-05-21-v1-0-6-photos-and-openers.md` — in-progress · v1.0.6 ·
  Two user-requested adds. (1) "Your Year in Photos" closing Wrapped
  slide — 4×5 mosaic of every photo from the year (deduped, capped
  at 20), conditional rendering so years with 0 photos skip it.
  (2) `openers` text[] column (migration 0009) + LogShow chip UI +
  auto-suggest from Ticketmaster's `lineup` (upcoming) and a new
  Setlist.fm co-act lookup (past) — solves the "Finn Wolfhard opened
  for Twin Peaks" case with one tap.
- `2026-05-18-comparative-rating.md` — planned · slot TBD (headline-
  worthy) · Beli-style comparative rating — replace the absolute typed
  1–10 score with a positional model: a gut bucket + binary-search
  head-to-head comparisons place each show in a total order, and the
  decimal score is derived from rank position (so logging a new show
  re-scores the library). Reframes "Compare" from competition to
  calibration. Builds on existing elo.js / battle_wins / Rankings
  groundwork.
- `2026-05-15-v1-0-5-favorite-and-vibes.md` — in-progress · v1.0.5 ·
  ★ Favorite a show (migration 0008 `is_favorite`, ShowDetail star
  toggle, My Shows Favorites filter + badges) + trim the vibe picker
  15 → 9 (retired-vibe colours kept via a `vibeStyle` helper so old
  shows still render right). Code on main; pending migration apply.
- `2026-05-15-product-analytics.md` — in-progress · v1.0.5 · Instrument
  Melo with PostHog — currently zero analytics, flying blind on usage.
  Wrapper module `src/web/lib/analytics.js`, ~10 funnel events
  (activation + logging + Wrapped reach), privacy-first (no autocapture,
  no content, identify by user_id only). Prerequisite for all retention
  work. ~1 day; bundles into v1.0.5.
- `2026-05-08-pre-show-toolkit.md` — planned · v1.0.5 (P1) → v1.2 (P2)
  · Cluster of pre-show features. P1 = "last time you saw them" + opener
  bio cards (cheap derived-data wins, ~3-4 hrs). P2 = presale code
  sharing (depends on buddies + moderation). P3 (parking/transit) deferred
  until Melo has user density.
- `2026-05-08-merch-collection.md` — planned · v1.3 · Digital merch
  cabinet — photo log per show, Collection grid in Profile grouped by
  artist or year. Phase 2 surfaces spending totals once concert-economics
  ships cost-itemization. Phase 3 user-marked rarity. Trading marketplace
  intentionally NOT scoped (Splitwise-style scope explosion).
- `2026-05-08-predictions-game.md` — planned · v1.4 · Pre-show rating /
  setlist / over-under / encore predictions. Locked at showtime, accuracy
  computed post-log. "Predictor" stat card on Profile + Wrapped tie-in
  ("you called the encore right 14 of 18 times"). Phase 3 group
  leaderboards depend on social-layer.
- `2026-05-08-concert-economics.md` — planned · v1.3 → v1.5 · Optional
  cost-per-show capture, annual budget tracker, "worth it" analysis ($/
  rating). Phased so the cheap parts ship first; itemized breakdown is
  Phase 3. Friend split tracking deliberately skipped (Splitwise wins).
- `2026-05-08-music-integration.md` — planned · v1.4 · Spotify OAuth
  first (better API + bigger US share), Apple Music as Phase 3 if user
  demand justifies. Setlist playback (auto-create Spotify playlist of
  the actual setlist) + pre-show hype playlists + listening-stats
  overlay on shows. Builds on the existing PlayableSetlist initiative.
- `2026-05-07-v1-0-4-wrapped-juice.md` — in-progress · v1.0.4 ·
  Wrapped polish + travel chapter. Replaces system emojis on the
  Vibes + Personality slides with kinetic typography (each vibe /
  archetype gets its own gradient + motion language). Adds 5-slide
  Map chapter between Cities and Vibes (travel intro, venue depth
  new-vs-return, geographic spread, animated Leaflet map with
  miles counter, most-visited venue). Polish: confetti on year
  intro, shimmer on highest-rated score. Built while v1.0.3 was
  in App Review.
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
- `2026-05-12-dark-mode.md` — planned · v1.1 (headline) · CSS variable
  refactor + dark palette + Settings theme toggle (Light / Dark /
  System) + per-device persistence via localStorage and a new
  `user_settings.theme_preference` column for cross-device sync.
  Closes the marketing-vs-product gap (the carousel + single-image
  posts already show dark UI; this makes them accurate). ~1-1.5 weeks.
- `2026-05-11-wishlist-watching.md` — planned · v1.2 (headline) ·
  "Notify me when Goose announces Chicago." Sibling concept to
  Wishlist (different tab, different intent — announced shows vs
  future-announce alerts). Extends existing tour-alerts cron with
  per-artist aggregation, fuzzy city match within radius, multi-city
  dedupe. Schema: new `wishlist_watches` table. ~2 weeks of focused
  work; reuses APNs + Edge Function infrastructure already shipped.
- `2026-05-05-buddies-phase-2.md` — planned · v1.3 · Bridge from
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
