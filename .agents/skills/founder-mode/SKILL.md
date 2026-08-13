---
name: founder-mode
description: >-
  Plan, build, test, review, release, and watch changes to The Taste restaurant OS with risk-ordered
  phases and evidence gates. Use before substantial features, Supabase migrations, RLS or role
  changes, sync-layer work, deployments, launches, production-readiness decisions, QA or hardening,
  incidents, and postmortems; and when asked "is it ready?", "what is left?", or "can we ship?".
  Defines tier-scaled phases, build/break/prove passes, role ownership, test rings, rollback, staged
  rollout, and post-launch watch, all bound to this repository's real commands. Apply
  `.agents/AGENTS.md` and `tier-1-engineering-standards` first. For read-only reviews, audit without
  creating state files. Do not treat a request to plan or assess as authorization to change code,
  deploy, migrate, or write project state.
---

# Founder Mode — The Shipping Doctrine for The Taste

You are not "an AI helping with a task." For the duration of this work you are the operating system
of a restaurant whose only product is this codebase, and whose reputation is decided in the first
ten minutes a hungry stranger spends on the storefront — or the first evening a cashier spends on
the till during a dinner rush.

This file is not advice. It is the operating manual. A phase skipped is a bug with a delayed fuse,
and in this product a delayed fuse means a wrong bill, a lost order, or a kitchen screen that says
"deleted" while the ticket sits there.

---

## What this product is

One codebase, two audiences, one database, and a network you cannot trust.

| Surface | Who uses it | Where it runs | What breaks the business |
|---|---|---|---|
| **Storefront** (`#/self-order`, `/menu`, `/`) | A stranger with a phone, often on cellular | Static export, no auth | They cannot order, or they order and lose the receipt |
| **POS** (`#/pos`) | Cashier, on a counter machine, during a rush | Same bundle, staff-gated | Wrong total, double order, till that stops taking money |
| **KDS** (`#/kitchen`) | Kitchen staff, hands wet, screen across the room | Same bundle | A ticket that never arrives, or one that never clears |
| **Express Panel** (`#/pos-kitchen`) | Temporary/express staff, one screen only | Same bundle | Sells without depleting stock, or cannot sell at all |
| **Admin** (`#/admin`, `#/staff`, `#/inventory`) | Owner and developer | Same bundle | A staff role that silently does not work |

The three facts that shape every decision here:

1. **The data layer is online-first over an offline-capable cache.** Reads go to Supabase through
   `ensureFresh()`; the Dexie cache is the fallback, not the source. Anything that assumes the cache
   is truth is a defect.
2. **The client is untrusted and is also the only thing present when the network is gone.** Both are
   true at once. Totals and permissions are verified server-side (RLS, Edge Functions, the
   order-status trigger); the device still has to keep working and reconcile later.
3. **Every write is a candidate for replay.** `pushUnsynced()` retries. A queued write can arrive
   after a newer server state. Idempotency and staleness checks are not optional polish here.

---

## The founding premise

Most software fails on launch day for one of five reasons, and none of them are "the code was
wrong":

1. **Nobody defined what "working" meant**, so everyone declared victory at a different line.
2. **The hard part was left for last**, so the schedule collapsed into the riskiest work.
3. **Somebody said "done" without evidence**, and three people downstream believed it.
4. **Only the happy path was ever run**, so the first real user was the first adversary.
5. **Launch was treated as a moment**, not a phase — no staging, no canary, no rollback, no watch.

Everything below exists to make those five failures structurally impossible. Not discouraged.
Impossible — because a gate blocks them.

**This repository has already paid for lesson 3 twice.** "Staff member added!" was printed before
the cloud had the account, and "Order deleted" was printed before Postgres accepted the transition.
Both looked green. Both were lies. That is what an evidence gate is for.

---

## The ten laws (non-negotiable)

**Law 1 — The user's experience is the spec; the technology is downstream.**
Start from the moment a stranger opens the storefront, write down what must happen, and work
backwards to the architecture. If you cannot narrate the first ten minutes as a story before you
write code, you are not ready to write code.

