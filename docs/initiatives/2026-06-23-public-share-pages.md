---
name: public-share-pages
description: Public web pages for shared shows/profiles (e.g. melo.show/@handle, melo.show/show/:id) so share-card QR codes and links open to real content for people WITHOUT the app — Open Graph previews + an install CTA. Turns the share loop into reach + SEO. RLS-safe read surface only. Planned for 1.4.
type: project
---

# Public Share Pages (deep-link landing)

- Started: 2026-06-23
- Status: in-progress (building Phase 0 + 1, 2026-07-15)
- Last updated: 2026-07-15

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
- 2026-07-16: **⚠️ ARCHITECTURE CORRECTION — melo.show is NOT a Pages project.**
  Everything above assumed Cloudflare Pages + the `functions/` convention. It's
  wrong. Verified on Aidan's account: `wrangler pages project list` returns
  **nothing**, the dashboard serves the site from
  `/workers/services/view/odd-water-9335/`, and it reports *"Variables cannot be
  added to a Worker that only has static assets."* melo.show is a **Worker with
  static assets** — Cloudflare's newer model, where `functions/` means nothing.
  The page logic was fine; the wrapper was wrong.
  - `marketing/functions/**` → **`marketing/routes/{show,tonight}.js`**, converted
    from Pages' `onRequestGet(context)` to plain `handleShow(request, env, token)`
    / `handleTonight(request, env)`.
  - **`marketing/worker.js`** (new) — the entry. Routes `/tonight` and
    `/s/<token>`; everything else falls through to `env.ASSETS`. Static assets win
    by default, so `/`, `/privacy.html` etc. never reach the Worker.
  - **`marketing/wrangler.jsonc`** (new) — `name: odd-water-9335` (must match the
    EXISTING Worker or a deploy creates a second one melo.show doesn't point at),
    `compatibility_date` pinned to the 2026-06-25 the Worker already runs.
  - **Static site moved to `marketing/site/`** — and this is load-bearing twice
    over:
    1. **Privacy.** `assets.directory: "."` would have published everything else
       in marketing/ — the marketing OS, the content calendars,
       `social-calendar-2026-05.xlsx`, App Store screenshots. Verified they are
       currently 404 on melo.show; this keeps them that way by construction
       rather than by an ignore-file.
    2. **It broke `wrangler dev`.** With `.`, wrangler watched its own config,
       worker.js, `.dev.vars` and the `.wrangler/` cache it writes → an endless
       "Reloading local server…" loop that dropped in-flight requests. `/tonight`
       hung forever and never even logged. Moving the assets to `./site` → zero
       reloads.
  - **Honest failure state (real bug found while verifying).** Ticketmaster 429'd
    (daily quota, burned by testing) and `/tonight` rendered *"Nothing listed
    tonight — quiet one"* — on a night with 9 real Chicago shows. A lookup failure
    must never be indistinguishable from a quiet night on a card built for
    POSTING. Now renders "Couldn't load tonight's shows" and returns `no-store`
    so a 429 can't be cached past the thing that caused it.
  - **Verified locally** (`cd marketing && npx wrangler dev`): `/` 200 (asset),
    `/privacy.html` 307 (Cloudflare trailing-slash), `/tonight` 200,
    `/s/abc` **404 via a REAL Supabase round-trip** (unknown token — the RPC and
    the security model work end-to-end), internal docs 404. Zero reload loops.
  - **DEPLOY (corrected, again):** `cd marketing && npx wrangler deploy`.
    NOT `wrangler pages deploy` — there is no Pages project. Env vars go on the
    Worker (Settings → Variables), and they can only be added once the Worker has
    code, i.e. AFTER the first deploy.

- 2026-07-16: **Phase 2 built (dev) — the video cap, done properly.**
  - **CORRECTION to the research:** the claim that "45MB is the Free tier's 50MB
    ceiling showing through" was an INFERENCE and it was **wrong** — Aidan is on
    **Supabase Pro**, where the global ceiling is 500GB. 45MB was just a conservative
    number in 0014, and the "$25/mo decision" was moot the whole time. (Verified against
    Supabase's file-limits docs: Free 50MB / Pro 500GB.) Pro also means egress was
    already 250GB, not the fatal 5GB — so the public page was on safer ground than
    framed. Lesson: the lane reasoned backwards from a suspicious number + an old note
    mentioning the free tier, and never checked the actual plan.
  - **Migration 0017** — `show-videos` bucket `file_size_limit` 45MB → **200MB**. Chosen
    because it covers a full 60s at iPhone's default 4K30 (~170MB) and 1080p60 (~90MB),
    which makes `VIDEO_MAX_SECONDS = 60` honest for the first time. Only a full minute of
    4K60 (~400MB/min) is excluded, and it's rejected by name. ⚠️ Needs the project's
    **Global file size limit** (Storage → Settings) raised too — per-bucket can never
    exceed global, and shipping only the migration silently does nothing.
  - **Resumable (TUS) uploads** — `tus-js-client@^4.3.1`; supabase-js has no TUS. Endpoint
    is the DIRECT storage host (`<ref>.storage.supabase.co/storage/v1/upload/resumable`,
    derived from `VITE_SUPABASE_URL`), chunk size **exactly 6MB** (Supabase: "do not
    change it"), retryDelays `[0,3s,5s,10s,20s]`, `removeFingerprintOnSuccess` (else
    re-picking a deleted clip is treated as already-uploaded), and
    `findPreviousUploads`/`resumeFromPreviousUpload` so a venue-LTE blip resumes instead
    of restarting. Mandatory, not polish: a plain `.upload()` of 200MB is a multi-minute
    silent hang — raising the cap alone would have traded an honest "too big" error for a
    mystery freeze at a show.
  - **`cacheControl: '31536000'` preserved** into the TUS metadata and now COMMENTED as
    load-bearing: it bills egress at Supabase's cached ~$0.03/GB instead of the default
    3600s → uncached ~$0.09/GB. 3x on every byte a public share page serves.
  - **Per-file progress** in VideoPicker (percentage + ember fill bar, one tile per
    in-flight upload) — a bare spinner on a multi-minute upload reads as a frozen app.
    Hint copy returns to `60s each` now that duration is genuinely the binding limit.
  - Server-side rejection (bucket limit / 413) is surfaced with its real reason instead
    of a bare "failed".
  - **Verified**: endpoint derivation resolves to `aptwdtteplznxmtxnopx.storage.supabase.co`
    (incl. trailing-slash + localhost fallback); progress tiles render against the real
    App.css. Build clean. **NOT yet exercised against a real 200MB upload** — that needs
    the global limit raised + a device.
- 2026-07-15: **Phase 0 + 1 built (dev).**
  - **Migration 0016** — `shows.share_token` (nullable, opt-in, unique partial index) +
    `get_public_show(token)`, a SECURITY DEFINER RPC with a pinned `search_path` and a
    hand-picked column list (never `user_id`/`notes`/`buddies`). Strictly additive: NO new
    RLS policy on `shows`; `anon` still cannot read the table. No token ⇒ no row.
  - **`lib/db/shows.js`** — `ensureShareToken` (idempotent, so re-sharing keeps the URL and
    links already in the wild never break; token from `crypto.getRandomValues`, 36^22 ≈
    2^113) + `revokeShareToken`. `shareToken` added to `fromRow`.
  - **`marketing/functions/s/[token].js`** (new) — the Cloudflare Pages Function. Server-
    rendered so link previews work (a scraper won't run JS). Hero/owner/vibes/videos/
    setlist/photos + install CTA, in the house palette. **Videos are `preload="none"` +
    poster + tap-to-play** — zero video egress until a human presses play, so bots and
    link-preview scrapers cost $0 (Aidan's decision; ~$600 vs ~$9,000 at 500k viewers).
    `og:video` on ONE `.mp4` → **iMessage autoplays it in the link bubble**, which is the
    "video playing on the share card" outcome without any encoding.
  - **`lib/shareLinks.js`** (new) — `PUBLIC_SHARE_ORIGIN` + `publicShowUrl(token)`.
  - **QR retargeted** — `renderStyledCard(show, { shareUrl })` points the QR at the show
    page instead of the App Store, and the caption becomes "Scan to see this show".
    Baked into the pixels, so it survives Instagram/screenshots/a photo of a screen —
    unlike a link in the share payload. Falls back to the install URL when unshared.
  - **Share payload** — `shareBlob(blob, name, title, url)` now tries `navigator.share`
    WITH the url (canShare-gated) and degrades to file-only. `ShareCardView` mints the
    token before rendering (best-effort — a failure still shares with the install QR).
  - **"Stop sharing"** on ShowDetail, shown only once shared. Copy is deliberately
    "removes the page", never "deletes" — see the follow-up below.
  - **Phase 0 honesty fix** — `VIDEO_MAX_SECONDS = 60` was unreachable at every iPhone
    setting except 720p30, so VideoPicker promised "60s max each" that the byte cap always
    refused first. Hint now states the binding limit (`45MB each (~15s at 4K, ~40s at
    1080p)`) and the error names the actual fix ("record in 1080p instead of 4K") instead
    of the useless "trim it shorter".
  - **Verified**: 16/16 hostile-input tests pass — `<script>`/`onerror` payloads in
    artist/setlist/owner escaped; `javascript:`, `data:` and `http:` media URLs rejected
    (https-only); `og:video` picks the `.mp4` and ignores the `.mov`; `preload="none"`
    present and **zero `autoplay`** anywhere. Rendered live: hero/CTA on-brand; a dead
    photo removes itself (gradient shows through) and if ALL photos 404 the whole Photos
    section removes itself rather than leaving an orphan heading. Build clean.
- 2026-06-23: Initiative created (idea capture; deferred — pairs with the marketing site).
- 2026-06-27: **User prioritized this for the next version.** Concrete framing: a share
  card posted to social should link to the show, and whoever taps it can "look through it
  and see the whole setlist, see the pics, etc." — i.e. the `melo.show/show/:id` page must
  render the full setlist + photos (+ **videos** once [[video-uploads]] lands) for a
  viewer WITHOUT the app, plus a "Get Melo" CTA. Now that the share-card export is solid
  (`2026-06-25-share-cards-native-canvas.md`), repointing the card's QR/link from the bare
  App Store URL to this page is the highest-leverage growth move.
  - **Key decision (security spine):** shows are private by default. A public page needs an
    *opt-in* shareable mechanism — a per-show `share_token` (unguessable) or `is_public`
    flag — read via a curated `SECURITY DEFINER` RPC / public view that exposes ONLY
    explicitly-shared rows. Do NOT add a blanket public-read RLS policy.

## Settled plan (2026-07-15) — from a 4-lane research workflow + Aidan's decisions

Prompted by Aidan: *"when i share a show, there should be a way for other people to click
on the share card that brings you to the show they logged. and then the videos they add
should be playing somewhere on the share card... also the videos can't be 45mb max."*

### The hard wall (and the way around it)
A share card is a **PNG** (`canvas.toBlob(…'image/png')`, shareCard.js:178). A PNG cannot
be clicked, cannot play video, cannot be interactive — no work changes that. The thing
that *can* is **the link travelling alongside it**. So: the card stays the hook; the
**public show page is the product**. Best find of the research: `og:video` on that page
makes **iMessage autoplay the clip inside the link-preview bubble** (muted, looping) —
which is closer to "videos playing on the share card" than a PNG could ever be, with
**zero** video encoding.

### Key facts (verified)
- **The 45MB cap is the Supabase FREE tier showing through** — Free has a hard **50MB
  per-file ceiling that cannot be raised**; `file_size_limit = 47185920` (0014) is a
  free-tier-shaped number. Any increase starts with Pro ($25/mo).
- **Aidan's complaint is understated**: iPhone 4K30 HEVC ≈ 170MB/min → 45MB buys **~16s**,
  not 30. 4K60 (400MB/min) buys **~7s**. Only 1080p30 (65MB/min) fits 30s.
- **LIVE BUG**: `VIDEO_MAX_SECONDS = 60` (storage.js:91) is unreachable at every iPhone
  setting except 720p30 — the byte cap always fires first — while VideoPicker.jsx:131
  promises "60s max each". The app promises a minute it can never deliver.
- **Cost**: the cap is NOT the danger (200MB × 5k viewers ≈ $30/mo). **Autoplay × 3 clips
  is** (~$9,000/mo vs ~$600 at 500k viewers) — autoplay bills you for every bot and
  link-preview scraper that touches the URL. Egress must scale with *intent*, not pageviews.
- **`cacheControl: '31536000'` (storage.js:120) is load-bearing** — it puts egress on the
  cached $0.03/GB rate instead of Supabase's 3600s default → uncached $0.09/GB. 3x on every
  egress dollar. Do not "tidy" it away.
- Manual dashboard drag-drop deploy **cannot compile a `/functions` folder** — silently. The
  page cannot exist without changing the deploy verb to `cd marketing && npx wrangler pages deploy .`.

### Decisions (Aidan, 2026-07-15)
1. **Supabase Pro ($25/mo) — yes.** Unavoidable for any cap increase; also lifts egress
   from a fatal 5GB → 250GB, which Phase 1's public page needs on its own merits.
2. **Tap-to-play + poster frame** (not autoplay). The $600-vs-$9,000 call. Zero video
   egress until someone actually taps.
3. **Scope now = Phase 0 + 1** (the public show page). Cap raise (Phase 2) is next.

### Phasing
- **Phase 0** (½ day): repoint the card QR from the App Store → `melo.show/s/<token>`;
  make the video limits honest.
- **Phase 1** (3–5 days): migration 0016 (`share_token` + `get_public_show` SECURITY
  DEFINER RPC); `marketing/functions/s/[token].js` Pages Function w/ server-rendered OG
  tags; videos with **poster + `preload="none"` + tap-to-play**; `og:video` on ONE clip;
  og:image from the existing PNG; file+url in the share sheet via `@capacitor/share`;
  "Stop sharing" that nulls the token.
- **Phase 2** (½ day): raise cap → 200MB/60s. **Requires TUS/resumable upload**
  (`tus-js-client`, exactly 6MB chunks) — at 200MB on venue LTE a plain `.upload()` is a
  2–4 min silent hang. Raising the cap without TUS turns an honest error into a mystery.
- **Phase 3** (2–4 days, only if upload UX hurts): client-side transcode via
  **mediabunny + WebCodecs** (VideoEncoder has shipped in iOS WebKit since 16.4).
  Compression is NOT financially required — storage at 10k users ≈ $55/mo. Do it for
  upload time, not cost. **Gated on an unproven fact**: WebCodecs-in-WKWebView is
  undocumented — spike `VideoEncoder.isConfigSupported()` on-device first.
- **Phase 4** (2–4 days, only if Phase 1 shows people share): the silent "replay" MP4.
  Reuses shareCard.js's Canvas draw code frame-by-frame (deterministic Canvas 2D — the
  reason html2canvas was dropped — is exactly what makes this tractable). IG Stories caps
  video at **20s**, so design 12–15s. It is no more clickable than the PNG: a hook, not
  a product. Prove sharing first.

## Open questions / follow-ups
- Privacy: default profiles/shows to private; expose only what the user opts to share.
- **"Stop sharing" over-promise risk (Aidan's call, don't let copy lie):** nulling the
  token kills the *page*, but `photos[]`/`videos[]` are **public-bucket URLs** — those
  objects stay world-readable forever to anyone who saved the URL. Real revocation means a
  signed-URL redesign (bigger than this whole page; and signed URLs don't throttle egress —
  a cached response keeps serving after the token dies). Ship it, but word the UI
  "removes the page", never "deletes".
- **Range-request check gates og:video** — iMessage needs HTTP 206 to play in-bubble.
  Verify with a real uploaded video before trusting og:video.
- Revisit trigger for **Mux**: a single page clearing ~50k views, OR deciding autoplay is
  the product. Mux gives free transcode on ingest, duration-based billing (the 4K problem
  disappears), and ABR (autoplay starts at ~300kbps instead of pulling the raw file).
  100k free delivery-minutes/mo. Do NOT put a third-party CDN in front of Supabase (ToS
  violation + redundant).
