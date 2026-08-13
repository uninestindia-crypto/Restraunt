# 04 — The Test Matrix

The question this file answers: **for this exact piece of code, what gets tested, how, how many
times, and what counts as passing?**

Nothing here is aspirational. Every row is a minimum, and a minimum is not a target.

---

## The 3-pass rule (Law 5)

| Pass | Actor | Question they answer | Output |
|---|---|---|---|
| **1. Build** | Staff Engineer | Does it do what the criteria say? | Tests written, tests green |
| **2. Break** | Red Team | What input makes it wrong? | Reproductions, ranked |
| **3. Prove** | Verifier | Is it still true from a clean state? | Raw output, PASS/BLOCKED |

For T2+, the same actor doing all three counts as **one** pass. For a T0–T1 solo exception, change
stance explicitly: pass 2 must design adversarial inputs, and pass 3 must delete derived state —
here that means an empty IndexedDB and a fresh `node_modules` — and rebuild from zero. Record the
exception; it cannot clear T2–T4.

---

## The nine rings, and what runs them here

| Ring | Name | Trigger | Exit bar | Command in this repo |
|---|---|---|---|---|
| **R0** | Static | Every file write | 0 errors, **0 new `@ts-nocheck`** | `npm run typecheck`, `npm audit`, `npm run db:validate` |
| **R1** | Unit | Every slice with logic | Every branch of domain logic | `npm test` |
| **R2** | Contract | Every slice touching a boundary | Every interface pinned by a test | `npm test` |
| **R3** | Integration | Every slice touching >1 module or Dexie | Real Dexie, real hydration path | `npm test` |
| **R4** | E2E | Every slice on a money path | The journey, in a real browser | `npm run test:e2e` |
| **R5** | Adversarial | Every slice, **and again** in P5 | The 12 families | manual + tests |
| **R6** | Non-functional | P5 | Perf, a11y, bundle, security | `npm run test:a11y`, build |
| **R7** | Human | P6–P7 | Customer Zero on a real phone | one session |
| **R8** | Production | P8–P9 | Smoke, monitors fired, 72h watch | `06-launch-runbook.md` |

### R0 — Static

`npm run typecheck` (tsc), `npm audit`, `npm run db:validate`, and a secret grep.

**The bar is zero findings.** A codebase with hundreds of tolerated errors has no static analysis —
it has a wall of noise hiding the one error that mattered.

**The suppression clause, specific to this repo.** `@ts-nocheck` at the top of a file removes it from
the check entirely. A green typecheck therefore proves nothing about a suppressed file. Two rules:

1. **Adding `@ts-nocheck` to a file is a gate failure**, not a workaround.
2. When you touch a suppressed file, remove the suppression and fix that file. The baseline shrinks
   monotonically; it never grows.

### R1 — Unit

Pure logic in isolation: no network, no Dexie, no clock, no randomness. If a function needs those,
inject them — untestable code is a design finding.

**Bar:** every branch of domain logic. For money, time, roles, and stock it is *every boundary of
every input*.

### R2 — Contract

Pin the shape of every boundary so a change is a *deliberate* act that breaks a test rather than an
accident that breaks production. In this product the boundaries that must be pinned are:

- **The role list**, in all three places it exists: `src/services/authGuards.ts`, the `staff-admin`
  Edge Function, and the Postgres CHECK constraint. A test asserts all three agree.
- **RLS policies** — which roles each policy names, asserted against the migration text.
- **The Dexie schema** — store names and indexes per version.
- **Edge Function payloads** — the exact body `staff-admin` and `public-order` accept.
- **`orders` row shape** — what the client writes vs. what the column accepts, including
  `image_url`'s 500-character limit.
- **Route registration** — every route's allowed-roles array, and every role's home route.

**Bar:** you cannot change a boundary without a test going red.

### R3 — Integration

Real Dexie through `fake-indexeddb`, real hydration, real `ensureFresh`; Supabase stubbed at the
`fetch` boundary — never at the function boundary, because mocking your own wrapper tests the
wrapper.

**Bar:** the paths that cross module lines work against a real datastore, including the offline
fallback and the reconnect reconciliation.

### R4 — End-to-end

The user's actual journey in a real browser, across the five configured viewports (Desktop Chrome,
iPhone SE, iPhone 15, Pixel 5, iPad).

**Bar:** every money path passes end to end **from an empty browser context** — no seeded Dexie, no
warm cache.

### R5 — Adversarial

Full catalog in `05-hardening.md`. Per slice on that slice's inputs, and again in P5 on the
integrated system with emphasis on the seams.

### R6 — Non-functional

Performance against a stated budget at realistic volume; accessibility; bundle size; security and
dependency scanning.

**Bar:** stated budgets met, with numbers. A budget invented after the measurement is not a budget.

### R7 — Human

Customer Zero on a real phone from an empty account; taste review against `taste-os-design`; support
readiness.

### R8 — Production

Post-deploy smoke; metrics vs. captured baseline; **every monitor fired on purpose**; the 72-hour
watch.

---

## Per-part-type requirements

Find the row for what you are building. If your work spans several rows, apply **all** of them —
requirements union, they do not average.

### Pure function / domain logic
**Rings:** R0 R1 R5
Happy path; every boundary of every input (empty, zero, one, max, max+1, negative, null); every
error branch asserting the *specific* error; round-trip both directions if it parses or formats;
empty/single/all-identical/already-sorted if it sorts or groups.

### Money: totals, tax, discount, change, takings
**Rings:** R0 R1 R2 R5 — **always critical path**
Everything above, plus: rounding at every boundary; the smallest unit; zero, negative, and maximum;
**idempotency** (the same payment applied twice produces one effect); **replay** (a duplicated push
does not double-charge); partial payment and split bills; over-tender and change; a 100% discount;
reconciliation — the sum of line items equals the order total, and the sum of orders equals the day's
takings, both asserted as tests. **Never floating-point money.** **Never arithmetic on a value typed
`string | number`.**

