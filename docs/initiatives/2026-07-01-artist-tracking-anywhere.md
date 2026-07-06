---
name: artist-tracking-anywhere
description: Fix the coverage hole — search + alerts are Ticketmaster-only, so small-venue shows (Congress @ Schubas Tavern) are invisible. Goal — look up ANY band's shows anywhere, and genre+city watch alerts ("notify me of any indie show announced in Chicago").
type: project
---

# Artist Tracking, Anywhere (small-venue coverage + genre×city alerts)

- Started: 2026-07-01
- Status: in-progress (research phase)
- Last updated: 2026-07-01

## Context
The user's exact case: **the band Congress is playing Schubas Tavern in Chicago next
week** — but Melo can't find it in artist search and would never notify about it.
Root cause: every upcoming-show surface (LogShow Going search, wishlist watching,
`tour-alerts` cron, Discover) sources from **Ticketmaster Discovery only**, and small
independent rooms (Schubas, Lincoln Hall, Empty Bottle, Hideout…) don't sell through
Ticketmaster. Two asks:

1. **Search any band → see ALL upcoming shows**, including tiny venues/bars.
2. **Genre×city watch**: pick genres + a city (Chicago) in settings → get notified when
   ANY artist in those genres announces ANY show there — not just artists already
   loved/wishlisted. Current tour-alerts watch set = loved (score≥7) + going + wishlist
   artists; the user calls this "too loose" for discovery.

User floated Instagram/artist-website scraping — feasibility to be answered honestly
by research (expectation: not viable for a solo app; ToS + anti-bot).

## Research (running)
Workflow `live-show-data-coverage` (2026-07-01): 5-angle sweep (JamBase, SeatGeek,
Bandsintown/Songkick gate-reality, ticketing long-tail incl. eTix/TicketWeb/Dice/Do312,
competitor sourcing methods) → adversarial verify (can an indie dev really get a key
TODAY; does it really list Schubas-tier Chicago shows) → synthesized stack. Findings to
be appended here.

## Plan (pending research)
- Aggregation layer `fetchUpcomingEventsMulti(artist|city, opts)` merging TM + the
  verified-accessible sources; dedupe by artist+date+venue. Used by: LogShow Going
  search, wishlist watch, Discover, and the cron.
- Settings: genre×city watch config (reuse music-taste genres + home city).
- `tour-alerts` (or a sibling cron) extended to the genre×city watch across sources.
- Keys live server-side (Edge Function proxy) if any source requires a secret — same
  pattern as setlistfm-proxy. Never in the client bundle.

## Open questions / follow-ups
- Which sources are actually obtainable + cover Schubas-tier venues (research).
- Rate limits vs. a nightly cron over all watched genres×cities.
- Dedupe/canonicalization of artist names across sources.

## Findings (research workflow, verified 2026-07-02)
The 5-angle sweep + adversarial verify ran; the final synthesis agent hit the account's
monthly API spend limit, so the recommendation below is hand-synthesized from the two
FULLY-VERIFIED sources (JamBase, SeatGeek) + sweep context.

- **JamBase Concert Data API — THE coverage winner (verified live).** Now fully
  self-service at data.jambase.com (14-day free trial, 1,000 requests, no credit card;
  then a free Developer tier). Live-checked Chicago small venues: **Schubas 26 upcoming,
  Lincoln Hall 40, Empty Bottle 60+, Beat Kitchen 64** — i.e. it genuinely lists
  Congress-@-Schubas-tier shows. Query surface fits Melo exactly: `artistName/artistId`,
  `genreSlug`, `geoMetroId/geoCityId`, `eventDatePreset`, and `dateModifiedFrom` delta
  sync (perfect for a nightly "new shows" cron). Bearer-token auth; also an MCP server.
  **THE CATCH = licensing/cost:** free Developer tier is **NON-COMMERCIAL only** +
  attribution; commercial use starts at **Startup $500/mo** (20k calls). Gap: DIY/
  self-ticketed rooms undercovered — **The Hideout showed 4 shows vs ~100 on its own
  calendar** (self-books outside ticketing feeds). Slug gotcha: use venue IDs, not name
  slugs (jambase.com/venue/the-hideout is a different venue in NY).