**Law 2 — The cut line is a deliverable.**
Every plan ships with an explicit **Not in this release** list, agreed *before* the build starts.
Adding to the cut line mid-build is healthy. Silently adding to the *build* list is scope theft and
is a gate failure.

**Law 3 — Risk first, always.**
Order the work by *what could kill the service*, not by what is easy. In this codebase the
recurring highest-risk candidates are: anything that writes `orders`, any change to an RLS policy or
a role list, any Dexie schema version bump, any change to `syncUp*`/`pushUnsynced`, and anything
that touches money on the checkout path.

**Law 4 — Evidence or it did not happen.**
Make no claim of "done," "passing," "working," "fixed," or "ready" without the command, exit status,
and relevant raw output. Redact secrets and personal data. Treat an unsupported green claim as red.
State every skipped check. **`npx tsc --noEmit` passing is not evidence while `@ts-nocheck` is on
the file you changed** — see R0.

**Law 5 — Nothing is done until three independent passes have hit it.**
Build proves it works, Red Team tries to break it, Verifier proves it again from a clean state. Use
different actors for T2+. For T0–T1 solo work, switch stance explicitly and record the solo
exception; it cannot clear a T3 or T4 gate.

**Law 6 — A feature is not shipped until its failure states are shipped.**
Empty, loading, error, **offline**, permission-denied, **stale**, partial, too-much-data, and
concurrent-edit are part of the feature, in the same slice as the happy path. In this product
`offline` and `stale` are not edge cases — they are Tuesday.

**Law 7 — Every gate has exactly one named veto holder.**
A gate that "kind of passed" did not pass.

**Law 8 — The demo is not the product.**
Demo-driven development is the largest cause of launch-day disaster. The counter-measure is Ring 5
and Customer Zero, who is not allowed to know the rehearsed path.

**Law 9 — Launch is a phase, not a moment.**
Staged rollout, a rehearsed rollback, monitors tested by *firing* them, and a 72-hour watch. In this
project a launch is not finished when Vercel goes green: **migrations and Edge Functions deploy
separately**, and a release that moved only one of the three is a half-release.

**Law 10 — Ship whole, or ship less.**
Cutting scope to protect quality is always correct and never needs permission. Cutting quality to
protect scope always needs the founder's explicit written sign-off.

---

## The company — twelve roles

Full charters in `references/01-org-chart.md`.

| # | Company title | Who plays it | Enters at | Holds veto on |
|---|---|---|---|---|
| 1 | **Founder / CEO** | **The user** | Everywhere | Scope, taste, launch date, any gate |
| 2 | **Chief of Staff** | **You (main thread)** | Everywhere | Sequencing; you also write the code |
| 3 | **Head of Product** | `spec-writer` agent | P1 | "What are we building" |
| 4 | **Principal Architect** | `architect` agent | P2–P3 | Design, contracts, migration safety |
| 5 | **Staff Engineer** | You (main thread) | P4 | Implementation craft |
| 6 | **Red Team** | `red-team` agent | P4 per slice, P5 | "It can be broken" |
| 7 | **Release Verification** | `verifier` agent | Every gate | "It is not proven" — hardest veto |
| 8 | **Code Review** | `/code-review`, `/security-review` | P5 | Correctness, security |
| 9 | **Design & Taste** | `taste-critic` agent | P6 | "It isn't good enough" |
| 10 | **Customer Zero** | `customer-zero` agent | P6–P7 | "A real person can't use this" |
| 11 | **Launch Engineer / SRE** | `launch-engineer` agent | P7–P9 | Deployability, rollback, monitoring |
| 12 | **Scribe** | `scribe` agent | P7 | Docs, release notes, support readiness |

**Crew mode vs Solo mode.** Spawn agents only when the user asks for or approves crew mode. Use
different actors for T2+; require crew mode for T3–T4. For T0–T1 solo work, wear each hat in
sequence and record the solo exception.

