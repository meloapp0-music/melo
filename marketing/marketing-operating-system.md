# Melo Marketing Operating System

*For a solo founder with a day job, ~50 followers, $0 budget, and one
real bottleneck: not ideas — sustained execution.*

> Synthesized from a 7-agent / 65-tactic brainstorm, reconciled against
> `docs/initiatives/2026-05-22-growth-strategy.md`. The honest truth:
> you already have a content calendar, a reels guide, a growth doc,
> Predis, and business cards. The problem isn't tactics — it's that
> marketing competes with a demanding job for willpower, and willpower
> loses. This OS removes decisions, not adds tactics. Every move either
> (a) happens at a show you're already attending, (b) batches into one
> scheduled block, or (c) runs passively forever after a one-time build.

## 1. The ONE Thing — be the Goose "setlist scribe"
After every Goose tour night: log the show in Melo, screenshot the clean
setlist + a Rarity/bust-out callout ("Hot Tea — last played 312 shows
ago"), and post it to **r/GooseTheBand + the Goose Discord within ~30
min of the show ending.** No "download my app" — the Melo branding is
just the watermark. People ask "what's that?" in the comments; you
answer.

Why this above everything:
- **It survives your failure mode** — posting a pre-rendered image is a
  30-sec phone task you can do on your worst week. Not "creating
  content," just sharing an artifact the app generates.
- **It weaponizes your un-copyable moat** (Rarity/bust-out data) against
  the one audience genetically obsessed with it (jam fans). Spotify,
  Seated, Bandsintown literally can't show this.
- **It's pull-demand, not push** — Reddit nukes "check out my app" but
  rewards the regular who reliably drops the best recap.
- $0, solo-runnable, raw material is free (you're at the show anyway).

This is the spine. Everything else hangs off it.

## 2. Top 10 moves (impact × feasibility), each with a first action
1. **Goose setlist scribe** (r/GooseTheBand + Discord). *First:* study
   the top setlist-post title format, build one branded recap template
   in the share-export, post a rarity-led recap next show night.
2. **Close the dead share-footer link** (engineering, not willpower).
   `shareCard.js` renders but `melo.show/@handle` doesn't resolve — every
   share is an anonymous dead-end. *First:* point `melo.show` at a static
   page that redirects to the App Store + add "melo.show · get the app" +
   a QR to the footer. Now every Story screenshot is one scan from an
   install.
3. **Log your OWN shows live** on your personal IG — 3-part micro-Story
   (pre-show screen → setlist auto-importing → next-morning rating). The
   product IS the content. *First:* at your next show, post one Story of
   the pre-show screen, venue tagged.
4. **Lot-scene QR stub cards** (pre-filled log). Redesign the cards
   you're printing as a stub whose QR deep-links into a *pre-filled* log
   of that exact show — kills cold-start. *First:* build the
   `melo://log?artist=…&venue=…&date=…` deep link, design one stub, order
   a 50-pack.
5. **Founding 100 from real-life concert friends.** Personally text (not
   broadcast) the people you go to shows with: "First 100 get a permanent
   Founding Fan badge — want #N?" *First:* list 15 concert friends, send 3
   invites today.
6. **Fix App Store metadata (ASO)** — compounds with zero ongoing effort.
   *First:* subtitle → "Setlist & Concert Diary"; keywords →
   `show,wrapped,gig,tour,ticket,festival,band,live,music,journal,log,seen,bandsintown,seatgeek,nugs`.
   Metadata-only, ~20 min.
7. **One monthly content day → drip via Predis.** 75-min block: screen-
   record 8-12 clips, light native edit, queue 3×/week. One day fuels a
   month. *First:* block 75 min this weekend, record 8 clips.
8. **Photographer "tag-back" loop.** DM the 3 best shooters from a show:
   "Your shots are unreal — want me to feature this show's setlist + tag
   you?" Hand them a finished card they *want* to repost. *First:* open
   the last venue's geotag, DM 3 photographers.
9. **Programmatic SEO setlist/venue pages** (build once, passive forever).
   `melo.show/setlist/[artist]/[venue]/[date]` from Setlist.fm data →
   intercepts "Goose setlist Salt Shed 2024" Googling. *First:* hand-build
   one proof page, submit `melo.show` to Google Search Console.
10. **"Rarity Radar reaction" short-form series** — log a show, screen-
    record the rarity reveal, react. Built-in dopamine beat, zero script.
    *First:* hook = "My concert app just told me I heard a song played
    live 3 times. Ever."

## 3. The weekly operating cadence (built for burnout)
**Rule: never let a hard week take you to zero — scale down, never stop.**

- **DAILY — 5 min ("comment, don't post"):** 2-3 genuine comments in
  scenes you're in (r/GooseTheBand, bands' IG). Be a fan, never pitch.
  Reply to "what app is that?" via an iOS Text Replacement (`mlapp` →
  App Store link). Repost anyone who posts Melo.
  - **60-second floor (bad-week version):** post ONE thing to your Story
    from a pre-saved "Melo quick-post" phone album. One tap. Never zero.
- **WEEKLY — one 90-min batch ("Melo Sunday"):** assembly, not invention.
  **3-2-1:** 3 feed posts (pick images + caption + schedule in Predis),
  2 reels, 1 community drop (a Reddit post or 3 Founding Fan DMs). Then
  write the week's **install number** on a phone note. Timer rings → stop.
- **MONTHLY:** content day (75 min, batch 8-9 reels) + a 15-min PostHog
  funnel glance (signup → first show → 5 shows; do more of what moved
  installs).
- **SEASONAL:** October = a 2-hr block to pre-build the December Wrapped
  campaign (templates, captions, schedule). December = Wrapped is your
  Super Bowl; the only job is nudging shares.

## 4. Channel quick-starts (first move each)
- **Short-form video (reach):** hero format = Rarity Radar reaction.
  Keep a phone note "HOOKS" — paste a line every time a Melo stat
  surprises you. Dead-week fallback: "log my shows with me" (90-sec
  screen-record, calm trending sound, no face).
- **Reddit/community (conversion):** join r/GooseTheBand + Goose Discord,
  post a branded rarity-led recap (image only, no link), comment daily.
  One scene — don't spam five.
- **Creators (borrowed reach):** build one reusable "creator setlist
  card" template; DM 3 photographers the *finished* card to post
  (30-50% repost vs ~2% for "post my app?").
- **PR/ASO (passive):** fix the subtitle/keywords today; pitch jam press
  (Jambase, Live For Live Music, Relix) "Letterboxd for live music, jam
  focus"; list on AlternativeTo vs Bandsintown/Seated; time a Product
  Hunt launch to a feature ship.

## 5. 30-60-90
- **Days 1-30 (foundation + the ONE thing):** fix ASO; redirect
  melo.show + footer QR; `mlapp` text replacement; first 10 Founding Fan
  invites; daily comment habit; first Goose recap; order QR stub cards;
  first Melo Sunday + first content day; one SEO proof page. *Target:* a
  written weekly install number, 4 weeks running, streak intact.
- **Days 31-60 (engines):** per-slide Wrapped share (archetype + map
  first); templatize SEO for top 20 venues; QR cards at every show;
  recruit 10 "Founding Creators"; 1 shoutout swap/week. *Target:* the
  scribe role is recognized; SEO pages indexing.
- **Days 61-90 (compound + prep spike):** pitch 3-5 jam podcasts (audio
  sidesteps the design/consistency weakness); Product Hunt on a feature
  ship; build "Beat my year" + friends compare cards once friends are
  tested; October Wrapped-prep block. *Target:* ≥1 external surface
  driving installs you didn't hand-deliver.

## 6. Explicitly IGNORE / stop
- **Stop daily original posting** (burnout trap) → daily *commenting* is
  the sustainable version.
- **Stop spreading across 5 scenes** → own ONE (Goose) first.
- **Stop polishing** → raw screen-records beat polished posts now. Native
  editor only. "Done" is the goal.
- **No self-funded cash/discount rewards** → incinerates money, buys
  farmers (per growth-strategy). Affiliate/partner-funded or one capped
  giveaway only.
- **No big-influencer chasing** → same-size swaps + status-paid micro-
  creators say yes; big ones won't.
- **Don't wait for "perfect" features** → market what's shipped.
- **No metrics-dashboard habit** → one number (weekly installs) + a
  monthly funnel glance.
- **Never let a bad week go to zero** → the 60-second floor. The all-or-
  nothing spiral is the specific thing that's killed consistency before.

**The whole system in one line:** *Own the Goose scene as the setlist
scribe, turn every show you attend into content + QR distribution you'd
do anyway, batch the rest into one Sunday block, and let ASO +
programmatic SEO + the Wrapped share-loop run while you sleep — with a
60-second floor so a hard week never becomes a dead week.*

## Two engineering moves this surfaced (worth building)
- **Close the share-footer install loop** (move #2): redirect
  `melo.show` → App Store + add `melo.show` + QR to the `shareCard.js`
  footer. Without it, every Wrapped share is an anonymous dead-end.
- **Pre-fill log deep link** (move #4): `melo://log?artist=&venue=&date=`
  so the QR stub cards drop someone into a pre-filled log → kills
  cold-start at the moment they're most bought-in.
