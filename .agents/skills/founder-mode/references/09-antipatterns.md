# 09 — Antipatterns

Every entry is a real, observed failure pattern. Each has a **tell**, a **mechanism**, and a
**counter**. Read this when something feels off, and *always* before believing a report that is
entirely green. Entries marked ⚑ have happened in this repository.

---

## Process antipatterns

### 1. Demo-driven development
**Tell.** The path being tested is always the path being demoed.
**Mechanism.** The code is optimized for the rehearsed path; every other path is untouched until a
user finds it. Confidence tracks rehearsal, not quality.
**Counter.** Ring 5 and Customer Zero, who may not learn the rehearsed path.

### 2. "We'll harden it later"
**Tell.** Failure states, error messages, and empty states deferred to a "polish phase."
**Mechanism.** The polish phase gets compressed when the date arrives — it always does, because it
is the only phase with no visible deliverable.
**Counter.** Law 6. Failure states ship in the same *slice*, not the same sprint.

### 3. Horizontal slicing
**Tell.** "First the migration, then the service, then the screen."
**Mechanism.** Nothing is demonstrable until the end, so all integration risk stacks where there is
no schedule left.
**Counter.** Vertical slices, each ending in something a human can see.

### 4. Easy-first ordering
**Tell.** The plan starts with what everyone knows how to build.
**Counter.** Law 3. Slice 1 should be uncomfortable.

### 5. Green status theater
**Tell.** Every status update is green. Nothing is ever amber.
**Mechanism.** A project with no reported problems has a broken reporting channel, not perfect
execution.
**Counter.** Report `NOT DONE` and `RISKS OPENED` in every phase report.

### 6. The infinite RC
**Tell.** "One more fix and we'll re-verify," repeatedly, for days.
**Mechanism.** Each fix invalidates the verification; you end up shipping the *least*-verified
version.
**Counter.** Real freeze. If it happens three times, it is not an RC — go back to P5.

### 7. Process as ceremony
**Tell.** Gates marked passed without evidence; templates filled in afterwards to match what was
already done.
**Counter.** Evidence or BLOCKED. And scale honestly — a T1 change with full T3 ceremony is what
teaches people the process is fake.

### 8. Scope creep by adjacency
**Tell.** "While I was in there, I also…"
**Mechanism.** The extra work carries none of the gates the planned work carried.
**Counter.** Note it, finish the slice, raise it at the gate.

### 9. The hero deploy
**Tell.** One person deploys because they know the steps.
**Counter.** A runbook a stranger can execute, dry-run by someone else before the day.

### 10. Postmortem inflation
**Tell.** Fifteen action items.
**Counter.** Exactly one process change, adopted immediately.

---

## Engineering antipatterns

### 11. ⚑ Suppression mistaken for cleanliness
**Tell.** `npx tsc --noEmit` exits 0 while most files begin with `@ts-nocheck`.
**Mechanism.** The static ring reports success over code it never looked at. Real defects — a
wrong-arity call, arithmetic on `string | number`, an undeclared global — sit in the unchecked
region indefinitely, and every future green typecheck reconfirms nothing.
**Counter.** Score suppression separately from errors (`12-scorecard.md` line 0.2). Removing a
suppression is a slice; adding one is a gate failure.

### 12. ⚑ "It works locally"
**Tell.** Evidence is a local run.
**Mechanism.** Local means a warm Dexie cache, seeded demo data, one device, a fast network, and an
already-migrated database. Every one of those differs in production — and in this product the seeded
cache specifically hides online-first regressions.
**Counter.** Clean-state verification with an empty IndexedDB, plus a production-like run before G7.

### 13. ⚑ The half-shipped release
**Tell.** "Fixed and pushed" — but the migration is unapplied or the Edge Function is undeployed.
**Mechanism.** The web bundle is the only artifact that deploys itself. The other two need a human,
so they are the two that get forgotten, and the user reports the bug as still present because it is.
**Counter.** The three-deploy rule. Enumerate all three in every RC report and verify each landed.

### 14. Tests that cannot fail
**Tell.** The suite has never gone red on its own. Tests assert "did not throw."
**Counter.** Break the implementation deliberately and watch the test go red, once per slice.

### 15. Source-text tests mistaken for behaviour tests
**Tell.** The suite asserts that a file *contains* a guard, not that the guard *works*.
**Mechanism.** Legitimate for invariants with no runtime seam (an RLS policy, a role list in three
places). Dangerous when it becomes the default, because a refactor that preserves the text while
breaking the behaviour still passes.
**Counter.** Prefer behaviour wherever a runtime seam exists. Keep text assertions for structural
invariants, and say which is which.

### 16. Flaky-test tolerance
**Tell.** "Just re-run it."
**Mechanism.** The flake is often a genuine race that will also happen in production, less
conveniently.
**Counter.** A flaky test is a failing test. Fix the race or delete the test.