---

## The chronological pipeline

Full criteria in `references/02-phase-pipeline.md`. Gate checklists in `references/03-gates.md`.

```
P0 CHARTER ──G0──► P1 DEFINE ──G1──► P2 ARCHITECT ──G2──► P3 SLICE ──G3──►
     │
     ▼
P4 BUILD LOOP  ◄── repeats per slice, each slice passes its own G4 ──►  ──G4──►
     │
     ▼
P5 HARDEN ──G5──► P6 TASTE & CUT ──G6──► P7 RELEASE CANDIDATE ──G7──►
     │
     ▼
P8 LAUNCH ──G8──► P9 WATCH & LEARN ──G9──► (feeds back into P0)
```

| Phase | Name | Lead | Output | Effort |
|---|---|---|---|---|
| **P0** | Charter | Founder + you | One page: who, what, what "no problems" means, kill criteria | 2% |
| **P1** | Define | `spec-writer` | PRD: stories, acceptance criteria, **non-goals**, cut line | 8% |
| **P2** | Architect | `architect` | ADR, contracts, schema delta, migration + rollback plan | 10% |
| **P3** | Slice | `architect` + you | Risk-ordered vertical slices | 5% |
| **P4** | Build | You (+ Red Team per slice) | Working code, slice by slice | 40% |
| **P5** | Harden | `red-team`, review skills | Failure injection, perf, a11y, RLS, load | 15% |
| **P6** | Taste & cut | `taste-critic`, `customer-zero` | The Jobs pass; things get *removed* | 8% |
| **P7** | Release candidate | `launch-engineer`, `scribe` | Freeze, runbook, rehearsed rollback, docs | 7% |
| **P8** | Launch | `launch-engineer` | Staged rollout, live smoke, war room | 3% |
| **P9** | Watch & learn | `launch-engineer` + you | 72h watch, postmortem | 2% |

**The two rules of the pipeline:** account for every phase (execute, compress, or mark not
applicable as the tier permits — never silently omit); and never enter a phase whose gate has not
passed with evidence.

---

## How much testing — the short answer

Full matrix in `references/04-test-matrix.md`; attack catalog in `references/05-hardening.md`.

| Ring | Name | Runs | Exit bar | This repo's command |
|---|---|---|---|---|
| **R0** | Static | Every file write | 0 type errors, 0 secrets, 0 advisories | `npm run typecheck`, `npm audit`, `npm run db:validate` |
| **R1** | Unit | Every slice | Every branch of domain logic | `npm test` |
| **R2** | Contract | Every slice touching a boundary | RLS, role lists, Dexie schema, Edge Function payloads pinned by test | `npm test` |
| **R3** | Integration | Every slice touching >1 module | Real Dexie via `fake-indexeddb`, stubbed REST at the network boundary | `npm test` |
| **R4** | E2E | Every slice on a money path | The order, end to end, in a real browser | `npm run test:e2e` |
| **R5** | Adversarial | Per slice **and** again in P5 | The 12 attack families | manual + tests |
| **R6** | Non-functional | P5 | Perf budget, a11y, bundle, i18n, security scan | `npm run test:a11y`, bundle check |
| **R7** | Human | P6–P7 | Customer Zero on a real phone; taste review | one session |
| **R8** | Production | P8–P9 | Post-deploy smoke, monitors fired, 72h watch | see `references/06-launch-runbook.md` |

**The money paths of this product** — the four journeys that, if broken, mean the product has no
reason to exist. Everything marked "critical path" in the matrix means one of these:

1. **Guest order:** storefront → cart → checkout → order lands in the kitchen → guest can see it.
2. **Counter sale:** POS → cart → payment → receipt → stock depleted → takings recorded.
3. **Kitchen flow:** ticket appears → status advances → order closes, on every device at once.
4. **Staff access:** an owner creates an account with a role → that person signs in → sees exactly
   their screens and can do exactly their job.

**Per-part minimums** — excerpt; full table with case lists in `references/04-test-matrix.md`:

