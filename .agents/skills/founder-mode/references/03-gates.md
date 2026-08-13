# 03 — The Gates

A gate is a checklist plus a named veto holder plus required evidence. Gates are the entire reason
this process works: without them, "we'll come back to it" quietly becomes "we never did."

**Three rules for every gate:**

1. **PASS or BLOCKED. There is no third verdict.** Not "passed with notes," not "passed pending."
   A gate that partly passed is BLOCKED, and BLOCKED is a normal, healthy, frequent outcome.
2. **Evidence is output, not a claim.** Record the command, exit status, and relevant raw output.
   Redact secrets and personal data. `NOT TESTED` counts as `FAILED` for gate purposes.
3. **Only the founder may override a gate**, explicitly, in writing, with the risk they are
   accepting stated back to them in one sentence. Record the override in `STATE.md`. Never override
   a gate on the founder's behalf because you inferred they would want it.

**Recording.** When project-state writes are authorized, record every gate result in
`.codex/launch/STATE.md`:

```
G5  BLOCKED  2026-08-13  verifier
  FAILED: R5 — a queued offline order push resurrected a cancelled order (repro in red-team-3.md)
  FAILED: R6 a11y — bottom-nav active label 4.45:1 against its own pill, needs 4.5:1
  PASSED: everything else
  ACTION: back to P4 for slices 2 and 5
```

## Contents

