# Camera-roll backfill — turn a photo library into a back catalogue

- Started: 2026-07-30
- Status: shipped (dev)
- Last updated: 2026-07-30

## Context

Every metric in Melo depends on library size. The ranking needs something to
compare against, the stub drawer needs stubs, the receipt needs "3rd time
seeing them", anniversaries need a past. A user with 3 shows has a weak
product; one with 40 has a great one — so the onboarding job is getting from
1 to 40 fast.

Manual entry can't do it. Unlike films, people don't remember concert *dates*,
so "search and add your old shows" is structurally weak. But their camera roll
already contains every show they've been to — it's just unstructured.

## What was NOT possible

The original plan said "scan for photo clusters that are night-time,
venue-located and bursty". **That can't be built in JS here.** There is no
photo-library plugin installed at all — `PhotoPicker` uses a plain
`<input type="file">` — and nothing in Capacitor can *enumerate* the library
with EXIF/GPS. Background scanning needs a native plugin
(`@capacitor-community/media` or custom Swift), an iOS rebuild and App Store
review.

## What shipped instead

The user initiates; everything else is the same. Tap **Find shows in your
photos** → the native picker opens (iOS has Select All) → Melo reads each
photo's EXIF capture time on-device → clusters them into nights → proposes the
gig-shaped ones. One tap sends a night to the fast log sheet with the date
filled in and the photos attached.

- **`lib/exif.js`** — dependency-free byte-level EXIF reader. Only the first
  128KB of each file is read, so selecting 300 photos never pulls 1.5GB into
  memory. `DateTimeOriginal` first, falling back to `lastModified` flagged
  `exact: false` — a file's mtime is often the export date and can be years off,
  so the review step labels those "approx" rather than quietly proposing the
  wrong night.
- **`lib/photoClusters.js`** — groups photos into nights and scores how
  concert-shaped each is (evening hours 0.5, burst size 0.3, sensible duration
  0.2). Already-logged nights are dropped.
- **THE NIGHT-ROLLOVER RULE** is the load-bearing bit: anything before 5am
  belongs to the *previous* evening. A photo at 00:47 on the 15th is from the
  night of the 14th. Getting this wrong files half a backfilled library on the
  wrong date, silently.
- **`components/PhotoBackfill.jsx`** — intro → progress → review. Reads in
  batches of 8 with a yield between, so the progress bar keeps painting instead
  of looking hung.
- **`QuickLog`** accepts a `prefill` with `photoFiles` and uploads them
  **after** the save — attaching a dozen images before the row exists would turn
  a four-tap log into a thirty-second wait. The show appears instantly and its
  photos fill in behind it.
- Entry point on **You**, rendered above the nav row so it's reachable at zero
  shows — which is exactly who needs it most.

## Changes made

- 2026-07-30: Built and verified. 36 assertions in
  `lib/__tests__/photo-clusters.test.mjs`, including a **hand-built JPEG with a
  real EXIF APP1 segment** — asserting only that garbage doesn't throw would
  pass on a parser that never parses anything. Then drove the whole component
  in-browser with synthetic EXIF-bearing `File`s: 9 photos over 3 nights →
  correctly identified the Sept 14 gig (4 photos, 8:30 PM – 12:20 AM, spanning
  midnight), rejected a midday cluster, and excluded a night already in the
  library. The hand-off carried date `2025-09-14` and all 4 files.
- Fixed while verifying: the review copy conflated "already in your library"
  with "didn't look gig-shaped" into one number. They're different facts and are
  now reported separately.

## Open questions / follow-ups

- **GPS is usually stripped.** iOS often removes location when a photo passes
  through a file input unless the user granted full library access. The
  clustering therefore relies on TIME alone, which turns out to be a strong
  enough signal by itself; `lat`/`lon` are read when present but nothing
  currently uses them. Venue matching would need them.
- **HEIC.** iOS normally transcodes to JPEG through a file input, but not
  always. A HEIC that arrives untranscoded falls back to `lastModified` and is
  flagged "approx". A HEIC parser would fix it.
- **The native version is still worth building** — genuine background discovery
  ("we found 12 shows in your roll") is a much stronger first-run moment than
  asking the user to select. Needs a plugin + iOS build.
- The artist is still typed by hand. Reverse-geocoding the GPS to a venue, then
  Setlist.fm for who played there that night, would make a backfilled show
  nearly one tap — but depends on GPS surviving, which it mostly doesn't.