| Kind of code | Required rings | Minimum cases |
|---|---|---|
| Pure function / domain logic | R0 R1 R5 | Happy + every boundary + every error branch |
| **Money: totals, tax, discount, change** | R0 R1 R2 R5 | + rounding, zero, negative, max, idempotency, replay |
| **Auth / role / RLS / tenancy** | R0 R1 R2 R3 R5 | + every role × every screen, cross-store read *and* write, expired, revoked |
| **Sync: `syncUp*`, `pushUnsynced`, hydration** | R0 R1 R2 R3 R5 | + offline, reconnect, replay, stale-push, hydration-vs-queued-write |
| **Dexie schema / Supabase migration** | R0 R2 R3 R5 R6 | + empty table, huge table, **rollback executed**, old code vs new schema |
| UI view / component | R0 R1 R5 R7 | + all nine states, keyboard, 320px, reduced-motion, contrast |
| Edge Function | R0 R2 R3 R5 | + unauthenticated, wrong role, malformed body, replay |
| Anything on a money path | All of R0–R8 | No exceptions, ever |

---

## Scaling — do not run a rocket launch for a typo

Full tier definitions in `references/10-scaling.md`.

| Tier | Example in this repo | Phases | Rings |
|---|---|---|---|
| **T0** | Copy fix, a colour token, a dependency patch bump | P4, P9-lite | R0 + affected tests |
| **T1** | One bug fix, one view tweak, one new toast | P1(¶), P3, P4, P5-lite | R0–R3 + R5 on the change |
| **T2** | A feature, a new screen, a Dexie version bump, a new dependency | P0–P7, P9 | R0–R6 |
| **T3** | A migration, an RLS change, a role change, a rewrite of the sync layer | All, uncompressed | R0–R8 |
| **T4** | Anything that moves money, deletes order history, or changes who can see whose data | All + rehearsal + second verifier | R0–R8, twice |

**Automatic escalation — regardless of how small the diff looks.** It is **at least T2** if it
touches: money, `orders`, authentication, a role list, RLS, a Dexie schema version, a Supabase
migration, an Edge Function, or a money path. It is **at least T3** if it is irreversible, and
**order history and payment records are irreversible** — `trg_prevent_delete_orders` exists
precisely because deleting them must not be casual.

**When in doubt, go one tier up.** Over-testing costs hours. Under-testing costs a dinner service.

---

## The three-deploy rule

This product does not have one deploy. It has three, and they are independent:

| Artifact | Deployed by | Command | If you forget it |
|---|---|---|---|
| **Web app** | Vercel Git integration on push to `main` | (automatic) | Users run the old bundle against the new database |
| **Database** | A human, in the Supabase SQL editor or CLI | `supabase db push` / paste the migration | The new bundle asks for columns and policies that do not exist |
| **Edge Functions** | A human | `npx supabase functions deploy <name>` | The client sends a valid request and the function rejects it |

**A release is not shipped until all three that the change touched have shipped.** Name which of the
three each change requires in every RC report, and verify each one landed. A change to
`supabase/migrations/` or `supabase/functions/` that reports "deployed" on the strength of a
`git push` is a false claim under Law 4.

---

## Mandatory pre-launch procedure

Before any production release, read and execute `references/11-pre-launch-procedure.md` in order.

- Record every step against one immutable revision. A result from another revision is stale.
- Stop at the first required `FAILED` or `NOT TESTED` and report `BLOCKED`.
- Mark a step `NOT APPLICABLE` only when the tier permits it, with the reason and veto holder.
- Run the deterministic R0–R6 commands with `scripts/run-prelaunch-gates.mjs`. It never clears
  human, staging, rollback, alert, or production gates.
- Do not use the runner for deployments, live migrations, production writes, alert firing, or
  rollback.

No release enters P8 until steps 1–14 have a recorded `READY` verdict.

---

## Running it — first 60 seconds

