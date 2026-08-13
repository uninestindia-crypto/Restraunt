# 10 — Scaling: Sizing the Process to the Stakes

A process that costs more than the work it protects gets abandoned — and an abandoned process
protects nothing.

**The core principle:** account for every phase; its *depth* scales.

---

## Declaring the tier

Do it in your first message: **"This is T2."**

| Tier | Name | Examples in this repo | Blast radius |
|---|---|---|---|
| **T0** | Trivial | Copy fix, a colour token, a dependency patch bump | Nobody notices |
| **T1** | Contained | One bug fix, one view tweak, one new toast | A few users, quickly reversible |
| **T2** | Substantial | A feature, a new screen, a Dexie version bump, a new dependency, a refactor across modules | Many users; a bad service |
| **T3** | Launch | A Supabase migration, an RLS change, a role change, a sync-layer rewrite | Every user; the owner's trust |
| **T4** | Betting the restaurant | Anything that moves money, deletes order history, changes who sees whose data, or cannot be undone | Existential |

**Choosing between two tiers: go up.**

**Automatic escalation**, regardless of diff size. **At least T2** if it touches: money, `orders`,
authentication, a role list, RLS, a Dexie schema version, a Supabase migration, an Edge Function, or
a money path. **At least T3** if it is irreversible — and order history and payment records are
irreversible, which is exactly why `trg_prevent_delete_orders` exists.

---

## What each tier requires

| | **T0** | **T1** | **T2** | **T3** | **T4** |
|---|---|---|---|---|---|
| **P0 Charter** | N/A | 1 sentence | ½ page | full + founder | full + written kill criteria |
| **P1 Define** | N/A | ACs only | full PRD | full PRD | + independent review |
| **P2 Architect** | N/A | N/A unless design changes | ADR + contracts | full + rollback rehearsal plan | + a second architect reviews |
| **P3 Slice** | N/A | list of steps | SLICES.md | + risk order justified | + dependency and failure mapping |
| **P4 Build** | direct | compressed loop | full build loop | full build loop | + review on every slice |
| **P5 Harden** | affected tests | R5 on the change | R5 full + R6 | R5 + R6 full system | **twice**, second by a different actor |
| **P6 Taste** | N/A | glance if user-visible | full if user-visible | full | full + founder demo |
| **P7 RC** | N/A | verify + deploy | clean verify + runbook | full G7 | + full dry run in staging |
| **P8 Launch** | direct | direct | staged if possible | full staged rollout | + war room + founder present |
| **P9 Watch** | none | check it works | 24h watch | 72h watch + postmortem | + external review |
| **Rings** | R0 + affected | R0–R3, R5 on change | R0–R6 | R0–R8 | R0–R8, twice |
| **Roles** | you | you + recorded solo exception | three actors | full roster (crew) | + independent verifier |

---

## Tier playbooks

### T0 — Trivial
```
1. Make the change.
2. Run R0 + any test touching the file.
3. Verify the rendered result if it is user-visible.
4. Report: what changed, evidence, done.
```
**The trap:** a "typo fix" in a string that is a key, a role name, a route hash, a Supabase column,
or a CSS token is not T0 — something depends on the exact text. Check what references it first.

### T1 — Contained
```
P1(¶)  One paragraph: what, for whom, acceptance criteria, what is NOT included.
P3     Steps in order. Riskiest first.
P4     Build loop: test-first → happy path → failure states → R0 → red team hat → clean verify.
P5     R5 on the changed surface: input boundaries, roles if touched, concurrency if mutating.
P7     Verify from clean, then deploy — all three artifacts if the change needs them.
P9     Confirm it works in production. Watch briefly.
```
30–60 minutes of process around a few hours of work. If the process exceeds the work you are at the
wrong tier.

### T2 — Substantial
The full pipeline, honestly executed, compressed where the artifact is obvious. The five things that
must **not** be compressed at T2, because they are where T2 defects escape:

- **G4.8** — clean-state verification per slice, with an empty IndexedDB
- **R5** — red team on every slice, with the stance change
- **Failure states** in the same slice as the happy path
- **A regression test for every bug found**
- **G5.12** — re-run the suite after the fixes

### T3 — Launch
Everything, uncompressed, crew mode. Plus: founder present at G0, G6, G7; a production-like
environment is mandatory (if none exists, building it is slice 1); the 72-hour watch scheduled with
named people *before* launch day; written comms for both outcomes; rollback rehearsed **and timed**.

### T4 — Betting the restaurant
Everything in T3, plus a second independent verification pass designed by someone who did not see the
first; P5 run twice, the second by a different actor with no knowledge of the first findings; a full
dry run in staging including migration, rollback, and comms; a dated decision record for every
founder acceptance of risk; and an explicit **abort point** — the moment after which rolling back
becomes impossible, named in the runbook.

**Consider whether it needs to be T4 at all.** The most senior move available is to redesign the
change so it is reversible. **A reversible T3 beats an irreversible T4 every time.**

---

## Compressing without breaking

**Safe to compress:** document length, number of ADRs, formality of handoffs, crew size, depth of
R6, number of rollout stages.

**Never compress, at any tier above T0:**

1. **Failure states in the same slice as the happy path.**
2. **A regression test for every bug found.**
3. **Clean-state verification before claiming done.**
4. **An adversarial pass.**
5. **Evidence in reports.**
6. **A rehearsed rollback for anything that touches production data.**
7. **Confirming all three deploys landed.**

If the schedule cannot accommodate those seven, the schedule is wrong, and that is a founder
conversation — not something to silently absorb by lowering quality.

---

## Reading the room

- **"Just fix this typo"** → T0. Fix it. Do not narrate a pipeline.
- **"Can you add X?"** → usually T1–T2. Mention only what matters: the criteria you assumed, and the
  evidence.
- **"Are we ready to launch?"** → a G7 audit. Walk the checklist and report honestly, including
  everything that is not ready.
- **"Build me a product"** → T3. Full pipeline, start at P0 with actual questions.
- **"Why did this break?"** → a P9 postmortem, plus the missing ring gets written into the matrix.

The process should be **invisible when small and unmistakable when large.**
