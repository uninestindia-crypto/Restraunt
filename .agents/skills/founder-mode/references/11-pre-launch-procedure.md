# 11 — Pre-launch Procedure

The single ordered entry point for a production release. It sequences the detail in `03-gates.md`,
`04-test-matrix.md`, `05-hardening.md`, and `06-launch-runbook.md`; it does not replace their exit
bars.

The verdict is binary:

- `READY`: every required step 1–14 passed against the same immutable revision.
- `BLOCKED`: any required result failed, was not tested, is stale, or lacks evidence.

Never use `READY WITH NOTES`. Record a tier-permitted `NOT APPLICABLE` with its reason and veto
holder. Never mark a money-path, role, RLS, data-integrity, migration, rollback, or production-safety
requirement not applicable merely to protect a date.

## Rules before starting

1. Read and apply `.agents/AGENTS.md`, `tier-1-engineering-standards`, and `taste-os-design` first.
2. Confirm the request authorizes the intended actions. A readiness review does not authorize repo
   writes, live migrations, deployments, alert drills, production access, or rollback.
3. Select the tier and name the veto holder for G7.
4. Discover and verify commands through `08-bootstrap.md`; never guess.
5. Create or update the evidence ledger only when project-state writes are authorized.
6. Redact secrets and personal data from every stored log.
7. Stop on the first required failure. Fix it, add a regression test, restart every affected
   downstream step on the new revision.

## The ordered procedure

### 1. Confirm scope and acceptance
Freeze scope and non-goals. Map every acceptance criterion and failure state to a test or human
check. Name the money paths and the success signal. Record tier, owners, veto holders, window, abort
condition, **and which of the three deploys this release needs.**
**Evidence:** approved scope, criteria-to-test map, money paths, named owners, deploy list.

### 2. Bind one source revision
Record the full commit and artifact digest. Verify a clean checkout. Reject evidence from another
revision. Freeze feature work.
**Evidence:** immutable revision, clean-tree output, digest, freeze log.

### 3. Prove clean setup and environment contracts
Install from the lockfile in a fresh environment. Validate toolchain versions. **Start from an empty
IndexedDB.** Validate every required config, key, quota, and origin without printing secrets. Build
and start the production artifact.
**Evidence:** commands, exit statuses, safe raw output, environment-contract result.

### 4. Run static and build checks (R0)
Typecheck, secret scan, dependency audit, migration validation, build.
**Require zero findings, and zero new `@ts-nocheck`.** Treat warnings hidden behind a zero exit code
as findings.
**Evidence:** output and finding counts for every configured R0 check.

### 5. Run unit tests (R1)
Every branch and boundary of changed domain logic; money, time, roles, stock, and idempotency with
the part-specific cases. Break one important implementation deliberately and confirm its test fails
before restoring it.
**Evidence:** passing results plus the watched-failure proof.

### 6. Run contract tests (R2)
Pin the role list in all three places, the RLS policies, the Dexie schema, the Edge Function
payloads, the route table, and the `orders` row shape. Test the role × screen matrix and cross-store
read *and* write isolation.
**Evidence:** contract output and the explicit role matrix.

### 7. Run integration and data tests (R3)
Real module wiring against real Dexie. Migrations from zero. Old bundle against new schema.
Transactions, concurrency, retries, duplicate delivery, partial failure. Execute the rollback in an
isolated realistic environment.
**Evidence:** integration output, migration transcript, rollback transcript, timings.

### 8. Run the money paths end to end (R4)
From an empty browser context, in a real runtime, across the configured viewports: guest order,
counter sale, kitchen flow, staff access. Verify success, the specified failure states, refresh and
retry behaviour, and the persisted result. Confirm the test fails when a critical step is broken.
**Evidence:** per-path transcript and persisted-state assertions.

### 9. Attack the integrated system (R5)
All twelve families, emphasising the seams. Inject Supabase timeouts, 401/429/500, RLS denials,
malformed data, dropped realtime, lost networks, duplicate actions, concurrent writes. Run
`/security-review` and the dependency and secret scans. Fix every finding with a regression test or
obtain written founder acceptance.
**Evidence:** ranked report, reproductions, dispositions, regression tests, `NOT PROBED` section.

### 10. Prove non-functional budgets (R6)
Latency, bundle size, memory, at realistic volume. Accessibility tooling plus the keyboard, zoom,
contrast, screen-reader, viewport, and motion checks. Timezone and currency formatting. Compare with
budgets written **before** the measurement.
**Evidence:** measured results against pre-agreed numbers.

### 11. Complete human QA (R7)
Customer Zero from an empty cart without the rehearsed path. Owner acceptance against the criteria
and `taste-os-design`. Real devices. Walk loading, empty, error, offline, stale, partial,
permission-denied, and overflow states. Confirm support can answer the five likely questions from the
docs alone.
**Evidence:** signoff, friction log, device matrix, accessibility walkthrough. Automated tests do not
substitute for this step.

