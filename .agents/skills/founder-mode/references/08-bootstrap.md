# 08 — Bootstrap: Binding Founder Mode to This Codebase

Run this once per clone before the first write-authorized founder-mode task, and again whenever the
command set changes. For read-only reviews, inspect without creating state files.

**Why it exists.** Every gate demands evidence, and evidence means running *this project's* real
commands. A process that guesses at commands produces fake evidence, which is worse than none.

**Golden rule: discover, never assume.** A script existing in `package.json` does not mean it works,
does not mean it is the whole suite, and does not mean it needs no services. Run everything you
record.

---

## Step 1 — Read what the project already says

- **`.agents/AGENTS.md`** — the critical directives. **These outrank founder-mode on anything they
  cover:** no monolithic HTML strings, no naive LWW sync, no client-side totals or privilege
  decisions, customer and staff sessions stay decoupled, and the git author rule
  (`uninestindia-crypto` / `uninestindia@gmail.com`, and never touch `.githooks/pre-commit`).
- **`.agents/skills/tier-1-engineering-standards/SKILL.md`** — the architectural standard.
- **`.agents/skills/taste-os-design/`** — the design law. P6 defers to it entirely.
- **`.agents/skills/supabase/` and `supabase-postgres-best-practices/`** — the database law.
- **`DEPLOYMENT_GUIDE.md`** — the real deploy sequence, including the Edge Functions.
- **`PLATFORM_BLUEPRINT.md`, `CUSTOMER_PLATFORM_ROADMAP.md`** — product intent.
- **`.github/workflows/`** — CI is the most reliable statement of what commands actually matter,
  because unlike a README it runs on every push.
- **`package.json` scripts, `next.config.js`, `playwright.config.js`, `vercel.json`, `.env.example`**
- `git log --oneline -20` — what is actively moving, and the real commit conventions.

---

## Step 2 — The stack, as it actually is

| Signal | What it means here |
|---|---|
| `next.config.js` with `output: 'export'`, `distDir: 'dist'` | Static export. There is no server at runtime. Everything is client-side. |
| `src/main.ts` + `src/router.ts` + `src/views/**` | A hash-routed vanilla-class app mounted inside the Next shell |
| `src/app/**` | The pre-rendered marketing/storefront pages (`/`, `/menu`, `/about`, …) |
| `dexie` + `src/db/database.ts` | The local cache, schema-versioned |
| `@supabase/supabase-js` + `supabase/migrations/**` | The source of truth, with RLS |
| `supabase/functions/**` | Privileged operations the client may not do |
| `playwright.config.js` with five device projects | The E2E matrix: Desktop Chrome, iPhone SE, iPhone 15, Pixel 5, iPad |
| `tests/*.test.ts` run by `tsx --test` | Unit/contract/integration, with `fake-indexeddb` |
| `capacitor.config.json`, `android/` | An Android wrapper exists; APK signing is a separate path |

**The consequence that shapes every gate:** there is no server to protect the data, so *all*
authorization is RLS plus Edge Functions, and *all* resilience is the sync layer. Those two are the
critical infrastructure of this product.

---

## Step 3 — Discover and **verify** the commands

Fill in `.codex/launch/COMMANDS.md` by *running each command* and recording what happened. A command
you did not run goes under "unverified", not in the table.

| Ring / need | Command | Verified | Notes |
|---|---|---|---|
| Install | `npm ci` | | restores the lockfile exactly |
| Typecheck | `npm run typecheck` | | **see the suppression note below** |
| Lint | — | | no linter is configured; that is a gap, record it |
| Secret scan | grep over `src/` and `dist/` | | no dedicated tool configured |
| Dependency audit | `npm audit` | | part of `launch:verify` |
| Migration validation | `npm run db:validate` | | parses every migration in order |
| Unit/contract/integration | `npm test` | | `tsx --test tests/**/*.test.ts` |
| E2E | `npm run test:e2e` | | builds, then Playwright across five projects |
| Accessibility | `npm run test:a11y` | | needs a build in `dist/` first |
| Build | `npm run build` | | env check → menu snapshot → next build → harden |
| Serve the build | `npm run preview` | | `serve dist -l 3000` |
| Everything CI runs | `npm run launch:verify` | | db:validate → typecheck → test → audit → build → playwright |
| DB migrate up | Supabase SQL editor / `supabase db push` | | **a human, not CI** |
| **DB rollback** | — | | **no down-migrations exist. This is a G7 blocker for T3+.** |
| Edge Function deploy | `npx supabase functions deploy <name>` | | **a human, not CI** |
| Deploy web | Vercel Git integration on push to `main` | | |
| **Rollback web** | Redeploy the previous Vercel build | | rehearse and time it |

