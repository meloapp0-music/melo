# Melo Roadmap & Feature Catalog

Living document. Last updated: 2026-05-04.

This is the strategic feature view — what's shipped, what's queued, and
ideas worth considering. The detailed implementation plans live in
`docs/initiatives/` (one file per initiative); this doc is the index and
the future-thinking layer above them.

---

## Section 1 — Shipped (v1.0 + v1.0.1)

These are live in users' hands as of the v1.0 launch on 2026-05-03 (or
about to be, with v1.0.1 in App Review).

### Core tracking
- Log attended shows (artist, date, venue, city, score, vibes, notes)
- Log shows you're going to (the "Going" tier)
- Wishlist artists you'd kill to see live
- Photo uploads on shows (Storage bucket, PhotoPicker/Gallery)
- Manual setlist entry + auto-fill from Setlist.fm
- Real-show autocomplete in Log Show (Setlist.fm + Ticketmaster + Deezer)
- Historical show search (city + year filters for old shows)
- Buddy / "Went With" tagging (free-text labels — Phase 1)

### Discovery & data
- Festivals page (Ticketmaster classification=Festival, with "N of your
  artists playing" badges)
- Artist auto-image (Deezer canonical lookup)
- Concert Map (every venue you've been to, on a globe)
- Artist drill-down (per-artist show count, songs heard live, avg score)
- Songs page (every song you've heard live, grouped by artist with
  inline iTunes 30s previews + Spotify deep-link)
- Playable setlists (30-sec preview + Spotify/Apple Music deep-link icons)
- Ticketmaster wishlist alerts (daily `tour-alerts` cron)

### Social & profile
- Auth (Supabase email + password, Apple Sign-In)
- Cloud sync (shows, photos, settings — RLS owner-only)
- Profile (avatar, displayName, username, badges, stats)
- Buddies tab (Phase 1: derived from buddy labels in shows)
- Streak cards (current + longest)
- Show comparison (head-to-head between two shows)
- Friends activity feed scaffolding (Phase 2 still pending)

### Wrapped
- Year-end Wrapped reveal (Spotify-Wrapped-style story slides)
- Photo-backed slides with Ken-Burns zoom + gradient overlays
- Wrapped year picker (any prior year, not just current)
- Personality collage / staggered reveals

### Onboarding & polish
- 3-step Setlist.fm guided walkthrough in Settings (now optional in
  v1.0.1 thanks to shared-key fallback)
- First-run home / Quick Log pill / Discovery events
- Edge-to-edge safe-area handling on iOS
- Bottom nav: 5-slot symmetric grid with raised "+" button

### Infrastructure & legal
- Supabase backend with RLS on every table
- AES-GCM encryption-at-rest for the Setlist.fm key
- `setlistfm-proxy` Edge Function (now with shared-key fallback)
- `api-proxy` Edge Function (replaced corsproxy.io)
- `delete-account` Edge Function (account deletion cascade)
- `tour-alerts` Edge Function (daily Ticketmaster wishlist scan)
- APNs push notifications (.p8 key)
- Calendar import (deferred to v1.1 — capacitor-calendar plugin pending)
- Legal pages (Privacy / Terms / Attributions)
- In-context attributions (Setlist.fm, Ticketmaster, Deezer, MusicBrainz)
- Brand system (MeloIcon / MeloWordmark / MeloLockup SVG components)

### v1.0.1 hotfixes (in App Review as of 2026-05-03)
- Setlist.fm filter fix — empty-setlist rows now surface for DJ /
  electronic acts (Zeds Dead, Subtronics, Excision)
- Buddy chicken-and-egg fix — first-time users can finally tag a buddy
- Empty-state copy clarification on no-match search
- **Shared-key fallback** — Setlist.fm now works out of the box; per-user
  key is optional / advanced
- Settings reframe — Setlist.fm card marked "optional / bring your own
  key (advanced)"

---

## Section 2 — In flight

### v1.0.2 (Build 6) — queued
**File:** [`2026-05-03-v1-0-2-fixes.md`](initiatives/2026-05-03-v1-0-2-fixes.md)

- Inline username + display name editing in Settings (Onboarding
  promised "you can change it later" but the UI was never built)
- Reserve slot for whatever else surfaces from real users post-v1.0.1

### LLC formation
**File:** [`2026-05-01-llc-formation.md`](initiatives/2026-05-01-llc-formation.md)

10-step plan from picking a state to switching the Apple Developer
account from Individual to Organization (so the App Store seller name
reads "Melo, LLC"). Scheduled for the 2–4 weeks between v1.0.1 ship and
v1.2 monetization.

### Capacitor iOS wrap
**File:** [`2026-04-19-capacitor-ios-wrap.md`](initiatives/2026-04-19-capacitor-ios-wrap.md)

Status: in-progress. v1.0 shipped via this wrap. Ongoing tweaks.

### Backend & social Phase 2
**File:** [`2026-04-17-backend-and-social.md`](initiatives/2026-04-17-backend-and-social.md)

Status: in-progress. The dedicated friendships table replaces the
Phase 1 free-text buddy labels. Unlocks real-user buddy autocomplete,
notifications, friend feeds, shared-show attendance.

---

## Section 3 — Planned

### Commemorative tickets (v1.2+)
**File:** [`2026-04-30-commemorative-tickets.md`](initiatives/2026-04-30-commemorative-tickets.md)

Auto-generated digital ticket per attended show — vintage paper-stub
aesthetic. Rarity tiers (festivals, iconic venues, milestones). New
"Collection" view. Share-to-IG. Future Melo+ paid tier for animated /
exclusive / limited-edition designs. The single highest-leverage feature
for differentiation, viral marketing, and monetization.

### Real buddy autocomplete (v1.1 / Phase 2)
Discussed in this conversation, scoped here for the future:
- User search by handle (`@username`) with privacy-respecting RLS
- Friend-request / acceptance flow with notifications
- Tagging real Melo users on shows (vs. free-text labels)
- Avatar chips instead of letter monograms
- Migration: existing free-text buddies coexist with user-linked buddies
- Privacy controls: opt-in to be discoverable

---

## Section 4 — Ideas to consider (uncommitted)

Curated differentiators that fit Melo's brand ("Where concerts live
forever"). Not on any roadmap yet — each would deserve its own
initiative file before scoping.

### Memory & nostalgia (the brand's heart)

1. **Anniversary reminders** — push notification on the date of a past
   show: *"Today, 3 years ago, you saw Phoebe Bridgers at the Greek
   Theater."* Re-engages users at zero ongoing cost. Easy to build.

2. **Time capsule mode** — opt to "seal" a show for 1 year. App hides
   it from you, then surprise-reveals it on the anniversary as a
   "remember when" moment. Emotional, unique, easy to build.

3. **First-time milestones** — auto-detect "your first concert,"
   "first festival," "first time seeing X," "first time at this
   venue." Auto-flagged in the show row + on Wrapped slides. Easy
   wins, lots of emotional weight.

4. **"Saw them while they were alive" tracker** — a quiet, respectful
   badge for users who saw an artist before they passed. Memorial-grade
   collectible. Deeply emotional and viral when artists pass.

5. **Voice memos per show** — record a 30-second post-show voice memo
   on the walk to the car. "Best moment was when she paused mid-song
   and the whole crowd sang it back." Long-form memory artifact that
   nobody else does.

6. **Concert journaling / vibes log** — beyond the score, capture the
   mundane gold: what you wore, who you went with, what you ate
   beforehand, where you parked. Future-you will thank present-you.

### Social & discovery (Phase 2 territory)

7. **Group / couple Wrapped** — "Your year together in live music."
   Wrapped that takes the union of two friends' shows. Highly
   shareable, viral on launch.

8. **Friends going to the same show** — when you save a show as Going,
   surface "Emma is also going" / "3 friends from Buddies are going."
   Drives Buddies tab engagement and turns shows into social events.

9. **Concert genealogy** — "You saw Bon Iver, here are 3 artists you'd
   probably love who are touring near you." Personalized recommendation
   engine on top of your taste graph.

10. **Buddy match-making at festivals** — "Sarah is at Coachella this
    weekend too." Festival-mode feature; reveals overlap, opt-in.

### At the show (live engagement)

11. **Live setlist follow-along** — at the show, follow along as
    Setlist.fm community updates the setlist in real time. *"You're 8
    songs in, encore probably coming."* Sticky daily-use feature for
    engaged users.

12. **Pre-show setlist prediction** — before a show, see what songs
    the artist is most likely to play based on their last 5 setlists.
    Pre-show hype + planning ("she's been opening with Black this
    tour"). Drives daily use during tour seasons.

13. **GPS attendance auto-confirm** — open the app at the venue, it
    auto-marks the show attended (with explicit confirm tap). Reduces
    friction to log a show.

14. **Pre-show prep checklist** — earplugs reminder, ride-share
    booking, ticket QR cached offline, "where is parking?" reminder.
    Utility moat.

### Collection & status

15. **Concert poster generator** — print-on-demand custom poster for
    any logged show, in your chosen aesthetic (vintage gig poster,
    minimalist editorial, retro festival). Affiliate / direct revenue
    via Printify or similar.

16. **Tour completionism badges** — "You saw 5 of 23 dates of the
    Eras Tour." Achievement system with rarity tiers.

17. **Venue regulars** — auto-track venues you've been to 5+ times.
    "Fillmore regular." "Red Rocks pilgrim." Venue stats page.

18. **Genre discovery achievements** — "You've seen indie rock at 12
    different venues." "Your most diverse year was 2024." Stats nerd
    bait.

### Festival specific

19. **Festival lineup builder** — drag-and-drop personal schedule for
    festivals with conflict warnings ("Phoebe and Bon Iver overlap from
    9–10 PM on Saturday"). Massive utility for Coachella / Glastonbury
    / Lollapalooza weekends. Could be a viral standalone feature each
    festival weekend.

20. **Festival ticket commemorative override** — when you log a
    festival, get one Festival-tier commemorative ticket showing the
    full lineup as the back of the card. Ties into the commemorative
    tickets initiative.

21. **Festival "where I was when..."** — tag historic moments at
    festivals (TSwift surprise appearance at Coachella, etc.). Future
    bragging rights. Featured stickers in shareable cards.

### Bigger bets / future moats

22. **Artist gift-buying / merch affiliate** — when an artist drops new
    merch / a tour film / an album, alert users who've seen them and
    surface the buy link. Affiliate revenue.

23. **Artist-side product** — premium tier for artists/managers showing
    aggregate data: which shows generated the most ticket shares, where
    fans are clustering, what songs are most logged. B2B revenue line.

24. **Concert film tie-ins** — when a tour film drops, ping users who
    saw a tour stop. Viral moment when the next *Renaissance: A Film By
    Beyoncé* lands.

25. **Tour lineup leaks / verified leaks** — partner with verified
    leakers in the live music community for early-access tour
    announcements. Legal gray area but huge engagement driver.

26. **Concert trading / swap (controversial)** — secondary ticket
    marketplace within friend network. Hard to build, regulatory
    minefield, but enormous if it worked.

27. **AR ticket display** — point your phone at a concert poster /
    venue / festival entry and see your collection of tickets from that
    venue overlaid in AR. Future tech.

### Quality of life

28. **Setlist sharing via QR / NFC at the show** — at a concert, friends
    nearby can scan to add the same show to their log. Reduces friction
    for group-shows.

29. **Recurring show templates** — for regulars (Phish runs, residencies,
    monthly shows at a local venue), template the metadata so you only
    log the date + what was different.

30. **iOS Live Activities for upcoming shows** — Lock-screen widget
    showing the countdown to your next show + venue + weather forecast.
    Daily-use moat.

31. **Apple Watch app** — quick log on the way out of the venue. Score
    the show before you've left the parking lot.

32. **Android version** — already noted in the melo.show waitlist copy.
    Real demand exists outside iOS.

---

## Section 5 — Strongest differentiators (my picks)

If I had to pick the **5 features most worth building next**, in order:

1. **Commemorative tickets** ([already planned](initiatives/2026-04-30-commemorative-tickets.md))
   — viral, monetization-enabling, brand-aligned, no competitor has it.

2. **Anniversary reminders + first-time milestones** — bundled, fast to
   build, deeply emotional, permanently sticky.

3. **Real buddy autocomplete + group Wrapped** — Phase 2 social work
   already in flight; group Wrapped specifically would be a viral
   launch moment for the v2.0 social era.

4. **Live setlist follow-along + pre-show predictions** — turns Melo
   from a *post-show logger* into a *during-show companion*. This is
   the single biggest behavior-change feature.

5. **Festival lineup builder with conflict warnings** — captures the
   highest-LTV users (heavy festival-goers) at their highest-intent
   moment (festival weekend). Could become a viral standalone every
   festival weekend.

The thread connecting all five: **emotional moments around live music
that no other concert app respects.** Setlist.fm is data. Songkick is a
calendar. Bandsintown is alerts. Melo's lane is *the memory of being
there* — every feature should serve that.

---

## How to use this doc

- Pull from this list when planning the next version (v1.1, v1.2, v2.0)
- When you commit to a feature, **write its initiative file** in
  `docs/initiatives/YYYY-MM-DD-<slug>.md` (per the rules in `CLAUDE.md`)
- Update this roadmap as features ship (move from "planned" to
  "shipped") or evolve (move from "ideas" to "planned" with an
  initiative file)
- The README index in `docs/initiatives/README.md` stays as the
  newest-first running log of *active* initiatives. This roadmap is
  the strategic view above it.