### Date, time, service day
**Rings:** R0 R1 R5
An order at 23:59 and one at 00:01 — which service day each lands in, on the device and in Postgres;
a device whose clock is an hour wrong; the boundary of `getTodayStats()`; IST (UTC+5:30) against a
UTC server; a shift that spans midnight.

### Auth, roles, RLS, store isolation
**Rings:** R0 R1 R2 R3 R5 — **always critical path, no exceptions**
Every one of the eight roles × every screen × every action, as a table-driven test; unauthenticated
access to every staff route; **cross-store read AND cross-store write, tested separately**; ID
enumeration; expired, revoked, and downgraded sessions; privilege escalation (self-assign a role,
create a developer, demote the last owner); the indirect path — a count, a search, an export, or an
analytics total that includes rows the role cannot list.

### Sync: `syncUp*`, `pushUnsynced`, `ensureFresh`, hydration
**Rings:** R0 R1 R2 R3 R5 — **always critical path in this product**
Offline write then reconnect; a failed push marked pending and retried; a push that the server
refuses permanently (RLS) surfaced rather than looped; a stale push against a newer server row;
hydration arriving while a local write is queued; the realtime echo of your own write; two devices
writing the same row; a missing table (`PGRST205`) tolerated; `lastSyncError` set and cleared.

### Dexie schema / Supabase migration
**Rings:** R0 R2 R3 R5 R6
Empty store; one row; production-scale row count, timed; migration run forward from zero;
**rollback executed**, not merely written; old code against the new schema (this is what a rolling
deploy actually is); an old tab on the previous Dexie version while a new tab upgrades; constraint
violations each producing a *handled* error.

### UI view / component
**Rings:** R0 R1 R5 R7
All nine states (Law 6) — default, loading, empty, error, partial/stale, disabled, **offline**,
permission-denied, too-much-data — plus keyboard reachability, an accessible name on every control,
320px, long content (a 200-character dish name, a 500-row list), reduced motion, contrast at 4.5:1
for text under 18.66px, double-tap the submit button, back/forward/refresh mid-flow. **Every
`innerHTML` interpolation escaped.** **If a design law skill exists, its checklist is part of this
ring** — it does.

### Edge Function
**Rings:** R0 R2 R3 R5
Unauthenticated; authenticated as the wrong role; malformed body; missing fields; oversized payload;
replay of the same request; the CORS origin restriction; every documented error actually returned by
some test.

### Third-party: Supabase, Storage, printer
**Rings:** R0 R2 R3 R5 R6
Success; 400; 401; 403; 429; 500; timeout; malformed body; HTML instead of JSON; **provider
entirely unreachable**; credentials expired mid-session; degraded mode engages *and recovers*. For
the printer: no device, device disconnected mid-receipt, permission denied.

### Anything on a money path
**Rings:** R0 through R8, all of them, no exceptions, at every tier above T0.

---

## The per-slice test budget

For a typical T2 slice, this is what "enough" looks like. Numbers are minimums.

| Ring | Cases | Who | When |
|---|---|---|---|
| R0 | 1 full run, 0 findings | Builder | Every save; again before the gate |
| R1 | 5–20 per unit of logic | Builder | During build |
| R2 | 1 per boundary crossed | Builder | During build |
| R3 | 2–5 per cross-module path | Builder | End of build |
| R4 | 1 per money path touched | Builder | End of build |
| R5 | 12 families, ~30 probes | **Red Team** | After build |
| — | + 1 regression test per finding | Builder | After red team |
| R0–R4 | **Full re-run from clean state** | **Verifier** | Gate |

**If your slice has six tests, you have not tested it — you have demonstrated it.**

---

## Test quality — the tests themselves are code that can be wrong

1. **Every test must be able to fail.** Break the implementation deliberately and confirm the test
   goes red. Do this once per slice, on the most important test.
2. **Assert on values, not on absence of exceptions.**
3. **No conditional logic in tests.** An `if` in a test means it can silently assert nothing.
4. **One reason to fail per test.** The name should tell you what broke.
5. **No shared mutable state**; tests must pass in random order.
6. **Do not mock what you are testing.** Stub at the `fetch` boundary, not at `cloudDb`'s.
7. **Fixed clock, fixed seed, fixed IDs.**
8. **A flaky test is a failing test.** Fix it or delete it. Never re-run until green.
9. **Test names state the behavior**: `a queued offline push does not resurrect a cancelled order`,
   not `test sync 3`.
10. **The bug-to-test ratio.** Every bug found anywhere produces a test that fails without the fix.
    No exceptions. This is what stops the codebase re-breaking the same way forever.

**A note on this repo's test style.** Many tests assert on *source text* — that a guard exists, that
a policy names a role, that a call is ordered before a toast. That is legitimate for pinning
structural invariants a runtime test cannot reach (an RLS policy, a role list in three places, an
ordering constraint inside a UI handler). But it is weaker than a behavioural test: it proves the
code says something, not that it does something. Prefer behaviour where a behavioural test is
possible, and keep the source-text assertions for invariants that genuinely have no runtime seam.

---

## Coverage: what to measure and what to ignore

- **Ignore the global coverage percentage.** Trivially gamed, tells you nothing.
- **Do measure coverage on the money paths**, and require it to be complete there. Uncovered lines
  in totals, roles, or migrations are gate failures.
- **The real metric is escaped defects**: bugs found in P5+ that R1–R4 should have caught. Every
  escape names a missing ring for a part type — write it into this matrix so the next release
  catches it.
