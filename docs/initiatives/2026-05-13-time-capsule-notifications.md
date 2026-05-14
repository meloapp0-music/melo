# Time-Capsule Notifications — "1 year ago today"

- Started: 2026-05-13
- Status: planned (v1.0.6 headline, ~3-4 days)
- Last updated: 2026-05-13

## Context

The "compare two shows head-to-head" framing isn't what users actually
want from concert tracking (concert memories are emotional, not
competitive — see the 2026-05-13 thread). The right differentiator
for v1.0.6 is the OPPOSITE: not pushing users to rank, but pulling
them BACK into their own memories.

Time-capsule notifications are pure emotional re-engagement. The
hook: a year (or six months, or two years) after a show, the user
gets a push:

> 🎶 1 year ago today — Goose at Red Rocks.
> You rated it 9.5 and called it "Transcendent."

Tap → opens that show, with photos + setlist + your vibes still
intact. Two beats happen in the user's head:
1. "Oh my god, that show. That night."
2. "Wait — I haven't logged anything recently. Let me update Melo."

That's the loop. Cheap to build (~3-4 days), high emotional payoff,
and uniquely concert-app-shaped (Letterboxd doesn't notify you about
movies you watched a year ago).

Infrastructure cost is also near-zero — the APNs + Edge Function
plumbing already exists from `2026-04-20-pre-launch-sprint.md`. We're
adding ONE more cron trigger and ONE notification kind.

## Plan

### Schema (minimal — 1 column)

Migration `0011_time_capsule.sql`:

```sql
alter table public.shows
  add column if not exists last_capsule_sent_at timestamptz;

alter table public.user_settings
  add column if not exists time_capsules_enabled boolean
    not null default true;
```

`last_capsule_sent_at` on `shows` prevents the same show from being
re-notified within a window. `time_capsules_enabled` on
`user_settings` lets users opt out from a Settings toggle.

No new tables. Logic lives in the cron.

### Edge Function — `time-capsule-cron` (daily, 9am user local-ish)

Conceptually:

```
For each user with time_capsules_enabled = true:
  For each of their attended shows where:
    - DATE(show.date) matches today's month/day (any prior year)
    - last_capsule_sent_at IS NULL OR > 30 days ago
  Pick the highest-scored show among matches (don't spam 50 pushes
    for 50 shows that happened to be on May 13 across years)
  Send push with copy + deep link to that show
  Update last_capsule_sent_at = now()
```

**Cadence rules**:
- Anniversaries fire at exactly 1 year, 2 years, 3 years (and onward)
- NOT at 6 months — too soon, feels less significant
- Max ONE capsule push per day per user (even if they have 5 shows
  on this date across years — surface the highest-scored one only)

**Daily cron schedule**: 9am ET. Most concert-goers are awake; not
so early it's intrusive. Don't try to localize per user in P1 —
just send at 9am ET and accept that west-coast users get it at 6am
(adjust if anyone complains).

### Push notification copy

Single show match:
```
Title: 🎶 1 year ago today
Body: Goose at Red Rocks Amphitheatre. You rated it 9.5 and called it Transcendent.
```

Two years:
```
Title: 🎶 2 years ago today
Body: Mumford & Sons at Wrigley Field. Still a 10.
```

Three+ years (more poetic):
```
Title: 🎶 5 years ago tonight
Body: AC/DC at Soldier Field. Remember that?
```

Tap action: deep link to `melo://show/{showId}` which opens the
ShowDetail sheet.

### Settings UI

New row in Settings → Notifications:

```
☐ Time-capsule reminders
   "It's been 1 year since…" — gentle pushes on
   the anniversaries of shows you've logged.
```

Default: ON for new users. Existing users get an in-app prompt the
first time they open v1.0.6 ("We added time-capsule reminders —
opt in to get pulled back into past shows on their anniversaries.")

### Edge cases

- **User logged 50 shows on the same calendar day a year ago**
  (e.g., logged a festival's whole weekend retroactively): surface
  just the highest-scored show. Don't fire 50 pushes.
- **User has zero shows from this date in past years**: no push.
  Easy — the cron only finds anniversaries, no false fires.
- **User dismisses the notification**: `last_capsule_sent_at` is
  set anyway. No re-send for ~30 days. Won't see the same show's
  push twice in close succession.
- **Future show (Going/Wishlist with date in the future)**:
  excluded from capsule logic — only Attended shows trigger.
- **Push permission denied**: silent. No errors, no nags.

## Phases within v1.0.6

1. **Migration + cron stub.** Apply schema, deploy empty Edge
   Function that just logs candidate matches without sending.
   Half day. Verify the math (does my Goose Red Rocks show
   actually surface as a candidate on the right date?).
2. **Push notification fire path.** Wire the existing APNs send
   helper into the cron loop. Half day. Test with a manual cron run
   targeted at your own user_id.
3. **Settings toggle + opt-in prompt.** Add the Notifications
   section in Settings.jsx + the one-time in-app prompt on first
   v1.0.6 launch. Half day.
4. **Copy variants + polish.** A few different headlines per
   anniversary year so the user doesn't get the SAME copy structure
   12 times. Half day.

Total: ~2 days of focused work. Padding to 3-4 days for testing
edge cases.

## Changes made

_Pending — work starts after v1.0.5 (★ Favorite + trimmed vibes +
data export) ships._

## Open questions / follow-ups

- **6-month capsule?** Tempting (more frequent re-engagement) but
  risks "too soon, doesn't feel significant." Skip for P1; revisit
  if anniversary-only engagement is too sparse.
- **Localized send time.** "9am ET for everyone" is the lazy P1.
  P2 could look up user's timezone (from device) and target 9am
  local. Adds ~half day of work.
- **"You haven't logged anything recently" nudge.** If we know
  someone hasn't opened the app in 3 months but they have a
  one-year-anniversary today, that push has huge re-engagement
  leverage. Consider varying the CTA: regular users get "relive it";
  dormant users get "still tracking your shows?"
- **Show photo on rich notification.** APNs supports image
  attachments via the mutable-content payload. A photo of the
  user's own concert photo in the lock-screen notification would
  be insanely strong emotional fuel. Worth investigating — adds
  half a day of work + a `notification-service-extension` target
  in Xcode.
- **Cross-link with `2026-05-05-notifications-system.md`** — this
  is one of the notification kinds in the broader matrix. After
  shipping, add it to the per-kind toggle list in Settings →
  Notifications.
- **Cross-link with marketing.** Once shipped, this is a marketable
  feature ("Melo pulls you back into the shows you'd forgotten").
  Add to the v1.0.6 release-notes draft + a single-image post
  showing the notification on a lockscreen.
