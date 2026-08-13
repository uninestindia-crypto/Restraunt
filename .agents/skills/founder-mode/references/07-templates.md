# 07 — Artifact Templates

Copy these into `.codex/launch/` only when project-state writes are authorized. Keep them short:
every artifact should fit on one or two screens.

---

## CHARTER.md — P0

```markdown
# CHARTER — <name>

TIER: T<0-4>        DATE: <yyyy-mm-dd>        FOUNDER: <who decides>
DEPLOYS NEEDED: web [ ]   migration [ ]   edge function [ ]

## The one sentence
<What we are building, in your words, confirmed by the founder.>

## The user
<A specific role in a specific situation — "a cashier at 8pm with a queue of six".
 If several, rank them; the primary user wins every trade.>

## The job to be done
<In the user's language, not ours.>

## "No problems for users" means
MUST NEVER HAPPEN:   <a taken payment with no order / a ticket the kitchen never sees / …>
MUST ALWAYS WORK:    <the money path, even with no network>
MAY BE IMPERFECT:    <what we accept at launch — answer this honestly>

## The first ten minutes
<Prose. A stranger opens the storefront on their phone. What happens, step by step,
 until they have ordered dinner? This narration is the real spec.>

## Kill criteria
<Conditions under which we stop, postpone, or cut. Written now.>

## Success metric
<One number, measurable after launch.>
```

---

## PRD.md — P1

```markdown
# PRD — <name>

## Stories
As a <specific role>, I need to <job>, so that <outcome>.

## Acceptance criteria
AC-1  GIVEN <state>  WHEN <action>  THEN <observable outcome>
<Machine- or checklist-verifiable. Zero unquantified adjectives. Describe user
 outcomes, not implementation — "returns 201" is a failed criterion.>

## Non-goals — the cut line          ← MAY NOT BE EMPTY
- <thing we are explicitly not doing, and when we might>

## Failure states (per story)
EMPTY:          <what the user sees with no data>
LOADING:        <…>
ERROR:          <what it says, and what the user does next>
OFFLINE:        <what still works, and what the operator is told>
UNAUTHORIZED:   <…>
SLOW:           <…>
STALE:          <cache shown because the cloud was unreachable — how is that visible?>
PARTIAL:        <…>
TOO MUCH DATA:  <…>
CONCURRENT:     <two devices, same order, same moment>

## Role behaviour (if any role is involved — all eight)
| Role | Can they reach it? | What do they see? | What can they do? |
| developer | | | |
| owner | | | |
| manager | | | |
| cashier | | | |
| kitchen | | | |
| waiter | | | |
| delivery | | | |
| temporary_staff | | | |

## Ambiguity log
| # | Ambiguity | Assumption made | Who must confirm | Blocking? |
```

---

## ADR-nnn.md — P2

```markdown
# ADR-<nnn>: <decision in five words>

STATUS: proposed | accepted | superseded by ADR-<n>     DATE: <yyyy-mm-dd>

## Context
<The forces. What is true that makes this a decision rather than an obvious choice?>

## Options
### A — <name>          ← chosen
Pros / Cons / Cost
### B — <name>
Pros / Cons / Cost — and why it lost

## Decision
<What we are doing.>

## Consequences
GOOD:        <…>
BAD:         <what we are accepting — may not be empty>
OPERATIONAL: <what this adds to run, monitor, back up, or pay for>

## We would reverse this if
<Concrete, observable conditions.>
```

---

## ARCHITECTURE.md — P2

```markdown
# ARCHITECTURE — <name>

## Shape
<What talks to what: view → db/database.ts → cloudDb/ensureFresh → Supabase, and
 the sync path back through syncUp*/pushUnsynced.>

## Contracts
### <boundary name>
SUPABASE:  <table, columns, types, constraints>
RLS:       <the exact predicate, and which roles it names>
DEXIE:     <store, indexes, schema version>
EDGE FN:   <request body, response, errors>
ERRORS:    <code → meaning → what the caller should do>
AUTH:      <who may call it, checked where>

## Data model
NEW/CHANGED: <tables, columns, indexes, constraints>
MIGRATION:   <forward steps, in file order>
ROLLBACK:    <backward steps>  ← and how it will be REHEARSED
BACKFILL:    <how existing rows are handled; how long at prod scale>
ADDITIVE?:   <yes/no — if no, name the existing rows whose behaviour changes>

## Failure behavior (per dependency)
| Dependency | Timeout | Retry | Idempotent? | Degraded mode | Operator sees |
| Supabase REST | | | | | |
| Supabase realtime | | | | | |
| Storage | | | | | |

## Cache coherence
HYDRATION OVERWRITES THIS?  <yes/no>
GUARDED BY hasUnpushedLocalEdit?  <yes/no — if no, why is that safe?>

## Observability
LOG:    <events, with what context>
SHOW:   <what the operator sees when this fails>
STUCK:  <how a queued write becomes visible to a human>

## Permission model
| Role | Screen | Action | Allowed? | Enforced where | Test that proves it |
```

