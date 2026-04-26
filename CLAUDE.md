# Melo — Notes for Claude Code

## Project

Melo is a React 19 + Vite 8 SPA for tracking concerts. It is being evolved
from a 100% client-side localStorage prototype into a Supabase-backed social
platform. The current architecture, design language, and multi-phase roadmap
live in `docs/initiatives/`.

## Run locally

```
npm run dev        # Vite dev server
npm run build
npm run preview
```

Required env vars (see `.env.example`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

---

## Rule: keep an initiatives log

**Every time you (Claude Code) start work on a substantive new feature,
migration, or architectural change, create or update a markdown file in
`docs/initiatives/` that captures the plan, the rationale, and the outcome.**

This is how context survives across Claude Code sessions. Without it, each
session starts from zero and risks re-doing, undoing, or contradicting prior
work.

### Folder layout

```
docs/
  initiatives/
    README.md                      # running index — newest first
    YYYY-MM-DD-<slug>.md           # one file per initiative
```

### When to create a new initiative file

- A new phase of the backend/social rollout (`phase-N-…`)
- A substantive new feature (`streak-cards`, `wrapped-year`, `friend-search`)
- A cross-cutting refactor (`migrate-to-supabase`, `remove-localstorage`)
- A design-system change that touches many files

Do **not** create one for tiny fixes, single-line tweaks, or typo cleanups.

### Required sections per file

```md
# <Title>

- Started: YYYY-MM-DD
- Status: planned | in-progress | shipped | paused | abandoned
- Last updated: YYYY-MM-DD

## Context
Why this is happening. What problem it solves. What prompted it.

## Plan
The approach. Phased if applicable. Link to the approved plan file in
~/.claude/plans/ if one exists.

## Changes made
Running log of what actually shipped, with dates. Append as you go —
do not rewrite history. Each entry: `- YYYY-MM-DD: <what changed>`.

## Open questions / follow-ups
Anything left for a future session.
```

### Workflow each session

1. **At the start of a non-trivial task**, check `docs/initiatives/README.md`
   and any file whose topic overlaps with the current request. Treat those
   notes as authoritative about prior decisions.
2. **If the task starts a new initiative**, create the file before writing
   code. Status = `in-progress`.
3. **As you make changes**, append to the `Changes made` section with
   today's date. Do not wait until the end — if your session is truncated,
   the log should still reflect what landed.
4. **When the initiative ships or is paused**, update `Status` and
   `Last updated` and add a one-line summary to `docs/initiatives/README.md`.
5. **Never overwrite** entries in `Changes made`. Append only.

### README.md format

```md
# Initiatives Index

Newest first. One line per initiative.

- `YYYY-MM-DD-<slug>.md` — status · one-sentence summary
```

---

## Style guardrails

- **Design language**: premium iOS-native. Keep spacing tight and consistent.
  Frosted glass + gradient accents are the house look — see `App.css`.
- **Brand**: `src/web/components/MeloLogo.jsx` exports `MeloIcon`,
  `MeloWordmark`, `MeloLockup`. Use these instead of raw "M" letters or
  wordmark text.
- **State**: global state is a React Context (`AppContext` from `App.jsx`).
  Pages access it via `useApp()`. Do not introduce Redux / Zustand / etc.
  without an initiative note justifying it.
- **Data layer**: Supabase access lives exclusively under `src/web/lib/db/*`.
  Pages and components must not call `supabase.from(...)` directly.
- **No new docs** unless the user asks or an initiative file is appropriate.
  Do not create READMEs in component folders, etc.

---

## Security spine (don't weaken)

- Every Postgres table has Row-Level Security enabled. Policies live in
  `supabase/migrations/`. Read them before adding a new table.
- The Supabase anon key is safe to ship in the bundle **because** of RLS.
  Never use the service-role key in client code.
- The Setlist.fm API key is per-user and lives in `user_settings` (RLS =
  self only). A future phase moves it to encrypted-at-rest via an Edge
  Function.