### 17. Mock-shaped confidence
**Tell.** Integration tests where `cloudDb` itself is mocked.
**Mechanism.** You have tested that your mocks match your assumptions — the thing never in doubt.
**Counter.** Stub at the `fetch` boundary. Real Dexie via `fake-indexeddb`.

### 18. Untested rollback
**Tell.** The rollback exists as a paragraph.
**Counter.** Execute it, against realistic data, timed, before T-3 days.

### 19. Migration tested at toy scale
**Tell.** "The migration ran fine" — on a database with a demo menu.
**Counter.** Run it on a production-shaped copy. Time it. Measure the longest lock. Test the *old*
bundle against the *new* schema, because that combination exists during every deploy.

### 20. ⚑ Silent failure
**Tell.** `catch (e) {}`, a default substituted for an error, a queued write that never surfaces.
**Mechanism.** The system produces wrong answers confidently. In this product the specific shape is
a push that fails, is never retried, and is never shown — so the device diverges from the cloud and
only the owner's reconciliation finds it.
**Counter.** Family 12. Escalate silent failures one severity level. Every queued write needs a
visible home (`lastSyncError`, the pending-photo banner).

### 21. ⚑ Optimistic confirmation
**Tell.** A success toast fired before the server answered.
**Mechanism.** "Staff member added!" before the cloud had the account; "Order deleted" before
Postgres accepted the transition. The operator believes a thing that is not true, and acts on it.
**Counter.** Await the write. Report what actually came back — including the refusal, in words the
operator can act on.

### 22. Permission by UI
**Tell.** The button is hidden for roles that may not do the thing.
**Mechanism.** The sidebar is not a permission system. Anyone who reads the network tab is an admin.
**Counter.** Family 2. Test every table directly, with every role's session, ignoring the UI.

### 23. The trusted client
**Tell.** Price, quantity, discount, role, or store id taken from the request body.
**Counter.** Recompute every consequential value server-side. The client sends intent, never facts.
This is also `.agents/AGENTS.md` directive 3.

### 24. Float money
**Tell.** `price * quantity` on a floating-point type.
**Counter.** Integer minor units or a decimal type, end to end. Blocker severity, always.

### 25. ⚑ String arithmetic
**Tell.** A total built from a value typed `string | number`.
**Mechanism.** `"12" + 1` is `"121"`. It does not throw. It renders. It reconciles wrong.
**Counter.** R0 catches it the moment the file is not suppressed. Coerce at the boundary, once.

### 26. Retry without idempotency
**Tell.** A retry policy on a non-idempotent write.
**Mechanism.** Double orders, double charges. The first timeout that is actually a slow success does
the damage.
**Counter.** Idempotency on every mutating operation that can be retried, tested by replaying it.

### 27. Pagination without a stable sort
**Tell.** `ORDER BY created_at` with no tiebreaker, paged.
**Mechanism.** Rows shift between pages as orders arrive; exports silently lose records.
**Counter.** Always sort by a unique tiebreaker.

### 28. The lonely index
**Tell.** A query that is fast on a demo menu.
**Counter.** Test at production scale, count round trips per screen, check the query plan on
`orders`.

### 29. Timezone by accident
**Tell.** "It works, we're all in one country."
**Mechanism.** The service day and the UTC day disagree by 5.5 hours. An order at 00:30 IST lands in
yesterday's takings.
**Counter.** UTC in storage, explicit timezone at the boundary, and the date cases in the matrix.

### 30. ⚑ The unread config
**Tell.** A build-time global or env var that is simply absent at runtime.
**Mechanism.** Nothing fails loudly; the behaviour is quietly wrong, or a `ReferenceError` fires on a
path nobody exercises.
**Counter.** Fail loudly at startup on missing required config; declare every injected global so R0
sees it. `scripts/check-public-env.js` is the enforcement point — keep it in the build.

---

## Judgment antipatterns

### 31. Believing the summary
**Tell.** A tool or subagent reports "all tests pass" and it becomes your claim.
**Counter.** Read the raw output before repeating a claim. Especially "all tests pass."

### 32. Optimism as a status
**Tell.** "Should work," "looks good," "I believe it's fine."
**Mechanism.** Feelings formatted as facts, indistinguishable downstream from verified statements.
**Counter.** Say what you ran and what it printed. If you did not run it, say "not verified."

### 33. The confident unknown
**Tell.** Answering a question about behavior you have not observed.
**Counter.** Go look. Running it takes less time than reasoning about it.

### 34. Sunk-cost architecture
**Tell.** "We've already built it this way."
**Counter.** Discovering the design is wrong is a *success* of risk-first ordering. The cost of
changing it is lowest right now.

### 35. Politeness over accuracy
**Tell.** Softening a red result to avoid disappointing the founder.
**Mechanism.** The founder makes decisions on false information, and the correction arrives when it
is expensive.
**Counter.** Bad news first, in the first sentence, with a number and a recommendation.
