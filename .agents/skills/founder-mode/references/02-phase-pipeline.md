# 02 — The Phase Pipeline

Ten phases, ten gates. Every phase has an **entry condition**, a **work list**, an **exit artifact**,
and a **gate**. Gate checklists are in `03-gates.md`.

**The two pipeline rules:** account for every phase (execute, compress, or mark not applicable as the
tier permits — never omit one silently); and never enter a phase whose predecessor gate has not passed
with evidence.

Announce your position in every message: `[P4 · slice 3/7 · G4 pending]`

---

## P0 — Charter

**Entry.** The founder has expressed an intent, however vaguely.

**Purpose.** Prevent the most expensive failure: building the right thing badly, or the wrong thing
beautifully. Costs minutes, saves weeks.

**Work.**
1. **Restate the intent in one sentence** and get it confirmed. If your restatement surprises the
   founder, you just saved the project.
2. **Name the user.** "A cashier at 8pm on a Saturday with a queue", not "users". Rank them if
   several — the primary user wins every trade.
3. **Define "no problems for users."** What must *never* happen (a taken payment with no order, a
   ticket the kitchen never sees, one store's data in another's report)? What must *always* work,
   even degraded (taking an order with no network)? What may be imperfect at launch (analytics lag,
   printer formatting)?
4. **Declare the tier**, checking the automatic-escalation list.
5. **Kill criteria**, written now, while nobody is invested.
6. **The first ten minutes**, as prose: a stranger opens the storefront on their phone. What happens,
   step by step, until they have ordered dinner?
7. **Which of the three deploys** this will need: web, migration, Edge Function.

**Exit artifact.** `.codex/launch/CHARTER.md` — one page.

**Gate G0.** The founder agrees with the restatement, the user, "no problems", and the tier.

**Time.** T0: skip. T1: 2 minutes. T2: 15 minutes. T3–T4: a real conversation.

---

## P1 — Define

**Entry.** G0 passed. **Lead.** `spec-writer`.

**Purpose.** Make "done" a thing that can be checked instead of felt.

**Work.**
1. **User stories** in the user's language.
2. **Acceptance criteria** in Given/When/Then, each mechanically verifiable. Adjectives become
   numbers or are deleted: "fast" → "the menu paints within 1.5s on a throttled 4G phone";
   "intuitive" → "Customer Zero orders unaided in under 90 seconds".
3. **The non-goals list.** Explicit. Non-empty.
4. **Failure states per story** — empty, error, **offline**, unauthorized, slow, **stale**, partial,
   too-much-data, concurrent. Each gets a specified behavior *now*.
5. **Success metric.** One number, measurable after launch.
6. **Ambiguity log.** Every unclear place, the assumption made, who confirms it.
7. **If a role is involved, all eight roles get a stated expected behaviour** — the gap between "we
   changed the cashier flow" and "we changed the flow" is where role bugs live.

**Exit artifact.** `.codex/launch/PRD.md`. **Gate G1.**

**Common failure here.** Criteria that describe the *implementation* ("the upsert returns 201")
instead of the *outcome* ("the kitchen screen shows the ticket within two seconds, on every device").
Implementation criteria pass while the product is broken.

---

## P2 — Architect

**Entry.** G1 passed. **Lead.** `architect`.

**Work.**
1. **Read the existing code before designing.** Find the existing pattern and follow it, or state
   why you are departing. In this repo that means: does it belong in `cloudDb`'s resource registry,
   in a `syncUp*` helper, in a view, or in a migration?
2. **ADR per significant decision** — context, options, decision, consequences, reversal conditions.
3. **Interface contracts.** Exact shapes: Supabase columns and types, the RLS predicate, the Edge
   Function body, the Dexie store and its indexes, the realtime event, the error taxonomy.
4. **Data model + migration plan** — forward, backward, and how the rollback will be *rehearsed*.
5. **Failure architecture.** What happens when Supabase is down, slow, 401, or RLS-denies. Timeouts,
   retries, idempotency, degraded mode. Decide here, not in an incident.
6. **Observability plan.** What is logged, what the operator sees, what `lastSyncError` will say, and
   how a stuck write becomes visible to a human.
7. **The permission model** as a role × screen × action matrix, with the test that will prove it.
8. **Cache coherence.** Does hydration overwrite this? Does `hasUnpushedLocalEdit` cover it?

**Exit artifact.** `.codex/launch/ARCHITECTURE.md` + ADRs. **Gate G2.**

---

## P3 — Slice

**Entry.** G2 passed. **Lead.** Architect + you.

**Work.**
1. **Cut vertically.** Each slice goes through the stack and ends in something a human can see, run,
   or call. Never "all the migrations" then "all the services" then "the screen" — horizontal layers
   hide risk until integration.
2. **Order by risk** (Law 3). Rank by: *if this is harder than we think, how much of the plan dies?*
   The uncomfortable slice is slice 1. In this repo the usual candidates: an RLS or role change, a
   Dexie version bump, anything in the sync layer, anything on the checkout path.
3. **Size each slice to one working session** including its tests.
4. **Define each slice's demo** in one sentence.
5. **Assign each slice its rings** from `04-test-matrix.md`, at planning time — it changes the size
   estimate.
6. **Mark dependencies**, and which of the three deploys each slice needs.

**Exit artifact.** `.codex/launch/SLICES.md`. **Gate G3.**

---

## P4 — Build (the loop)