### 12. Rehearse in a production-like environment
Deploy the exact candidate to staging with the required authorization. Run the money paths there with
production-like data volume. Time migrations and longest locks on a production-shaped copy. Rehearse
the numbered runbook and rollback with a **different actor** executing.
**Evidence:** staging revision, path output, timings, dry-run transcript.

### 13. Prove recovery and operational readiness
Capture baselines and set numeric promote/hold/rollback thresholds. Back up and restore into a
separate project. Fire every release-critical alert and confirm a named human receives it. Confirm
dashboards, logs, quotas, on-call, support brief, and the rollback decision maker. Confirm rollback
is still valid against production's current state.
**Evidence:** baselines, thresholds, restore proof, per-alert receipt, crew list, runbook.

### 14. Hold the go/no-go gate (G7)
Walk every G7 item and link its evidence. Zero open Blockers, zero unaccepted Majors. Every result
belongs to the frozen revision. Record `READY` or `BLOCKED`; never infer approval, never waive a gate
for the founder.
**Evidence:** signed decision record with revision, open risks, and all G7 links.

### 15. Launch in stages and watch (R8)
Only after step 14 is `READY` and deployment is authorized. Follow `06-launch-runbook.md`. Apply
migrations and functions **before** the web bundle. Smoke after every stage. Stop, hold, or roll back
the moment a threshold triggers. Preserve evidence before cleanup. Record T+1h through T+72h, then
complete G9.
**Evidence:** rollout timeline, smoke output per stage, metrics, incident log, watch log, postmortem.

## What testing means

Do not collapse these into one "QA" label:

| Discipline | Main question | Evidence |
|---|---|---|
| Static analysis | Can tooling find defects before execution — over code it actually reads? | R0 |
| Unit | Does isolated logic handle every branch and boundary? | R1 |
| Contract | Will boundaries stay compatible and authorized? | R2 |
| Integration | Do real modules, migrations, and constraints work together? | R3 |
| End-to-end | Can a person complete the money paths in the real runtime? | R4 |
| Adversarial | How does the integrated system break or get abused? | R5 |
| Non-functional | Does it meet measured performance and accessibility budgets? | R6 |
| Human QA | Can a stranger use it, and does the owner accept it? | R7 |
| Production | Does the released system stay healthy under real traffic and time? | R8 |

## Automated gate runner

Use `scripts/run-prelaunch-gates.mjs` for reviewed, deterministic R0–R6 commands only. Create
`.codex/launch/prelaunch-gates.json` from verified commands in `COMMANDS.md`, then:

```
node .agents/skills/founder-mode/scripts/run-prelaunch-gates.mjs \
  --root . --config .codex/launch/prelaunch-gates.json
```

Read every configured command before running. Put no secrets in the config. The runner verifies the
revision and a clean tree, refuses production environments and known destructive commands, runs gates
in file order, stores redacted output, and stops at the first failure. **Its safeguards are defense in
depth, not authorization.**

The runner proves only the automated portion of steps 3–10. Record `NOT TESTED` for every required
automated check with no configured command. Never let an automated `PASS` clear steps 1–2 or 11–15.

## Evidence ledger

`.codex/launch/PRELAUNCH.md`, one row per step:

```markdown
# PRE-LAUNCH — <release>

Revision: <full commit>       Artifact digest: <digest>
Tier: <T0-T4>                 Decision owner: <name>

| Step | Verdict | Owner | Evidence | Notes |
|---:|---|---|---|---|
| 1 | PASS | <name> | <link or output> | |
| 2 | BLOCKED | <name> | git could not identify HEAD | Stop here |
| 3-15 | NOT TESTED | | | Blocked by step 2 |

Overall: BLOCKED
```

Use only `PASS`, `BLOCKED`, `NOT TESTED`, or tier-permitted `NOT APPLICABLE`.

## Go or no-go

Declare `READY` only when the decision record answers all of these with evidence:

1. What exact revision and artifact will launch?
2. **Which of the three deploys does it need, and how will each be verified as landed?**
3. What scope and non-goals are frozen?
4. Which R0–R7 results passed on that revision?
5. Zero Blockers and zero unaccepted Majors?
6. What baselines and numeric thresholds control promotion and rollback?
7. How long did migration, rollback, restore, and alert delivery take in rehearsal?
8. Who executes, watches, decides rollback, communicates, and holds each veto?
9. What is the staged sequence and the 72-hour watch schedule?

If any answer is missing, stale, or qualitative where a number is required, declare `BLOCKED`.

## Tier scaling

Keep all fifteen rows visible at every tier so omissions cannot hide.

- **T0–T1:** compress unchanged areas. Run R0 and affected tests, smoke the affected money path,
  verify rollback and monitoring, explain each permitted `NOT APPLICABLE`.
- **T2:** run steps 1–11. If it enters production, also run 12–15.
- **T3:** all steps uncompressed with different Build, Break, and Prove actors.
- **T4:** all steps, twice where `10-scaling.md` requires independent verification, founder present
  at every gate.

Anything on a money path requires R0–R8 above T0. Tier changes ceremony, not the pass bar.
