# Contacts → Buddies Discovery

- Started: 2026-05-06
- Status: planned (targeting v1.2 alongside buddies-phase-2)
- Last updated: 2026-05-06

## Context

Asked by user (2026-05-06):

> "when you go into the buddies section, you should be able to see
> people from your contacts who have a melo account and add them. if
> they dont have an account, you can invite them."

This is a known social-network growth pattern — Snapchat, BeReal, Strava,
Letterboxd, Goodreads all do it. It's the most effective onboarding
funnel in social apps because every new account is one degree of
separation from someone they already know.

It also has the highest privacy-sensitivity surface of anything in the
roadmap so far. Contact data isn't the user's own data — it's data about
people who haven't consented to Melo. Apple's App Store review
(Guideline 5.1.2(i)) and GDPR/CCPA both require careful handling. We
get this wrong and we get rejected, fined, or both.

Depends on `2026-05-05-buddies-phase-2.md` Phase 2a (friendships table
+ user discovery infrastructure) being live.

## Plan

### Phase 1 — Hashed contact match

The standard privacy-preserving pattern. We never send raw phone
numbers or emails to the server.

**Client side (Capacitor plugin: `@capacitor-community/contacts`):**

1. User taps "Find friends from contacts" in Buddies header
2. Show an opt-in screen explaining what we do, how we hash, how we
   never store raw contact data
3. User accepts → `Capacitor.Contacts.requestPermission()` → iOS native
   permission prompt
4. We pull `phoneNumbers[]` + `emails[]` for each contact
5. Normalize: phone → E.164, email → lowercase + trim
6. Hash each with SHA-256 + a server-known **pepper** (env var
   `MELO_CONTACT_HASH_PEPPER`, generated once, never rotated without
   migration plan)
7. Send hashed identifiers in a single batch to a new
   `match-contacts` Edge Function

**Server side (`match-contacts` Edge Function):**

1. Look up `profiles.contact_hashes[]` (a Postgres array of
   pre-computed hashes for that user's verified email + phone numbers)
2. Return only the hashes that matched a real user, with that user's
   `user_id`, `username`, `display_name`, `avatar_url`
3. Do not log unmatched hashes
4. Do not retain matched hashes server-side beyond the request

**Profile-side prep (one-time, on user opt-in):**

When User A first opts into "be discoverable by contacts," we hash
their verified email (the one Supabase auth confirmed) and any phone
number they've added in Settings, store those hashes in
`profiles.contact_hashes[]`. Without this, no one can find them — the
table is empty by default.

### Phase 2 — UI surfaces

Inside Buddies page, new section above the existing buddies list:

```
[ + Find friends from contacts ]   ← initial CTA

(after sync)

  On Melo (3)
  ┌─────────┐
  │ avatar  │  @sarahb · Sarah B
  │ avatar  │  @mike   · Mike Allen
  └─────────┘  Tap to send friend request

  Not on Melo yet (12)
  ┌─────────┐
  │ initial │  Alex Carter      [ Invite via SMS ]
  │ initial │  Dana Kim         [ Invite via SMS ]
  └─────────┘
```

- Tapping a "On Melo" row → sends a friend request via the
  buddies-phase-2 friendship system
- Tapping "Invite via SMS" → opens iOS native share sheet pre-filled
  with `melo://invite?from={user_id}` + a fallback message ("hey,
  I'm on Melo tracking concerts — get it: melo.show")
- Re-running sync only matches new contacts; cached matches remain
  visible until user explicitly clears

### Phase 3 — Settings + revocation

- Settings → Privacy gets a "Discoverability" card:
  - Toggle: "Friends can find me via my email" (default on, if signup
    email is verified)
  - Toggle: "Friends can find me via my phone number" (default off
    until user adds + verifies a phone)
  - Phone number entry + verification (SMS code via Supabase Phone Auth
    or a separate Edge Function with Twilio)
- "Forget my contacts" button → clears `profiles.contact_hashes[]`
  and tells the client to drop its cached match list
- Once revoked, the user is removed from contact matching
  immediately on the next sync any other user runs

## Schema

New migration `0007_contact_discovery.sql`:

```sql
-- Hashed identifiers a user has opted into being discoverable by.
-- Lookup keys only — never the raw email or phone.
alter table public.profiles
  add column if not exists contact_hashes text[] not null default '{}',
  add column if not exists discoverable_by_email boolean not null default false,
  add column if not exists discoverable_by_phone boolean not null default false,
  add column if not exists phone_verified text default null; -- E.164, post-OTP

create index if not exists profiles_contact_hashes_gin
  on public.profiles using gin (contact_hashes);
```

RLS: existing `profiles_select_own` policy stays. The `match-contacts`
Edge Function uses the service role key + a strict allowlist of
returnable columns (`user_id`, `username`, `display_name`,
`avatar_url`) — never returns the contact_hashes array itself.

## Privacy + legal

This section needs to be solid before shipping.

- **Privacy Policy update** — explicit section on how contact data is
  processed: client-side hashed before upload, server stores only
  hashes for opt-in users, hashes are not reversible without the pepper
  + the original input
- **Terms of Service update** — call out that contacts data is the
  user's responsibility (they should only sync if they have a basis
  to share their contacts with us)
- **iOS `NSContactsUsageDescription`** in Info.plist:
  "Melo uses your contacts only to show which of your friends are
  already on Melo. We never see their phone numbers or emails — they're
  hashed on your device before being sent."
- **App Store review notes** — explicit explanation of the hashing
  flow, with a screenshot of the opt-in screen
- **No contact data in analytics or telemetry** — contact_hashes are
  never logged, never appear in error reports
- **Right to deletion** — when a user deletes their account
  (`delete-account` Edge Function, already shipped), strip their hashes
  from anyone else's match results

## Anti-abuse

- Rate limit `match-contacts` to 3 calls per user per day. Otherwise
  it's an enumeration attack: an attacker uploads hashes of every
  email in a leaked breach, sees who's on Melo.
- Cap batch size at 1000 hashes per call. If a user has 5000
  contacts, paginate client-side.
- Reject calls where >50% of hashes don't match anything (suspected
  enumeration probe). Log + alert.