- **SeatGeek Platform API — secondary (verified).** Accessible today (register at
  seatgeek.com/account/develop or the new developer.seatgeek.com portal). Covers
  Schubas/Lincoln Hall-tier with real 2026 event pages, but **sparse at Empty Bottle
  (~10-20%, skews to resale demand) and near-useless at Hideout.** Cheaper/easier to
  access than JamBase's paid tier; resale-oriented.
- **Bandsintown / Songkick** (best artist-tour data incl. tiny venues) remain
  partner-gated / closed to new keys — not obtainable for a solo app.
- **Instagram / artist-website scraping = NOT viable** for a solo app (ToS + anti-bot);
  do not build on it.

## Recommendation (the stack)
1. Keep **Ticketmaster** (big rooms, already integrated, free).
2. Add **JamBase** for the small-venue long tail — it's the only verified source that
   actually lists Schubas/Empty Bottle/Beat Kitchen. Build + validate on the free
   Developer tier (non-commercial → beta/personal only); the **$500/mo commercial tier
   is the real go-live gate** — worth it once coverage proves a retention driver, premature
   at ~50 users.
3. **SeatGeek** as the cheaper fallback if $500/mo is a blocker (covers mid-size rooms,
   not the smallest).
4. Honest limit: **DIY/self-ticketed rooms (Hideout-tier) stay uncovered by everything.**

## Changes made
- 2026-07-01: Initiative created; research workflow launched. No code yet.
- 2026-07-02: Research completed + verified (JamBase, SeatGeek). Findings + recommended
  stack captured above. Synthesis hand-done (workflow synth agent hit account spend cap).
- 2026-07-03: **Prototyped the JamBase SEARCH integration (secure, off-by-default).**
  New `supabase/functions/jambase-proxy/index.ts` (mirrors setlistfm-proxy: requires a
  valid Supabase session, reads a server-side `JAMBASE_KEY` secret, proxies GET to
  `api.data.jambase.com/v3` — key never in the bundle). `api.js`: `fetchJamBaseEvents`
  (maps JamBase JSON-LD events → Melo's event shape; gated on `VITE_JAMBASE_ENABLED`) +
  `fetchUpcomingEventsMulti` (merges Ticketmaster + JamBase, dedupes by artist|date|venue).
  `LogShow.jsx` artist search now calls `fetchUpcomingEventsMulti` → so a search for
  "Congress" will surface Schubas once enabled. `.env.example` documents the 2-step setup.
  Compiles clean, boots with no errors; **fully no-op until enabled** (gated + no key).
  **Can't test end-to-end from here** — needs the user to sign up at data.jambase.com,
  `supabase secrets set JAMBASE_KEY=…`, `supabase functions deploy jambase-proxy`, flip
  `VITE_JAMBASE_ENABLED=true`. Two follow-ups: (1) verify the JamBase list-response wrapper
  (mapper handles likely shapes but a real response may need a 1-line tweak); (2) the
  genre×Chicago ALERT path (wire JamBase into the `tour-alerts` cron) is phase 2, not built.
- 2026-07-04: **JamBase went LIVE.** User signed up (data.jambase.com) + set the
  `JAMBASE_KEY` Supabase secret. Deployed `jambase-proxy` (`supabase functions deploy
  jambase-proxy --no-verify-jwt`) and set `VITE_JAMBASE_ENABLED=true` in `.env.local`.
  Smoke test (curl with anon key → `{"error":"invalid session"}`) confirms: proxy live,
  key secret readable (got past the 501 no-key guard), auth gate rejects non-user calls.
  App compiles clean with the flag on. **Final end-to-end test is the user's** (needs a
  logged-in session I can't create): Log a Show → Going/Wishlist tab → type "Congress" →
  a Schubas Tavern show should appear in the dropdown. If it doesn't, the likely fix is
  the JamBase list-response wrapper (1-line mapper tweak in `fetchJamBaseEvents`).
- 2026-07-04: **VERIFIED WORKING end-to-end.** User searched "Congress" → a **Lincoln
  Hall** (small indie Chicago venue, TM-invisible) show on Jul 12 appeared. Proves the
  full chain: key → proxy → JamBase → mapper. The response wrapper mapper parsed real
  JamBase data correctly on the first try — **no fix needed.** (User expected Schubas;
  the real show is at Lincoln Hall — a data/memory detail, not an integration issue.)
  SEARCH half of the coverage fix is DONE + live. Next: broaden the merge to other
  consumers (Home rail, Discover) if desired, and the phase-2 genre×city ALERT cron.