- [G0–G3: charter through slicing](#g0--charter-gate)
- [G4–G6: build, hardening, and taste](#g4--slice-gate)
- [G7–G9: release, launch, and watch](#g7--release-candidate-gate)
- [Gate arithmetic](#gate-arithmetic--what-blocked-costs)

---

## G0 — Charter gate

**Veto holder.** Founder.

| # | Check | Evidence |
|---|---|---|
| 0.1 | The intent, restated in your words, has been confirmed by the founder | Their confirmation |
| 0.2 | The primary user is a specific role in a specific situation — "a cashier at 8pm on a Saturday", not "users" | CHARTER.md |
| 0.3 | "No problems for users" is operationalized: what must never happen, what must always work, what may be imperfect | CHARTER.md |
| 0.4 | Tier declared (T0–T4), with the automatic-escalation list checked | Stated in the response |
| 0.5 | Kill criteria written while nobody is invested | CHARTER.md |
| 0.6 | The first ten minutes of a stranger's experience is narrated as prose | CHARTER.md |
| 0.7 | **Which of the three deploys this will need** — web, migration, Edge Function | CHARTER.md |

**Most common failure.** Skipping 0.3 because it feels obvious. It is never obvious, and it is the
sentence the whole release is judged against. For this product the honest version of 0.3 usually
reads: *never take money and lose the order; always let the kitchen see a paid ticket even when the
network is gone; it is acceptable for analytics to lag.*

---

## G1 — Definition gate

**Veto holder.** Head of Product (`spec-writer`).

| # | Check | Evidence |
|---|---|---|
| 1.1 | Every acceptance criterion is Given/When/Then and machine- or checklist-verifiable | PRD.md |
| 1.2 | Zero unquantified adjectives survive ("fast", "intuitive", "modern", "seamless") | PRD.md, grep it |
| 1.3 | Non-goals list exists and is **not empty** | PRD.md |
| 1.4 | Every story has its failure states specified: empty, error, **offline**, unauthorized, slow, **stale**, partial, too-much-data, concurrent | PRD.md |
| 1.5 | One success metric, measurable post-launch | PRD.md |
| 1.6 | Ambiguity log written; blocking ambiguities resolved with the founder | PRD.md |
| 1.7 | Criteria describe user outcomes, not implementation — "returns 201" is a fail | Read them |
| 1.8 | If it touches a role, **every one of the eight roles** has a stated expected behaviour | PRD.md |

**Blocking question if unsure.** "Could a tester who has never spoken to us determine pass/fail from
this document alone?" If no, BLOCKED.

---

## G2 — Architecture gate

**Veto holder.** Principal Architect (`architect`).

| # | Check | Evidence |
|---|---|---|
| 2.1 | Existing code was read; the design follows existing patterns or states why it departs | ADR |
| 2.2 | An ADR exists for every hard-to-reverse decision, with the rejected alternative named | ADR files |
| 2.3 | Every boundary has an exact contract: Supabase table/columns, RLS predicate, Edge Function payload, Dexie store, event shape, error taxonomy | ARCHITECTURE.md |
| 2.4 | Migration plan exists **and** a rollback plan exists **and** the rollback is rehearsable | ARCHITECTURE.md |
| 2.5 | Failure behavior specified per dependency: Supabase down, slow, 401, RLS-denied, realtime channel dropped | ARCHITECTURE.md |
| 2.6 | Observability designed with the feature: what is logged, what the operator sees, what `lastSyncError` will say | ARCHITECTURE.md |
| 2.7 | Permission model stated as a role × screen × action matrix, with the test that will prove it | ARCHITECTURE.md |
| 2.8 | New dependencies justified: what they replace and their operational cost | ADR |
| 2.9 | **Cache-coherence stated**: does hydration overwrite this, and does `hasUnpushedLocalEdit` cover it? | ARCHITECTURE.md |
| 2.10 | **Additive-only check** on any migration that touches existing data, or an explicit backfill plan | ARCHITECTURE.md |

**Hard stop.** No rollback plan → BLOCKED. If rollback is genuinely impossible, the design needs a
feature flag or a dual-write period; that is an architecture problem to solve here, not a launch
problem.

**This project's specific trap.** A migration is not additive just because it only runs `create`.
Replacing a CHECK constraint, a policy, or a trigger changes behaviour for rows that already exist.
Say which existing rows are affected, in numbers.

---

## G3 — Slice gate

**Veto holder.** Architect + you.

| # | Check | Evidence |
|---|---|---|
| 3.1 | Every slice is **vertical** — ends in something a human can see, run, or call | SLICES.md demo column |
| 3.2 | Slice 1 is genuinely the highest-risk work, not the easiest | Justify it in one line |
| 3.3 | No slice is larger than one working session including its tests | Size estimate per slice |
| 3.4 | Every slice has its required test rings assigned from the part-type table | SLICES.md rings column |
| 3.5 | Dependencies between slices mapped | SLICES.md |
| 3.6 | Total scope still matches the PRD's cut line — nothing crept in | Diff against non-goals |
| 3.7 | Each slice names which of the three deploys it needs | SLICES.md |

**The question that catches the common failure.** "If slice 1 turns out to be impossible, do we find
out in week one or week eight?" Week eight → the order is wrong → BLOCKED.

---

## G4 — Slice gate

Runs once per slice, and again at the end of P4. **Veto holder:** `verifier`. This gate runs the
most often and catches the most.

| # | Check | Evidence |
|---|---|---|
| 4.1 | R0 static: 0 type errors **with no new `@ts-nocheck`**, 0 secrets, 0 advisories, migrations validate | Raw output |
| 4.2 | All rings required by this slice's part types pass | Raw output per ring |
| 4.3 | Every acceptance criterion for this slice demonstrably met | The demo, run |
| 4.4 | **Every failure state from the PRD is implemented**, not stubbed — including offline and stale | Show each one |
| 4.5 | Red Team pass performed; 0 Blockers, 0 unresolved Majors | Red team report |
| 4.6 | Every bug found has a regression test that fails without the fix | The test, and its failure |
| 4.7 | No TODOs, stubs, hardcoded values, or commented-out code left in the slice | grep the diff |
| 4.8 | **Verified from a clean state** — fresh deps, fresh Dexie, migrations from zero | Full raw output |
| 4.9 | STATE.md and SLICES.md updated | The files |
| 4.10 | If the slice touched a role, the role × screen matrix test still passes for all eight | Test output |

**4.8 is the one people skip and the one that catches the most.** In this product "clean state" has a
specific meaning: a browser profile with an **empty IndexedDB**, because a seeded Dexie hides every
online-first regression. `npm test` uses `fake-indexeddb` for exactly this reason; the E2E suite must
start from a fresh context.

---

## G5 — Hardening gate

**Veto holder.** Red Team (Blockers) + `verifier` (evidence).

| # | Check | Evidence |
|---|---|---|
| 5.1 | All twelve attack families run against the **integrated** system | Red team report |
| 5.2 | Seams between slices specifically attacked | Named in the report |
| 5.3 | Concurrency: same order, two devices, same moment — tested on every mutating path | Test output |
| 5.4 | Failure injection: Supabase unreachable, slow, 401, RLS-denied, realtime dropped, network lost mid-checkout | Per-case results |
| 5.5 | Every injected failure fails **safely, visibly, recoverably** — no silent data loss, no half-committed order | Per-case results |
| 5.6 | Performance measured against the budget at realistic data volume | Numbers, not impressions |
| 5.7 | Accessibility checked on all five viewport projects | `npm run test:a11y` output |
| 5.8 | **Offline soak**: go offline, work a full service, come back, reconcile | Transcript + row counts |
| 5.9 | Security review + dependency and secret scan clean | Tool output |
| 5.10 | Migration rehearsed against a production-shaped copy and **timed**; rollback rehearsed and timed | Both timings |
| 5.11 | 0 Blockers. Every Major fixed with a regression test, or founder-accepted in writing | Report + signoff |
| 5.12 | **The suite was re-run after the fixes** | Final raw output |

**5.12 catches the sneakiest failure**: a hardening pass that finds and fixes fourteen things and
never re-runs has proven nothing about the fourteen fixes — and fixes made under time pressure are
exactly the code most likely to be wrong.

**5.8 is this product's signature test** and it is the one nobody does. It is also where the sync
layer's real defects live: stale pushes, resurrected orders, hydration clobbering queued writes,
order-number collisions.

---

## G6 — Taste gate

**Veto holder.** `taste-critic` + `customer-zero`. Overridable only by the founder.

| # | Check | Evidence |
|---|---|---|
| 6.1 | The product was **run and looked at**, on a real phone, with realistic data | Screenshots or transcript |
| 6.2 | The `taste-os-design` skill was loaded and applied as the standard | Its checklist, walked |
| 6.3 | **Remove list produced and executed.** Empty remove list = the pass did not happen | The list + what was cut |
| 6.4 | Every empty state, error message, and loading state reviewed as designed copy | Per-state review |
| 6.5 | Customer Zero ordered a meal **unaided, from an empty account**, no rehearsed path | Friction log |
| 6.6 | Customer Zero's "worst moment" is fixed, cut, or documented as a known limitation | Disposition per item |
| 6.7 | Founder has seen it and said yes | Their words |

**The question this gate exists to force.** Not "does it work" — G5 answered that. It is: *is this
good, or is it merely finished?*

---

## G7 — Release candidate gate

**Veto holder.** `launch-engineer` + `verifier`. **The strictest gate in the process.**

| # | Check | Evidence |
|---|---|---|
| 7.1 | Feature freeze in effect; only Blocker fixes admitted, each restarting verification | Change log since freeze |
| 7.2 | **Full clean-state verification**: fresh clone → install → typecheck → test → build → E2E | Complete raw output |
| 7.3 | Deployed to a production-like environment and the full money path exercised **there** | Transcript from that env |
| 7.4 | Runbook written, numbered, with expected output per step and an abort condition | RUNBOOK.md |
| 7.5 | Runbook executable by someone who did not build this | Their read-through |
| 7.6 | **Rollback executed** against realistic data and timed | Timing + output |
| 7.7 | **Every monitor and alert fired deliberately** and confirmed to reach a human | Per-alert proof |
| 7.8 | Baseline metrics captured pre-launch | The numbers |
| 7.9 | Staged rollout plan with **numeric** promotion and auto-rollback thresholds | RUNBOOK.md |
| 7.10 | Environment contract verified: every env var, key, and quota present in the target | Check output |
| 7.11 | Docs, release notes, support brief, migration guide complete and accurate | The documents |
| 7.12 | Data safety: backup taken and **restore tested**, if this touches persistent data | Restore proof |
| 7.13 | Legal/compliance/privacy reviewed, if the change touches personal data or money | Statement |
| 7.14 | **All three deploys enumerated and each one's landing verified** — web SHA, migration applied, function version | Per-artifact proof |

**Any single failure blocks the launch.** 7.6, 7.7, 7.12, and 7.14 are the four that teams most often
mark as done without doing. In this repo 7.14 is the one that has actually bitten: fixes shipped to
`main` while the migration sat unapplied, so the reported-fixed bug was still live for the user.

---

## G8 — Launch gate

**Veto holder.** `launch-engineer`.

| # | Check | Evidence |
|---|---|---|
| 8.1 | Deployment was staged, each stage held long enough for metrics to be meaningful | Timeline |
| 8.2 | Production smoke suite passed after each stage, against production | Output per stage |
| 8.3 | Error rate, p95/p99, and order volume within thresholds vs. baseline | Numbers vs. baseline |
| 8.4 | Rollback still available and still valid at the current state | Confirm explicitly |
| 8.5 | 0 open Blockers | Incident list |
| 8.6 | Someone is watching, and everyone knows who and how to reach them | Named |
| 8.7 | No stage left unattended | Timeline |
| 8.8 | **A real order was placed and served end to end on production** after full rollout | Order number |

---

## G9 — Watch & learn gate

**Veto holder.** You + founder.

| # | Check | Evidence |
|---|---|---|
| 9.1 | Structured checks completed at T+1h, T+6h, T+24h, T+48h, T+72h | Watch log |
| 9.2 | Every incident triaged with severity, owner, resolution | Incident log |
| 9.3 | Support themes reviewed — what are real users actually confused by? | Themes |
| 9.4 | Success metric measured against the P1 target | The number |
| 9.5 | **`lastSyncError` swept across devices** — anything stuck in the push queue? | Query result |
| 9.6 | Postmortem written: predicted / surprised / gates caught / gates missed | POSTMORTEM.md |
| 9.7 | **Exactly one** process change adopted and written back into this skill | The change |
| 9.8 | STATE.md closed out; open items moved to a real backlog | STATE.md |

**9.7 is deliberately limited to one.** A postmortem that generates fifteen action items generates
zero.

---

## Gate arithmetic — what BLOCKED costs

| Blocked at | You return to | Typical rework |
|---|---|---|
| G1 | P1 | Hours — a document |
| G2 | P2 | Hours to a day — a document |
| G3 | P3 | Hours — reordering |
| G4 | P4, that slice | Hours — one slice |
| G5 | P4, named slices | Days |
| G6 | P4 or P6 | Days, mostly deletions |
| G7 | Wherever the failure originated | Days, and the date moves |
| G8 | Rollback, then wherever it originated | Days + a disrupted service |
| G9 | Incident response | The restaurant's reputation |

This table is the argument for the entire process: a G1 block costs hours, and the identical defect
caught at G8 costs a dinner service. **The gate is always cheaper than the next gate.** When you are
tempted to wave one through to save an hour, you are not saving an hour — you are moving the cost
down and to the right, where it multiplies.
