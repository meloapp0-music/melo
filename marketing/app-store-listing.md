# Melo — App Store Connect listing

Copy ready to paste into App Store Connect. Character limits enforced
where Apple's UI hard-caps. All text below is final — no `TODO`
placeholders. Only the screenshot images themselves still need to be
captured (see `screenshots/README.md`).

---

## App name (max 30 chars)

```
Melo: Concert Tracker
```
20 / 30

## Subtitle (max 30 chars)

```
Where concerts live forever.
```
28 / 30

## Promotional text (max 170 chars, editable any time)

```
Log every show. Save what's next. Unwrap your year of live music every December — your top artists, top venues, and the songs that scored your year.
```
148 / 170

## Description (max 4000 chars)

```
Where concerts live forever.

Melo is the beautifully simple way to track your live music life.
Log every show you've been to, auto-fill the real setlist, save the
artists you're dying to see, and at year-end swipe through a shareable
Wrapped of the artists who scored your year.

WHY YOU'LL LOVE IT

• Three statuses for every show — Attended, Going, Wishlist — so
  Melo doubles as your concert calendar AND your live-music journal.

• Auto-fill real setlists. Connect a free Setlist.fm API key and
  every past show populates with the actual songs played, in order.

• Tour alerts that actually work. Melo watches Ticketmaster every day
  for new dates from your wishlist artists and sends a push the moment
  something new lands — usually before social media catches it.

• Photos on every show. Drop in your phone shots and they become the
  background of that show in your Wrapped reel.

• A year-end Wrapped that's actually shareable. Eight slides covering
  total shows, top artist, top venue, highest-rated night, cities
  visited, your live-music personality, and the song you heard live
  the most.

• Festivals, ranked by you. Melo scans Ticketmaster's festival
  listings and flags the ones with the most artists from your library.

• A songs view. Every song you've ever heard live, grouped by show
  and sorted by frequency. The number-one song is usually a surprise.

• A scoring system inspired by film criticism. Rate every show 1–10,
  tag it with vibes (Euphoric, Intimate, Chaotic, Transcendent…), and
  Melo builds a ranked list of every concert you've ever been to.

• Tickets at your fingertips. One tap on any "Going" show jumps
  straight to that artist on Ticketmaster.

PRIVACY

Your data lives in your account. Your Setlist.fm API key is encrypted
at rest with a server-side key the app can't read. Photos live in
your private Storage bucket. Nothing about your shows is shared
anywhere without your action.

WHAT YOU'LL NEED

• A free Setlist.fm account if you want auto-filled setlists (takes
  30 seconds; we walk you through it). Without it, manual entry still
  works perfectly.

• Notifications enabled for tour alerts (you can turn them off later).

POWERED BY

Melo respects the catalogs that make this all possible: setlist.fm,
Ticketmaster, MusicBrainz, Apple Music, and Deezer. Full attributions
inside the app under Settings → Legal & Attributions.
```
~ 2,500 / 4,000

## Keywords (max 100 chars, comma-separated, no spaces)

```
concert,setlist,wrapped,festival,music,gig,tour,ticketmaster,setlistfm,journal,track,wishlist,live
```
99 / 100

## What's New in this version (v1.0)

```
Welcome to Melo. Log every concert, wishlist the ones you're chasing,
and get an annual Wrapped of the artists who scored your year.

This first release ships:
• Three-status logging (Attended / Going / Wishlist)
• Auto-filled setlists via your free Setlist.fm key
• Daily tour alerts for your wishlist artists
• Photos on every show
• Year-end Wrapped (eight swipe-through slides)
• Festivals near you, ranked by your library
• One-tap Tickets links via Ticketmaster

Tap Settings → Legal & Attributions to read the credits.
```

## Categories

- **Primary**: Music
- **Secondary**: Lifestyle

## Age rating

- **4+** (no objectionable content; user-generated text fields exist
  but no chat / messaging / unmoderated UGC distribution).

## Support / Marketing / Privacy URLs

- **Support URL**: `https://melo.app/support` (route on the marketing
  site — points to `mailto:hello@melo.app` until a help center exists)
- **Marketing URL**: `https://melo.app/`
- **Privacy Policy URL**: `https://melo.app/privacy.html`

## Required reviewer notes

```
Melo is a personal concert tracker. Test credentials are provided in
the App Review Information section above — the demo account has sample
shows already logged.

GETTING STARTED:
1. Sign in with the demo account.
2. Home tab shows logged shows + a Wrapped year-end summary CTA.
3. Tap any "Going" or "Attended" show card to see details, setlists,
   photos, and Tickets links.
4. Tap "Your 2026 Wrapped" on Home for the year-end story.
5. Festivals tab discovers festivals featuring artists you've logged.
6. Profile tab → Songs view shows all setlists by artist.

OPTIONAL FEATURES:
- Setlist.fm auto-fill (Settings → Setlist.fm key): a free API key
  from setlist.fm/api auto-populates real setlist data. Skipping this
  still lets users log shows manually.
- Push notifications (Settings → Tour Alerts): a server-side daily
  cron alerts users when wishlisted artists announce nearby shows.

THIRD-PARTY APIs USED:
- Setlist data: setlist.fm public API
- Artist images: Deezer public API
- Concert/festival search: Ticketmaster Discovery API
- Authentication + storage: Supabase (email/password auth, RLS-protected
  database, encrypted-at-rest user keys)

NO PAID FEATURES:
v1.0 has no in-app purchases, no subscriptions, no paid tiers. All
features visible in the screenshots are accessible to all users.
```

## Pricing

- **Free** at launch. No IAP, no subscriptions in v1.

## Availability

- All territories where the App Store sells apps.

## Encryption export compliance

- Uses standard system-provided HTTPS (TLS) only. The Setlist.fm key
  is encrypted at rest server-side; no proprietary cryptography.
- **ITSAppUsesNonExemptEncryption = NO** (paste this into Info.plist if
  not already present, to skip the per-build self-classification
  questionnaire).

## Submission checklist

- [ ] Bundle ID `com.aidanwise.melo` registered in App Store Connect
- [ ] APNs Auth Key (.p8) uploaded to App Store Connect → Keys
- [ ] All 5 screenshots × 2 sizes uploaded (see `screenshots/README.md`)
- [ ] App Privacy details filled in (Data Used to Track You: None.
      Data Linked to You: Account, User Content. Data Not Linked: usage
      diagnostics if you wire any in.)
- [ ] Sign-in info filled in (test account credentials)
- [ ] Marketing site live at `https://melo.app/`
- [ ] Privacy and Terms pages live at the URLs above
- [ ] App Store badge link in marketing site updated to the live App
      Store URL once approved
