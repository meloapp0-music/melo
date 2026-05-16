# Data Export

- Started: 2026-05-13
- Status: planned (bundling into v1.0.5, ~2-3 hours)
- Last updated: 2026-05-13

## Context

A jam-band Reddit commenter on the launch post (ParadoxPath, 2026-05-13)
raised a legitimate objection: concert tracker apps have a history of
dying and stranding users' show histories. They explicitly said they
"would never trust [their] concert history to any of them."

This isn't going away. Sophisticated users — exactly the audience
most likely to log lots of shows + become power users — will keep
asking it. The right answer isn't "trust us." The right answer is
"your data is portable; here's the export button."

Pairs naturally with the existing "right to deletion" we shipped in
`2026-04-20-make-it-legal.md` (account deletion via Edge Function).
Both build a "your data is yours" trust signal that the sheet-tracker
crowd respects.

## Plan

Smallest possible shape that actually answers the objection:

1. **Settings → "Export my data" button**
2. Tap → generates a CSV file containing all the user's shows with
   every field (artist, date, venue, city, score, vibes, notes,
   setlist, buddies, festival, status, photos as URLs, created_at)
3. Triggers a native iOS share sheet → user can save to Files,
   email to themselves, AirDrop to Mac, save to iCloud Drive, etc.
4. Optional: JSON export as a second button for the technically
   inclined (preserves nested structure for setlist/vibes arrays)

CSV is the universal format. Anyone using sheets / Notion / Airtable
imports it instantly. JSON is for users who want to re-import to
another app or do their own analysis.

### Implementation

- **`src/web/lib/exportShows.js`** — new helper that takes the user's
  shows array, formats as CSV (escape commas/quotes properly, use
  `papaparse` or hand-roll it — ~50 lines), returns a Blob.
- **`Settings.jsx`** — new card "Your Data" with two buttons:
  "Export as CSV" + "Export as JSON". Tap fires a download via
  `URL.createObjectURL(blob)` + Capacitor's Share plugin for the
  native share sheet on iOS.
- **No backend work needed.** Shows are already loaded in
  `useApp()` context. Pure client-side export.

### What's included per row

```csv
artist,date,venue,city,score,status,vibes,festival,notes,setlist,buddies,is_favorite,created_at,photo_urls
"Goose","2024-08-04","Red Rocks Amphitheatre","Morrison",10,"attended","Euphoric|Transcendent","","best night ever","Hungersite|Borne|Hot Tea","Sarah|Mike",true,"2024-08-05T03:12:00Z","https://...,https://..."
```

Pipe-delimited arrays inside cells = readable in sheets without
breaking on commas in artist/venue names.

### Where it lives in the app

Settings → new "Your Data" card just above the "Sign Out" / "Delete
Account" section. Mirrors the existing account-level controls.

Copy:
```
Your Data

You own your show history. Export it any time.

[ Export as CSV ]
[ Export as JSON ]
```

## Changes made

- 2026-05-15: Implemented for v1.0.5.
  - New `src/web/lib/exportShows.js` — `showsToCsv` (RFC-4180 quoting,
    pipe-joined array cells), `showsToJson` (camelCase app shape),
    and `deliverFile` — Web Share API with a `File` on iOS 15+
    (native share sheet), anchor-download fallback elsewhere.
  - `Settings.jsx` — new "Your Data" card above Account with
    "Export as CSV" / "Export as JSON" buttons + a `handleExport`
    handler. Disabled when the user has zero shows.
  - Fires a `data_exported` analytics event (format + show_count).
  - `npm run build` passes. No backend work — pure client-side.
  - CSV columns: artist, date, venue, city, score, status, vibes,
    genre, festival, notes, setlist, buddies, is_favorite,
    created_at, photo_urls.

## Open questions / follow-ups

- **Photos.** Should the CSV include the photo URLs (Supabase Storage
  signed URLs) or actually bundle the files in a zip? URLs is the
  trivial path. Zip would require server-side processing — skip for
  v1.0.5, revisit if users request it.
- **Re-import.** If someone exports + reimports into another app,
  does that other app understand Melo's vibe taxonomy? Probably not.
  Document the export format on the Privacy page so future apps can
  parse it.
- **Privacy Policy + Terms update.** Mention export capability
  explicitly under "Your rights." Tiny update to `marketing/privacy.html`.
- **Marketing tie-in.** Add a line on the App Store description /
  melo.show landing page: "Your data is yours. Export to CSV any
  time, no questions asked." Directly addresses the
  sheet-tracker holdout audience.
- **Cross-link with `2026-04-20-make-it-legal.md`** — both this and
  account deletion live in the same Settings region. Treat them as
  a "Your Data" group.