**Entry.** G3 passed. **Lead.** You, as Staff Engineer. Red Team enters at step 6 of every slice.

**40% of the effort, and it is a loop, not a block.** The nine steps are in `01-org-chart.md` under
Staff Engineer.

**Non-negotiables:**
- **No parallel half-slices.** Two slices at 80% is worth zero.
- **No TODOs in a completed slice.** Finish it, or it goes in the report's `NOT DONE`.
- **Every bug found gets a test before it gets a fix.** A fix without a test is a bug on a timer.
- **When a slice reveals the plan was wrong** — and one will — stop, say so, and return to P2 or P3.
  Discovering the design is wrong is a *success* of risk-first ordering. Grinding forward on a design
  you no longer believe in is the failure.

**Gate G4** per slice, and again at the end of the phase.

---

## P5 — Harden

**Entry.** All slices through G4. **Lead.** Red Team, then Code Review.

**Purpose.** Slices were tested in isolation. Systems fail *between* the parts.

**Work.**
1. **Full-system adversarial pass** — all twelve families, against the integrated product, with
   emphasis on the seams.
2. **Concurrency and ordering.** Two devices, same order, same millisecond. Retries arriving after
   the original succeeded. Anything touching `orders` or stock gets this specifically.
3. **Failure injection.** Supabase down mid-checkout; RLS denies a write the UI allowed; realtime
   drops; Storage refuses; the network disappears mid-order. For each: safely, visibly, recoverably?
4. **The offline soak.** Go offline, work a full service, come back, reconcile. Count the rows.
5. **Non-functional.** Performance at realistic volume; accessibility on all five viewports; bundle
   size; dependency and secret scanning.
6. **Code Review.** `/code-review` and `/security-review`, not a skim.
7. **The migration rehearsal.** Run it on a production-shaped copy. Time it. Then the rollback. Time
   that too. Both numbers go in the runbook.
8. **Fix, then re-run.** A pass that ends "found 14 issues" with no re-run has proven nothing about
   the fixes.

**Gate G5.**

---

## P6 — Taste & Cut

**Entry.** G5 passed. **Lead.** `taste-critic`, then `customer-zero`.

**Purpose.** The Jobs pass. Everything works; now decide whether it is *good*.

**Work.**
1. **Run the product as a product** — on a real phone, on a real network, with realistic data.
2. **The taste review** against `taste-os-design`.
3. **Produce the remove list.** Options that should be defaults, three screens that should be one, a
   setting nobody will change, every word not doing work. **An empty remove list means P6 did not
   happen.**
4. **Customer Zero.** Fresh eyes, empty cart, doing the wrong things on purpose.
5. **The founder demo.** Expect "this part isn't good enough" and treat it as the system working.
6. **Cut or fix.** Every remove-list item is removed or explicitly kept by the founder.

**Gate G6.**

---

## P7 — Release Candidate

**Entry.** G6 passed. **Lead.** `launch-engineer` + `scribe`.

**Purpose.** Freeze, prove, prepare. Nothing new gets built — that is what makes it a candidate.

**Work.**
1. **Freeze.** Only Blocker fixes; each one restarts verification for what it touched.
2. **Full clean-state verification**: fresh clone → install → typecheck → test → build → E2E.
3. **Deploy to a production-like environment** and run the money paths *there*.
4. **The runbook** — numbered, exact commands, expected output, abort condition.
5. **Rehearse the rollback.** Execute it. Time it. If it has not been run, it does not exist.
6. **Fire every monitor** and confirm each reaches a human.
7. **Docs, release notes, support brief, migration guide.**
8. **The staged rollout plan** with numeric thresholds.
9. **Environment contract check.**
10. **Enumerate all three deploys** and how each will be verified as landed.

**Gate G7.**

---

## P8 — Launch

**Entry.** G7 passed. Detail in `06-launch-runbook.md`. **Lead.** `launch-engineer`.

Announce the window. Deploy in stages. Run the production smoke suite after **each** stage. Watch the
numbers against the captured baseline, not the dashboard's colour. Promote or roll back on the
pre-agreed thresholds — the decision was made in P7 by calm people; honour it. Never leave a stage
unattended. **Gate G8.**

---

## P9 — Watch & Learn

**Entry.** G8 passed. Launch is not over.

72-hour watch at T+1h, T+6h, T+24h, T+48h, T+72h. Triage every incident in public. Sweep
`lastSyncError` across devices. Write the postmortem — blameless and specific — including **what the
gates caught** (the ROI section) and **the one process change**, written back into this skill.

**T+24h to T+48h is the dangerous window.** Hour one is watched by everyone. Day two is when the
first full service runs on the new code, the first daily rollup fires, caches expire, and attention
has moved on.

**Gate G9.**

---

## Parallelism map (crew mode only)

| Can run in parallel | Why it is safe |
|---|---|
| P4 slice N build **+** P4 slice N−1 red team | Different artifacts; red team is read-only |
| P5 hardening **+** P7 docs drafting | Docs describe behavior frozen at G5 |
| P5 non-functional **+** P5 code review | Independent evidence streams |
| P7 runbook **+** P7 release notes | Different authors, no shared artifact |
| Independent slices, **only if** their contracts were fixed at G2 | Contracts prevent merge surprise |

**Never parallel:** definition with architecture; building with architecting the same slice; taste
with hardening (taste on unstable software judges the wrong thing); anything with launch.
