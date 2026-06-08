# Melo Growth & Retention Strategy

- Started: 2026-05-22
- Status: strategy (living doc — synthesized from a 7-agent brainstorm of 71 ideas)
- Last updated: 2026-05-22

> Solves the core problem: users log ~4 shows then burn out. Every play
> favors **$0 rewards** — status, identity, unlocked features,
> recognition, exclusivity — over money (no merch/discounts pre-scale).

## The strategic insight
Melo's moat is **data nobody else has — what you *heard live* and
*where you traveled*.** Every high-leverage play converts that private
data into either **(a) a public flex that recruits** or **(b) a personal
artifact too valuable to abandon.** Wrapped does this once a year; the
whole job is to make it happen the other 11 months.

## The One Big Idea — "The Pass"
A single living profile object — your **Live Music Pass** — that visibly
levels up with every logged show, unifying badges/streaks/archetype into
one progression you can fill and share. Four $0 tracks:

- **Track A — Identity that deepens.** The Wrapped archetype evolves
  through tiers (e.g. Country Storyteller → Honky-Tonk Disciple → Outlaw
  Sage at 4/12/25 shows in a lane). The engine (`generatePersonality`)
  exists but is static — making it deepen turns "log another show" into
  "become more myself." **Highest-ROI item.**
- **Track B — Per-artist Superfan status.** 3+ shows of an artist →
  Superfan ✓, 5+ → Diehard, 10+ → Crown. This audience defines itself by
  *the band they chase*. Lowest effort, sharpest fit. Pure derived data
  (Artists page).
