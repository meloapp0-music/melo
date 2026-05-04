---
name: LLC Formation & Apple Org Switch
description: Form Melo LLC, get EIN + DUNS, switch Apple Developer account from Individual to Organization, move expenses into the business
type: project
---

# LLC Formation & Apple Org Switch

- Started: 2026-05-01
- Status: planned
- Last updated: 2026-05-01

## Context

Melo is currently registered as an **Individual** Apple Developer account
under Aidan Wise. That means the App Store seller name displays as
"Aidan Wise" — fine for a side project, suboptimal for a real product
once Melo ships, picks up traction, charges for anything, or interacts
with press / investors / future hires.

Forming an LLC unlocks:

- **App Store seller name = "Melo, LLC"** (via Apple Developer Org switch).
  Most material public-facing change. Builds buyer trust, looks legitimate
  in screenshots, presskits, and listings.
- **Liability shield** — separates personal assets from anything that
  goes wrong (lawsuits, data breach, copyright dispute, terms of
  service violation).
- **Cleaner taxes** — Melo expenses (Cloudflare, domain, Apple Developer
  fee, Mailchimp, future ad spend, Supabase, etc.) flow through the
  business and become deductible against future revenue.
- **Required before monetization** — the moment Melo+ ships
  (commemorative-tickets paid tier, animated tickets, exclusive drops),
  the entity needs to be in place.
- **Required before outside investors / co-founders** — clean cap table
  needs an entity to issue equity from.

This is **not urgent** — launch is the priority. But it should be done
in the 2–4 week window between v1.0 approval and the v1.2
commemorative-tickets ship, before any paid feature exists in the app.

## Plan

Sequential. Each step depends on the previous.

### Step 1 — Pick state and formation method

- **State:** default to Aidan's home state (currently NJ — confirm).
  Delaware LLC is common in tech but adds complexity (registered agent
  fees, foreign-qualification in home state). Only worth it if raising
  outside capital — defer until that happens.
- **Method options, ranked by ease vs. cost:**
  - **Stripe Atlas** ($500) — most painless, includes legal docs +
    Mercury bank intro + EIN handling
  - **LegalZoom / Tailor Brands** ($150–300) — middle ground
  - **DIY through state Secretary of State website** ($50–200) — cheapest
    but more paperwork
- Recommendation: DIY or LegalZoom. Atlas is overkill for a single-member
  domestic LLC.

### Step 2 — File Articles of Organization

- Reserve name "Melo, LLC" with home-state Secretary of State (check
  availability first)
- File Articles of Organization
- Wait for confirmation (typically 1–5 business days, faster with
  expedited filing)

### Step 3 — Federal EIN

- Apply at irs.gov (free, 5 minutes online, instant approval)
- Save the EIN letter PDF — needed for bank account, Apple, and taxes

### Step 4 — Operating Agreement

- Single-member LLC operating agreement (template fine for solo founder;
  lawyer-reviewed if there's a co-founder)
- Not filed publicly, but required for opening business bank account in
  most states

### Step 5 — Business bank account

- **Mercury.com** — recommended for tech indie founders (free, online-only,
  30 min setup, debit card included)
- Alternatives: Brex, traditional Chase/Wells/local bank
- Connect to existing tools: Stripe (when monetizing), QuickBooks /
  Xero (for bookkeeping)

### Step 6 — DUNS number

- Apply at dnb.com (free, 1–7 business days)
- Required for Apple Developer Organization account
- Save the DUNS PDF

### Step 7 — Apple Developer Organization switch

- Log into developer.apple.com
- Submit LLC name, EIN, DUNS, and Articles of Organization
- Apple verifies (typically 2–5 business days)
- Once approved, App Store seller name flips to "Melo, LLC"

### Step 8 — Move expenses into the business

- Move recurring expenses to business card / bank account:
  - Cloudflare (domain + Workers)
  - melo.show registration
  - Apple Developer Program ($99/year)
  - Mailchimp
  - Supabase (when on paid plan)
  - Future: ad spend, design tools, freelancer payments
- Reimburse personally-paid expenses if cleanly traceable, or treat as
  founder loan / capital contribution (consult CPA)

### Step 9 — Bookkeeping setup

- QuickBooks Self-Employed, Xero, or even a simple spreadsheet to start
- Categorize expenses for end-of-year tax filing
- Save all receipts (Cloudflare, Apple, etc.) — most are recoverable from
  vendor portals if missed

### Step 10 — CPA conversation (optional but recommended)

- Single 30–60 minute consultation, $150–300, before first tax filing
- Topics: pass-through vs S-corp election, quarterly estimated taxes,
  state-specific filings, founder-salary mechanics

## Changes made

- 2026-05-01: Initiative created, planning only. No state filings yet.
  Awaiting v1.0 App Store approval before kicking off Step 1.

## Open questions / follow-ups

- **Home state:** confirm Aidan's state of residence and check whether
  it has a punitive minimum franchise tax (e.g., California's $800/year
  even at $0 revenue). NJ is friendlier ($75 annual report fee).
- **Single-member vs partnership:** Aidan is solo today. If a co-founder
  joins later, the LLC becomes multi-member and operating agreement +
  K-1 tax filings get more complex. Plan for this if/when it happens.
- **S-corp election:** worth considering once Melo revenue clears
  ~$60–80k/year — saves on self-employment tax. Don't elect until
  revenue justifies it; CPA call should cover this.
- **Trademark "Melo":** "Melo" is a generic word and likely already
  trademarked in adjacent categories (music, fashion, etc.). Check
  USPTO TESS database before pursuing trademark protection. Probably
  not worth the $250–$750 application fee unless someone tries to
  ship a competing app under the same name.
- **Privacy policy / Terms of Service ownership:** current legal pages
  reference Aidan as the operator — update to "Melo, LLC" once formed.
- **Stripe / payment processor:** when Melo+ launches, Stripe account
  must be opened under the LLC EIN, not personal SSN.
- **Insurance:** general liability + cyber insurance ($500–$1500/year)
  worth considering once user count is meaningful and/or paid features
  exist. Defer until then.