---

## SLICES.md — P3

```markdown
# SLICES — <name>

Ordered by RISK, not by ease. Slice 1 is the scariest thing.

| # | Slice | Demo (one sentence) | Part types | Rings | Deploys | Depends on | Status |
|---|-------|---------------------|-----------|-------|---------|-----------|--------|
| 1 | <the riskiest unknown> | <what you show when done> | rls, roles | R0-R5 | migration | — | ⬜ |

Status: ⬜ not started · 🟡 building · 🟠 red team · 🟢 G4 passed

## Why slice 1 is the riskiest
<One line. If you cannot justify it, the order is wrong.>
```

---

## Slice report — P4, one per slice

```markdown
[P4 · slice <n>/<total> · G4 <PASSED|BLOCKED>]

SLICE        <name>
CRITERIA     <the ACs this slice satisfies>

WHAT CHANGED
- path/to/file.ts — <one line>

EVIDENCE
$ <the exact command>
<RAW OUTPUT — the actual text, not a summary>

FAILURE STATES     each one, and how it was demonstrated
RED TEAM           <n> findings — <n> Blocker, <n> Major, <n> Minor; disposition of each
REGRESSION TESTS   one per finding, each verified to fail without the fix
CLEAN VERIFY       fresh deps + empty IndexedDB + migrations from zero → <raw output>
DEPLOYS REQUIRED   web / migration / edge function

NOT DONE           what was in scope and isn't finished, and why
RISKS OPENED       new failure modes this introduces
NEXT               slice <n+1>: <name>
```

---

## RISKS.md — maintained P0 → P9

```markdown
# RISK REGISTER

| # | Risk | Likelihood | Impact | Detected by | Mitigation | Owner | Status |
|---|------|-----------|--------|-------------|------------|-------|--------|

## Accepted risks     ← founder-signed only
| # | Risk | Why accepted | Who accepted | Date |
```

Add a row the moment a risk is named. At G7 you read it top to bottom and ask "is each of these
still true?"

---

## STATE.md — the company's memory

```markdown
# STATE — <name>

TIER: T<n>     PHASE: P<n>     UPDATED: <yyyy-mm-dd hh:mm>

## Gates
G0 ✅ <date>  G1 ✅ <date>  G2 ✅ <date>  G3 ✅ <date>
G4 🟡 slice 4/7   G5 ⬜  G6 ⬜  G7 ⬜  G8 ⬜  G9 ⬜

## Blocked on
<the single most important thing right now, or "nothing">

## Deploy state
web: <sha deployed>   migrations applied through: <file>   functions: <name@version>

## Open Blockers/Majors
| # | Severity | Description | Owner | Since |

## Decisions made this session
- <decision> — <why> — <who decided>

## Founder overrides
| Gate | What was waived | Risk accepted | Date |

## Next action
<the literal next thing to do, specific enough to start cold>
```

Update this **at every gate**. The "Next action" line is what makes a cold start take thirty seconds
instead of an hour.

---

## RC report — P7

```markdown
[P7 · release candidate · G7 <PASSED|BLOCKED>]

VERSION        <sha>          ROLLBACK TARGET <sha>
FROZEN SINCE   <date>         CHANGES SINCE FREEZE <list, or none>
SCORECARD      <n>/100 at this revision

CLEAN-STATE VERIFICATION
$ <every command, in order>
<RAW OUTPUT>

THREE DEPLOYS
  web:        <sha> → <how verified landed>
  migrations: <files> → <how verified applied>
  functions:  <names> → <how verified deployed>

PRODUCTION-LIKE RUN     env: <…> · money paths exercised: <…> · result: <…>
ROLLBACK REHEARSAL      executed <date> · duration <mm:ss> · realistic data?
MIGRATION TIMING        prod scale · duration <mm:ss> · max lock <mm:ss>
MONITORS FIRED          <n>/<n> confirmed received by a human
BASELINE CAPTURED       orders/hr <x> · checkout err <y>% · p95 <z>ms · stuck writes <n>
ENV CONTRACT            <n>/<n> vars, keys, quotas verified present
BACKUP + RESTORE        taken <time> · restored to <project> · verified <how>
DOCS                    release notes ✅ · support brief ✅ · migration guide ✅

KNOWN LIMITATIONS       <shipped-with, documented for support>
OPEN RISKS              <from RISKS.md, still open at RC>
GO / NO-GO              <recommendation, with the one-sentence risk statement>
```