- **Track C — Collection Passport.** Stamps for new venues/cities/
  states/genres/festivals; the magic is the **"one away" nudge** wired
  into Discover ("1 state from the Midwest sweep — here's who's playing
  Iowa") — the app actively helps you complete the set.
- **Track D — Founding scarcity (NOW-only).** "Founding Fan #137"
  permanent rank + "Beta Lane" early access for active loggers. Pre-scale
  is the *one* moment this free flex exists.
- **Connective tissue — Streak Freeze, earned not bought.** Logging
  earns a freeze token that auto-saves a streak during a gap. And
  redefine the streak as **"shows logged promptly"** (within N days of
  attending), NOT calendar days — calendar streaks punish concert
  cadence and cause guilt-churn.

## Quick wins (build now, days each)
1. **Wire up the dead "Share your year" button** → branded IG-Story
   export. *(Confirmed dead string in `Wrapped.jsx:717`.)* The #1 viral
   gap. **Must land before December.** → see
   `2026-05-22-wrapped-share-export.md`.
2. **Universal branded share footer** — cream Melo wordmark + tappable
   `melo.show/@handle` on *every* exported image. Decide the
   commemorative-tickets footer question (clean+tappable). The multiplier
   that makes every share convert.
3. **Per-slide Wrapped share** — a share icon per slide → 3-4 branded
   Story frames per user instead of one.
4. **Archetype Evolution tiers** (Track A) — decoupled from December as a
   year-round "what's your Melo type?" share. Identity labels are the
   most viral social unit.
5. **Per-artist Superfan badges** (Track B) — smallest build, sharpest
   audience fit; first visible piece of The Pass.

## Big bets (transformational)
1. **Year-round Wrapped:** pull commemorative ticket stubs (Phase 1)
   *forward* + rarity tiers + Rarity Score; shareable monthly mini-recap
   with an "unconfirmed shows" batch-logging checklist. 12 dopamine
   hits/year, not 1.
2. **Bust-out / Rarity Radar (the un-copyable moat):** log a show →
   Melo cross-references the setlist vs the artist's history ("you heard
   {song} — last played 312 shows ago / live debut"). Pure Setlist.fm
   data, catnip for jam fans, makes *every* show potentially special —
   the strongest answer to "why log a normal show?"
3. **Friends compare cards + "Beat my year" challenge link** (after the
   friend system): a split-screen "your year vs theirs / shows together"
   card whose natural share target is the friend it's about → recruits/
   reactivates. Friends-only, celebratory.
4. **Programmatic SEO:** static branded pages per venue/artist setlist
   (`melo.show/venue/red-rocks`) from existing setlistfm data → intercept
   "Goose setlist Salt Shed 2024" Googling. $0, compounding, passive —
   fixes the "inconsistent marketing" weakness by making distribution
   run while you sleep.
5. **Setlist Bingo (during-the-show companion):** "I'm here tonight" →
   tap songs off a predicted setlist live; first check-off auto-creates
   the log. Logging IS the gameplay. Builds on PlayableSetlist +
   predictions-game.

## Outside-the-box plays
1. **Lot-scene QR ticket-stub cards** — hand out at shows; QR scans into
   a *pre-filled* log of that exact show. The scene distributes for you.
   (Directly relevant — you're printing cards now.)
2. **Adopt-a-band setlist scribe** — be the person who drops a gorgeous
   Melo setlist recap to ONE scene's subreddit/Discord every tour night.
   Pull-demand, $0, solo-runnable.
3. **"Show Twins" connector** — "N other Melo users were here" → connect
   with highest-overlap stranger. *Gated on the moderation/T&S floor.*
4. **"Founding 100" cohort** — capped inner circle; the only way in is
   logging 4+ real shows, so the reward gates exactly on beating the
   burnout cliff. Becomes the street team.
5. **"This time last year" nostalgia card** — anniversary push with the
   user's own photo → one-tap share. Near-free layer on the planned
   time-capsule cron.

## Anti-burnout plan (past 4 shows)
- **(a) No reason to return** → The Pass always dangles the next rung +
  a per-show **completeness ring** (setlist/rating/vibes/photo/who/
  opener/cost) = dozens of return-and-finish tasks *without* a new show.
- **(b) Why log a normal show** → Rarity Radar makes any show potentially
  special; a 24h "Fresh" stamp (log within a day or lose it) tied to the
  real event, not an arbitrary streak.
- **(c) Forgetting** → post-show "rate it" prompt (✅ shipped),
  "this time last year" + anniversary "add what you forgot" checklist,
  monthly recap batch-logging, Streak Freeze + cadence-aware streak.
- **Throughline:** never punish (no guilt-streaks, no global rank, no
  shaming) — always celebrate, always-slightly-ahead.

## Sequencing (solo founder; share-export before December)
- **Now → 2-3 wks:** branded footer → wire "Share your year" + per-slide
  export → Archetype Evolution + Superfan badges.
- **Wks 3-8:** commemorative stubs P1 + Rarity Score → Bust-out Radar →
  monthly recap + unconfirmed-shows checklist → Passport + "one away"
  nudges + Streak Freeze.
- **Parallel, $0, founder-run:** adopt-a-band scribe (one scene),
  lot-scene QR cards, Founding 100.
- **After friends ship+tested:** compare cards + "Beat my year" +
  friends-leaderboards.
- **After T&S floor:** Show Twins.
- **Background infra:** programmatic SEO (start now, compounds for
  months).

## Explicitly DON'T
- No global leaderboards (friends-only, celebratory).
- No money-cost rewards pre-scale.
- No public UGC (Show Twins, Curator, open "were you there?" tags) until
  the moderation/T&S floor exists (Guideline 1.2).
- Never gate behind a calendar-day streak — it punishes concert cadence.

## Cross-links
`2026-05-22-engagement-retention-loops.md` (The Pass folds in as the
unifying frame), `2026-05-22-wrapped-share-export.md` (Quick Win #1-3),
`2026-04-30-commemorative-tickets.md` (pull P1 forward; footer decision),
`2026-05-21-v1-0-7-wrapped-depth.md` (deferred share-export noted there),
`2026-05-22-cold-start-activation.md`, `2026-05-05-recommendations.md`.
