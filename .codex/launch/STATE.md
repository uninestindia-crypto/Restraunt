# STATE — The Taste

TIER: T2     PHASE: P5 (harden)     UPDATED: 2026-08-13

## Gates
G0 n/a  G1 n/a  G2 n/a  G3 n/a
G4 ✅ 2026-08-13 (static-analysis slice)   G5 🟡 in progress   G6 ⬜  G7 ⬜  G8 ⬜  G9 ⬜

## Blocked on
Nothing in the codebase. Three founder-side actions block a release:
apply the three pending migrations, deploy `staff-admin`, and rehearse the rollback.

## Deploy state
web:        `9cfb6aa` on main; later commits not yet deployed
migrations: applied through 20260729120000 — the user reports 20260802120000,
            20260802140000 and 20260802160000 applied on 2026-08-13, unverified from here
functions:  `staff-admin` edited on 2026-08-13, **not yet deployed**

## Open Blockers/Majors
| # | Severity | Description | Since |
|---|---|---|---|
| 1 | Major | No migration rollback exists (no down-migrations) — G7.6 cannot pass for schema work | bootstrap |
| 2 | Major | No staging environment with its own Supabase project — G7.3 has nowhere to run | bootstrap |
| 3 | Major | No monitoring or alerting — G7.7 has nothing to fire | bootstrap |
| 4 | Minor | Seed writes 25 demo orders with `isSynced: 0`; a fresh device pushes them to production | earlier audit |
| 5 | Minor | No linter, formatter check, or secret-scanning tool in R0 | bootstrap |

## Decisions made this session
- The typecheck baseline is now zero errors and zero suppressions, enforced by a test rather than
  by convention — a suppression may only ever be removed, never added.
- `@ts-expect-error` is permitted where a browser API is genuinely missing from `lib.dom`;
  `@ts-ignore` is not, because it has no expiry.
- Ambient globals live in `src/types/globals.d.ts` and are all optional, because every one of them
  can legitimately be absent at runtime.

## Founder overrides
None.

## Next action
Rehearse the web rollback against a realistic deployment and record its duration in
`.codex/launch/RUNBOOK.md`. That is the single line keeping the scorecard at 97 rather than 100.
