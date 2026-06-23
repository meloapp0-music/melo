---
name: public-share-pages
description: Public web pages for shared shows/profiles (e.g. melo.show/@handle, melo.show/show/:id) so share-card QR codes and links open to real content for people WITHOUT the app — Open Graph previews + an install CTA. Turns the share loop into reach + SEO. RLS-safe read surface only. Planned for 1.4.
type: project
---

# Public Share Pages (deep-link landing)

- Started: 2026-06-23
- Status: planned
- Last updated: 2026-06-23

## Context
The share cards are the #1 free growth engine, but their QR currently points at the bare
App Store URL and a shared link has nowhere good to land for someone without Melo. Public
web pages for a show/profile (with an OG image + "Get Melo" CTA) make every share
clickable, previewable in iMessage/IG, and indexable — converting the share loop into
real reach + SEO. Also the natural home for the share-card QR deep-link, which the
[[Share Card Redesign]] flagged as pending.

## Plan
- **Routes** on the marketing site / a lightweight SSR surface: `melo.show/@:handle`
  (public profile — top shows + stats, public data only) and `melo.show/show/:id` (a
  single show, only if the owner marked it shareable).
- **Data**: read via a **public, RLS-safe** path — a `SECURITY DEFINER` RPC or a curated
  public view exposing only explicitly-shareable rows. **Do not** weaken table RLS; add a
  curated read surface instead. (Security spine: the anon key is safe only because of RLS.)
- **OG tags + dynamic OG image** (reuse the share-card renderer) for rich link previews.
- **Universal links**: tapping a page on a device with Melo opens the app to that
  show/profile; otherwise the App Store.
- Point the share-card QR here instead of the bare App Store URL.

## Changes made
- 2026-06-23: Initiative created (idea capture; deferred — pairs with the marketing site).

## Open questions / follow-ups
- Privacy: default profiles/shows to private; expose only what the user opts to share.
- Hosting for SSR (Cloudflare Pages/Workers alongside the existing marketing site).
