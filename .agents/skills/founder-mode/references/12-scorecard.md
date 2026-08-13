# 12 — The Scorecard

A number out of 100 for the health of this codebase, so "is it in good shape?" has an answer with
evidence behind it instead of a feeling.

**Rules.**

1. **Every line is measured by a command**, not by judgement. The command is in the table. If you
   cannot run it, the line scores **zero** — `NOT TESTED` is `FAILED` (Law 4).
2. **Partial credit only where the table says so.** A line that is "mostly" done scores zero. This
   mirrors the gates: there is no PASS WITH NOTES.
3. **Record the score with its date and commit.** A score without a revision is a rumour.
4. **A falling score is information, not shame.** Publish it either way.

Score in `.codex/launch/SCORECARD.md`, one row per line item, with the raw output attached.

---

## R0 — Static analysis · 25 points

| # | Line item | Points | Measured by |
|---|---|---:|---|
| 0.1 | `npm run typecheck` reports 0 errors | 10 | Exit status + error count |
| 0.2 | **0 files carry `@ts-nocheck`** — the typecheck is not being suppressed | 5 | `grep -rl "@ts-nocheck" src \| wc -l` |
| 0.3 | `npm audit` reports 0 vulnerabilities at any severity | 5 | `npm audit` |
| 0.4 | `npm run db:validate` parses every migration in deterministic order | 3 | Command output |
| 0.5 | No service-role key, password, or private token in `src/` or `dist/` | 2 | Secret grep over both trees |

**0.2 is the line that makes 0.1 mean anything.** A green typecheck over a codebase where three
quarters of the files are exempt measures nothing. Scoring them separately makes the suppression
visible instead of letting it inflate the first line.

---

## R1–R3 — Unit, contract, integration · 20 points

| # | Line item | Points | Measured by |
|---|---|---:|---|
| 1.1 | `npm test` green, 0 failures, 0 skipped | 10 | Raw runner output |
| 1.2 | Each of the four money paths has at least one test that fails if it breaks | 5 | Named test per path |
| 1.3 | Every bug fixed in this repo's history has a regression test | 5 | One test file per shipped fix |

The four money paths are defined in `SKILL.md`: guest order, counter sale, kitchen flow, staff
access.

---

## R4 — End-to-end · 15 points

| # | Line item | Points | Measured by |
|---|---|---:|---|
| 4.1 | `npm run test:e2e` green on all five viewport projects | 10 | Raw Playwright output |
| 4.2 | The storefront money path is exercised from an empty browser context | 5 | The spec, and its assertions |

---

## R5 — Adversarial · 15 points

| # | Line item | Points | Measured by |
|---|---|---:|---|
| 5.1 | All twelve attack families run against the integrated system | 5 | Hardening report, `NOT PROBED` section present |
| 5.2 | 0 Blockers, 0 unresolved Majors | 5 | The report |
| 5.3 | **Every `innerHTML` interpolation of user or menu data goes through `escapeHtml`** | 5 | A test that greps the view layer |

5.3 is scored separately because this codebase composes views as HTML strings, which makes XSS a
structural risk rather than an occasional one.

---

## R6 — Non-functional · 15 points

| # | Line item | Points | Measured by |
|---|---|---:|---|
| 6.1 | 0 critical or serious accessibility violations on all five viewports | 6 | `npm run test:a11y` |
| 6.2 | No horizontal scroll at 320px; every control ≥44px; nav stays on screen | 3 | The a11y spec's own assertions |
| 6.3 | `npm run build` succeeds and the static-export hardening step runs | 3 | Build output |
| 6.4 | Bundle within budget: no single JS chunk over 400 KB raw | 3 | Size check over `dist/` |

---

## R7–R8 — Release readiness · 10 points

| # | Line item | Points | Measured by |
|---|---|---:|---|
| 7.1 | `.codex/launch/COMMANDS.md` exists, every command marked verified was actually run | 3 | The file, and its baseline block |
| 7.2 | A runbook exists with a rollback that has been executed and timed | 3 | RUNBOOK.md |
| 7.3 | The three-deploy checklist is enumerated for the current release | 2 | RC report |
| 7.4 | `STATE.md` is current: tier, phase, gates, blockers, next action | 2 | The file |

---

## Reading the total

| Score | What it means | What to do |
|---|---|---|
| **100** | Every ring passes with evidence at this revision | Ship on the runbook |
| **85–99** | Sound, with named gaps | Fix the gaps before the next release |
| **70–84** | The green checks are not trustworthy — something is suppressed or unmeasured | Stop feature work; close R0 and R5 first |
| **< 70** | The codebase cannot support a confident release | Treat the gaps as slice 1 |

**A score of 100 is not a permanent state.** It is true of one revision, and the next commit can cost
you ten points. Re-score at every G7, and record the number in the RC report.

---

## Scoring template

```markdown
# SCORECARD — <yyyy-mm-dd> — <commit sha>

TOTAL: <n>/100

| Ring | Item | Points | Scored | Evidence |
|---|---|---:|---:|---|
| R0 | 0.1 typecheck 0 errors | 10 | 10 | `npm run typecheck` → exit 0, 0 errors |
| R0 | 0.2 no @ts-nocheck | 5 | 0 | 66 files still suppressed |
...

## Deductions, in the order they should be fixed
1. <item> — <n> points — <why it is first>

## Not measured
<anything the environment could not run, and why>
```

**The `Not measured` section is mandatory** and follows the same logic as `NOT PROBED` in the
hardening report: a scorecard that quietly omits what it could not check is worse than one that
scores low honestly.