**The suppression note.** `npm run typecheck` is only as meaningful as the number of files it is
allowed to read. Record both numbers in the baseline:

```
typecheck:  <n> errors
suppressed: <n> files carrying @ts-nocheck   ← the second number qualifies the first
```

**Record the baseline.** Run the full static + test set on a clean checkout **before changing
anything**:

```
BASELINE (clean checkout, <date>, <commit sha>)
typecheck:   0 errors        suppressed: <n> files
audit:       <n> vulnerabilities
db:validate: <n> migrations parsed
unit:        <n> passed, <n> failed
e2e:         <n> passed, <n> failed
build:       ok / failed
```

This baseline is what makes R0's "zero findings" bar enforceable in a repo that does not start at
zero: **your change adds nothing new**, and fixing the baseline becomes its own slice with its own
gate. Without a recorded baseline every gate becomes an argument about whose failure it is.

---

## Step 4 — The money paths

The four journeys that, if broken, mean the product has no reason to exist. These are the R4 suite
and the production smoke suite:

1. **Guest order** — a stranger opens the storefront on a phone, browses the menu, adds a dish with
   its add-ons, checks out without an account, and can still see that order afterwards.
2. **Counter sale** — a cashier builds a cart on the POS, takes payment, prints or skips the receipt,
   and the day's takings and stock both move by exactly the right amount.
3. **Kitchen flow** — the ticket appears on the KDS within seconds, advances through its statuses,
   and every device agrees, including one that was offline for part of it.
4. **Staff access** — an owner creates an account with a role; that person signs in and sees exactly
   their screens, with no access-denied toast on their own home route.

For each, write down the actor, the steps, what success looks like, and the worst failure.

---

## Step 5 — Map the environments

| Environment | Exists? | How to reach it | Data | Who deploys | Rollback |
|---|---|---|---|---|---|
| Local | yes | `npm run preview` | empty IndexedDB + a Supabase project | — | — |
| CI | yes | GitHub Actions "Launch Readiness" | none | — | — |
| Staging / preview | **record honestly** | Vercel preview deployments? A second Supabase project? | | | |
| Production | yes | the live domain + the linked Supabase project | real orders | Vercel + a human | redeploy previous build |

**If there is no production-like environment with its own Supabase project, that is a G7 blocker for
T3+ work** and must be raised in P0, not discovered at T-3 days. "We test in production" is a strategy
only if the rollback is instant and rehearsed — and for a database migration it is neither.

---

## Step 6 — Note the project's own law

Record explicitly: the design law skill (`taste-os-design` → P6 defers to it); the review tooling
(`/code-review`, `/security-review` → P5 evidence); the git hooks in `.githooks/` (a hook that blocks
you is the project telling you a rule); and everything `.agents/AGENTS.md` mandates.

---

## Step 7 — Write the state files

```
.codex/launch/
  COMMANDS.md      ← the verified command table + baseline   (the most valuable file)
  CONTEXT.md       ← stack, money paths, environments, project law
  SCORECARD.md     ← the current score out of 100, with evidence
  CHARTER.md  PRD.md  ARCHITECTURE.md  SLICES.md  RISKS.md  STATE.md
  PRELAUNCH.md  RUNBOOK.md  POSTMORTEM.md
```

`COMMANDS.md`, `CONTEXT.md`, and `SCORECARD.md` are written once and maintained. The rest are
per-effort — archive them into `.codex/launch/archive/<name>/` when a release completes.

Commit `.codex/launch/` — it is project knowledge, not scratch.

---

## Step 8 — Report the bootstrap

```
[BOOTSTRAP · <repo>]

STACK           <language/framework/db/deploy>
COMMANDS        <n> verified, <n> unverified, <n> missing
BASELINE        <the exact numbers, including the suppression count>
MONEY PATHS     <the four>
ENVIRONMENTS    <which exist>
PROJECT LAW     <AGENTS.md, tier-1 standards, design law, database law>

GAPS FOUND      ← the important part; these are findings, not chores
- <e.g. no down-migrations exist, so no migration rollback is possible>
- <e.g. no linter configured>
- <e.g. no staging Supabase project>
- <e.g. no monitoring or alerting configured>

RECOMMENDED     which gaps to close before the next release, ranked by what they cost at G7
```

**The gaps section is the point of the whole exercise.** Every gap is a gate that will block later,
and finding them on day one costs an hour while finding them at T-3 days moves the date.