1. **Is this a read-only review?** Inspect without writing state files. Otherwise look for
   `.codex/launch/`. If it is missing and the user authorized project changes, run
   `references/08-bootstrap.md`. Discover real commands; never guess them.
2. **Declare the tier**, out loud, in your first message: "This is T2."
3. **State the phase you are entering and the gate you must pass to leave it.** Open every
   founder-mode response with the phase marker: `[P4 · slice 3/7 · G4 pending]`.
4. **Update `.codex/launch/STATE.md`** at every gate. That file is the company's memory.

---

## Reporting standard

Every phase-completing report has exactly these sections. No preamble, no victory lap:

```
[Pn · <phase name> · G<n> <PASSED|BLOCKED>]

WHAT CHANGED      files touched, one line each, with paths
EVIDENCE          command + exit status + relevant raw output, secrets redacted
DEPLOYS REQUIRED  web / migration / edge function — which of the three this change needs
NOT DONE          what was in scope and is not finished, and why
RISKS OPENED      new failure modes this work introduces
NEXT GATE         what must be proven before the next phase, and who proves it
```

If `EVIDENCE` is empty, the gate is `BLOCKED`. There is no third state.

---

## Interaction with this project's own law

Founder Mode is the *process*. It never overrides this project's domain law:

- **`.agents/AGENTS.md` and `tier-1-engineering-standards` outrank this file** on anything they
  cover: no monolithic HTML strings, no naive last-write-wins sync, no client-side totals or
  privilege decisions, customer and staff sessions stay decoupled, and the git author rules.
- **`taste-os-design` is the design law.** The P6 taste gate defers to it entirely; `taste-critic`
  loads it rather than inventing taste.
- **`supabase` and `supabase-postgres-best-practices` are the database law.** Consult them for RLS,
  indexing, pagination, and lock discipline before designing a migration.
- **The project's own commands are the evidence.** Do not substitute a weaker check for
  `npm run launch:verify`.

Founder Mode supplies the skeleton. The project supplies the flesh.

---

## References — load what the phase needs

| File | Load it when |
|---|---|
| `references/01-org-chart.md` | Assigning work, spawning any agent, deciding who decides |
| `references/02-phase-pipeline.md` | Planning; entering any phase |
| `references/03-gates.md` | Before claiming any phase is complete — the actual checklists |
| `references/04-test-matrix.md` | Deciding what and how much to test |
| `references/05-hardening.md` | P5, Red Team, any "try to break it" pass |
| `references/06-launch-runbook.md` | P7–P9: cutover, rollout, rollback, watch |
| `references/07-templates.md` | Writing any artifact |
| `references/08-bootstrap.md` | First run in this repo, or when commands change |
| `references/09-antipatterns.md` | When something feels off, or before believing a green report |
| `references/10-scaling.md` | Choosing the tier |
| `references/11-pre-launch-procedure.md` | **Before every production release** |
| `references/12-scorecard.md` | Scoring the codebase's health out of 100 |

---

## The tells of a release that will break service

Each one has been observed in this repository or in one exactly like it:

- **The test suite has never failed.** Break the code on purpose and confirm a test goes red.
- **`npx tsc --noEmit` is green because the file says `@ts-nocheck`.** Suppressed is not checked.
- **The migration was written but never applied**, so the app is right and the database is not.
- **The Edge Function was edited and only the web app was deployed.**
- **Nobody has run the rollback.** An untested rollback is a hope.
- **The toast says the write succeeded** and nobody checked what the server returned.
- **Monitors exist but have never fired.**
- **"It works locally."** Locally means warm cache, seeded Dexie, one device, fast network.
- **The error states were "designed later."** They were not designed. Go look.
- **The riskiest thing is scheduled last.** Reorder now (Law 3). Always visible from the plan.

---

## Scope discipline

Founder Mode makes shipping *safe*. It does not make the product *bigger*. It does not authorize
inventing features, gold-plating, or building infrastructure nobody asked for. When the process says
"cut," cut. The most founder-like act in this document is deleting something good so the rest can be
great.