- Do not return user IDs to the client for a hash that the client
  didn't have (no information leak).

## Phasing

- **Phase 1 (v1.2):** Hashed match + UI + opt-in screen. Email
  matching only (phone needs separate verification flow).
- **Phase 2 (v1.3):** Phone number addition + SMS verification +
  phone-based discovery.
- **Phase 3 (v1.4+):** Auto-suggest "Sarah from your contacts went
  to the same show" surfaces — once enough users have opted in for
  the signal to be useful.

## Changes made

_None yet — planning only._

## Open questions / follow-ups

- **Pepper rotation.** The hash pepper is one secret stored as a
  Supabase env var. If it ever leaks, every existing
  `contact_hashes[]` entry needs to be invalidated. Migration plan:
  rotate pepper → all clients re-hash on next sync → server treats
  old hashes as nonexistent during transition. ~30 day window.
- **Capacitor plugin choice.** `@capacitor-community/contacts` is the
  obvious pick but it's community-maintained. Verify it's actively
  updated against the latest iOS SDK before locking in.
- **Phone verification cost.** Twilio SMS OTP is ~$0.008/message in
  the US. At even 1k DAU adopting phone discoverability, ~$8 in
  one-time setup costs. Trivial. International rates vary wildly.
  Defer phone discovery until we have revenue or grant funding.
- **iOS-only at launch.** Capacitor contacts plugin works on iOS;
  Android port is its own project. The Buddies UI will hide the
  CTA on web/Android until parity ships.
- **Cross-link with `2026-05-05-buddies-phase-2.md`** — this
  initiative depends on Phase 2a (friendship infrastructure).
- **Cross-link with `2026-05-06-email-mfa.md`** — discoverability by
  email requires the email to be verified, which requires email
  confirmation on signup (the v1.0.4 work).
- **Cross-link with `2026-04-20-make-it-legal.md`** — Privacy Policy
  + Terms updates land before this ships.
