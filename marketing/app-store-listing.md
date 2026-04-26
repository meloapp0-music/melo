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
Live shows. Wrapped yearly.
```
27 / 30

## Promotional text (max 170 chars, editable any time)

```
Track every concert you've been to, save the ones you're going to, and
get an annual Wrapped of the artists who scored your year.
```
166 / 170

## Description (max 4000 chars)

```
Melo is the beautifully simple way to track your live music life.

Log every show you've been to. Auto-fill setlists from Setlist.fm.
Save the artists you're dying to see live and let Melo tell you the
moment they announce a tour near you. At year-end, swipe through a
shareable Wrapped of your top artists, top venues, the highest-rated
night, and the song you heard live the most.

WHY YOU'LL LOVE IT

• Three statuses for every show — Attended, Going, Wishlist — so
  Melo doubles as your calendar AND your live-music journal.

• Auto-fill real setlists. Connect a free Setlist.fm API key and
  every past show populates with the actual songs played, in order.

• Tour alerts that actually work. Melo watches Ticketmaster every day
  for new dates from your wishlist artists and sends a push notification
  the moment something new lands — usually before social media catches
  it.

• Photos on every show. Drop in your phone shots and they become the
  background of that show in your Wrapped reel.

• A year-end Wrapped that's actually shareable. Eight slides covering
  total shows, top artist, top venue, highest-rated night, cities
  visited, your live-music personality, and more.

• Festivals, ranked. Melo scans Ticketmaster's festival listings and
  flags the ones with the most artists from your library.

• A songs view. Every song you've ever heard live, sorted by frequency.
  The number-one song is usually a surprise.

• A scoring system inspired by film criticism. Rate every show 1–10,
  optionally tag it with vibes (Euphoric, Intimate, Chaotic,
  Transcendent…), and Melo builds a ranked list you can compare any
  two shows from.

• First-run calendar import. New users with hundreds of past concerts
  in their iPhone Calendar can drain the entire backlog in one tap.

PRIVACY

Your data lives in your account. Your Setlist.fm API key is encrypted
at rest with a key Apple's reviewer can't read. Photos live in your
private Storage bucket. Nothing about your shows is shared anywhere
without your action.

WHAT YOU'LL NEED

• A free Setlist.fm account if you want auto-filled setlists (takes
  30 seconds; we walk you through it). Without it, manual entry still
  works perfectly.

• Notifications enabled for tour alerts. (You can turn them off later.)

• Calendar permission only if you use the optional first-run import.

POWERED BY

Melo respects the catalogs that make this all possible: setlist.fm,
Ticketmaster, MusicBrainz, Apple Music, and Deezer. Full attributions
inside the app under Settings → Legal & Attributions.
```
~ 2,750 / 4,000

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
• Calendar import to backfill past shows in one tap

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
Test account credentials:
  Email: review@melo.app
  Password: (provided in App Store Connect "App Review Information")

The Setlist.fm integration requires a per-user API key. The test
account already has one configured so reviewers can see the autofill
flow without setup. To exercise the "no key configured" UX, sign out
and create a new account — the empty-state guides you through it.

Push notifications are sent by a daily cron (the `tour-alerts` Edge
Function). The reviewer won't trigger one in normal testing; the
in-app permission prompt is the surface they'll see.

Calendar permission is requested only when the user explicitly opts
into the "Import past shows from Calendar" flow (Onboarding step 2,
or Settings → About → Import past shows from Calendar). Both surfaces
are skippable.
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

- [ ] Bundle ID `com.melo.app` registered in App Store Connect
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
