# Marketing screenshots

App Store Connect requires submission screenshots in two specific
sizes (as of April 2026):

- **6.9-inch display** (iPhone 16 Pro Max): **1320 × 2868** px portrait
- **5.5-inch display** (iPhone 8 Plus): **1242 × 2208** px portrait

Apple auto-derives all other display sizes from the 6.9" set, so the
5.5" set is the only "extra" upload you have to do. Submit the same
five screens at both sizes.

## The five screens

The marketing site (`marketing/index.html`) and the App Store listing
(`marketing/app-store-listing.md`) both reference these filenames in
order. Replace the placeholder PNGs in this folder with the captured
images, keeping the filenames stable.

| # | File                  | Screen                       | Caption (App Store overlay)                    |
|---|-----------------------|------------------------------|------------------------------------------------|
| 1 | `01-home.png`         | `pages/Home.jsx`             | "Your live music life, on one screen"          |
| 2 | `02-wrapped.png`      | `pages/Wrapped.jsx` (slide 2)| "Your year, wrapped"                           |
| 3 | `03-festivals.png`    | `pages/Festivals.jsx`        | "Festivals, with your artists flagged"         |
| 4 | `04-show-detail.png`  | `components/ShowDetail.jsx`  | "Setlists, photos, and the people you went with" |
| 5 | `05-songs.png`        | `pages/Songs.jsx`            | "Every song you've heard live"                 |

For the marketing site we use the **6.9"** files (CSS scales them
down responsively). The site looks for them at
`marketing/screenshots/0X-*.png`.

## Capture workflow

1. **Boot the simulator** that matches the size you need:
   ```
   xcrun simctl boot "iPhone 16 Pro Max"   # 6.9"
   xcrun simctl boot "iPhone 8 Plus"        # 5.5"
   ```
2. **Build and run the iOS app** to that simulator from Xcode (open
   `ios/App.xcworkspace`).
3. **Seed sample data**. The screenshots look hollow with one or two
   shows — log in as a test account and use the calendar import or
   QuickLog to add ~12 shows across 4–5 artists / 3 cities. (Aim for
   the same set in both simulators so the screenshots are consistent.)
4. **Navigate to each screen**, then capture with `Cmd-S` in the
   simulator (saves to Desktop). Crop is unnecessary — the simulator
   captures at the exact App Store-required pixel size.
5. **Optional caption overlays**. App Store Connect lets you add a
   short caption above each screenshot in the listing UI; keep them to
   the punch lines in the table above. If you'd rather burn captions
   directly into the image, the Figma file at
   `https://www.figma.com/file/melo-store-overlays` has a template.
6. **Drop the PNGs** into this folder, replacing the placeholders.

## Verification checklist before upload

- [ ] All five files present in both `1320×2868` (6.9") and
      `1242×2208` (5.5") variants. Apple rejects mismatched aspect.
- [ ] No PII in screenshots — username should be a generic test
      handle, no real names in buddies/notes.
- [ ] Status bar shows full battery + a clean signal (simulator does
      this by default).
- [ ] Time in status bar shows 9:41 (Apple's tradition + simulator
      default).
- [ ] No dev-server URLs visible.
- [ ] Wrapped slide isn't mid-animation (let it settle).
