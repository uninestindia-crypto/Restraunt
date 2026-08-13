# 06 — The Launch Runbook

P7 preparation, P8 execution, P9 watch.

**The premise:** launch day should be boring. Every decision that could be made in advance, by calm
people, has been. What remains on the day is execution and observation.

**This product's specific shape.** A release here is up to three independent deploys — the web
bundle (Vercel, on push to `main`), the database (a human applying migrations), and the Edge
Functions (a human running `supabase functions deploy`). **Order matters:** apply additive
migrations *before* the web deploy so the new bundle never asks for a column that does not exist;
deploy Edge Functions *before or with* the web deploy for the same reason. A release that lands the
bundle first is a release with a window of guaranteed errors.

---

## T-7 days — Prepare

1. **Write the runbook** (template at the bottom). Numbered steps, exact commands, expected output,
   abort condition. Written for someone who did not build this.
2. **Capture the baseline.** Before anything changes: order volume per hour, checkout error rate,
   p95 storefront paint, Supabase error rate, the count of rows with a non-empty `lastSyncError`.
   **Without a baseline you cannot distinguish "elevated" from "Tuesday."**
3. **Set the thresholds now**, as numbers:

   | Signal | Promote if | Hold if | **Roll back if** |
   |---|---|---|---|
   | Checkout error rate | ≤ baseline × 1.1 | ≤ baseline × 1.5 | > baseline × 2 for 5 min |
   | Storefront p95 paint | ≤ baseline × 1.2 | ≤ baseline × 1.5 | > baseline × 2 for 5 min |
   | Orders per hour | ≥ baseline × 0.95 | ≥ baseline × 0.9 | < baseline × 0.8 for 15 min |
   | Rows with `lastSyncError` | 0 new | < 5 new | any growth that does not drain |
   | New error types | 0 unknown | known + handled | any wrong-total or lost-order report, immediately |

   The last column is what you are pre-authorizing your 9pm self to do without debate.
4. **Rehearse the rollback.** Execute it against realistic data and time it. Record the time.
5. **Fire every alert** and confirm it reaches a human on the channel they actually watch.
6. **Verify the environment contract**: every `NEXT_PUBLIC_*` var, the Supabase URL and anon key,
   Storage bucket policy, Edge Function secrets, the allowed-origins list, TLS and domain.
7. **Back up, and test the restore** into a separate Supabase project. Untested backups are folklore.
8. **Name the crew.** Executor, watcher, rollback decider, who talks to staff. Confirm availability.

---

## T-3 days — Freeze and prove

1. **Feature freeze.** Only Blocker fixes; each restarts verification for what it touched.
2. **Full clean-state verification**: fresh clone → `npm ci` → typecheck → test → build → E2E.
3. **Deploy to a production-like environment** and exercise all four money paths there.
4. **Time the migration** on a production-shaped copy. Record duration and longest lock.
5. **Dry-run the runbook end to end**, with the person who will execute it doing the execution and
   the author only observing. Every hesitation is a runbook defect. Fix the runbook, not the person.
6. **Support brief** to whoever answers the phone: what is changing, the five likely questions,
   known limitations, how to escalate.

---

## T-1 day — Final checks

1. Steps 1–14 of `11-pre-launch-procedure.md` recorded `READY` for the exact candidate revision.
2. Confirm the crew and the window; confirm nobody else is deploying.
3. Confirm rollback is still valid against production's current state.
4. Pre-write both user comms: "we're live" and "we hit a problem."
5. **Sleep.**

**Do not launch:** during a service, on a Friday evening, the day before a holiday, when the person
who can roll back is unreachable, or when anyone with a veto has an unresolved concern. For a
restaurant the honest version is: **launch mid-morning on a weekday**, when the dining room is empty
and a mistake costs nothing.

---

## T-0 — The window

**Announce start.** "Launching X. Window 10:00–13:00. Watching: names. Rollback decision: name.
Updates every 30 minutes."

**Apply the database and function deploys first**, then the web deploy, then:

### Stage 0 — Internal (hold 30 min)
Staff devices only. Run the production smoke suite. Walk all four money paths manually, on
production, on a real phone. **Place a real order and serve it.**

### Stage 1 — Canary (hold 60 min minimum)
Real traffic on the storefront. Watch the thresholds. One hour minimum — a ten-minute canary proves
only that the process started.

### Stage 2 — Ramp (hold 60 min)
Watch for what only appears under concurrency: order-number collisions, lock contention, realtime
fan-out, the push queue.

### Stage 3 — Majority (hold 60 min)
Watch capacity and cost as well as errors.

### Stage 4 — Full (watch continuously through T+72h)
Full smoke suite once more. Announce completion.

**Rules for every stage:** run the smoke suite after each one, not just at the end; hold the full
time even when everything looks perfect; never leave a stage unattended; one change at a time; and if
a threshold trips, **execute the pre-agreed action** — do not renegotiate while looking at a graph.

### If you roll back
Rolling back is a **success of the process**. Say so plainly.

1. Execute the rehearsed rollback. Follow the runbook; do not improvise.
2. Verify production is healthy against the baseline — do not assume.
3. Notify staff plainly and quickly. If any order was affected, name it.
4. **Preserve the evidence** before anything rotates: logs, metrics, the failing requests, the
   `orders` rows involved, the pending push queue on affected devices.
5. Root-cause before re-attempting.

---

## The watch — T+1h, T+6h, T+24h, T+48h, T+72h

At each checkpoint, **record** — not glance at:

| Check | What you are looking for |
|---|---|
| Error rate and new error *types* | A new type at low volume matters more than a familiar one at high volume |
| Storefront p95 / p99 | p99 degrading while p95 is flat = a subset of phones having a bad time |
| Orders per hour | The only signal that says the product still works for humans |
| Rows with `lastSyncError` | Writes stuck on someone's device — this is the queue backing up |
| Cancelled/duplicated order count | The signature of a concurrency or replay regression |
| Supabase slow queries and RLS denials | A denial spike means a role or policy is wrong |
| Support themes | Three people confused the same way is a design bug, not a support problem |
| Your P5 predictions | You wrote down what you thought would break. Check each one specifically. |

---

## Runbook template

Copy to `.codex/launch/RUNBOOK.md`. Every step needs an expected output; a step whose success cannot
be observed is not a step, it is a hope.

```markdown
# RUNBOOK — <release> — <date>

## Facts
Web commit:                <sha>          Rollback target: <sha>
Migrations to apply:       <files, in order>
Edge Functions to deploy:  <names>
Rollback duration (measured): <mm:ss>
Migration duration (measured, prod scale): <mm:ss>   Max lock: <mm:ss>
Executor: <name>   Watcher: <name>   Rollback decision: <name>   Comms: <name>
Abort condition: <the single sentence that stops everything>

## Pre-flight
[ ] PRELAUNCH.md says READY for this exact revision
[ ] G7 passed, evidence linked
[ ] Baseline captured: orders/hr <x> | checkout err <y>% | p95 <z>ms | stuck writes <n>
[ ] Backup taken <time>; restore tested <time> into <project>
[ ] Rollback rehearsed <time>, duration <mm:ss>
[ ] All alerts fired and received <time>
[ ] Crew confirmed for the full window; no other deploys scheduled
[ ] Dining room is empty / no service in progress

## Steps
1. Apply migration <file> in the Supabase SQL editor
   EXPECT: "Success. No rows returned", and `npm run db:validate` still parses cleanly
   IF NOT: stop; do not deploy the web bundle
2. npx supabase functions deploy <name>
   EXPECT: "Deployed Function <name>"
   IF NOT: stop; the client will send requests the old function rejects
3. git push origin HEAD:main
   EXPECT: Vercel production deployment for <sha> reaches Ready
...

## Smoke suite (run after every stage)
1. Storefront loads, menu shows every dish with a price     EXPECT: <n> dishes
2. Place a guest order                                       EXPECT: order number returned, visible in history
3. Ticket appears on the KDS within 2s                       EXPECT: visible on a second device
4. Advance it to served                                      EXPECT: status changes on both devices
5. POS sale with payment                                     EXPECT: takings increase by exactly the total
6. Sign in as each of the eight roles                        EXPECT: correct home screen, no access-denied toast

## Stages
Stage 0 internal   hold 30m   promote if: smoke green, one real order served
Stage 1 canary     hold 60m   promote if: all thresholds green
Stage 2 ramp       hold 60m   promote if: all thresholds green
Stage 3 majority   hold 60m   promote if: all thresholds green
Stage 4 full       watch 72h

## Rollback
Trigger (any one): <numeric conditions>
1. <exact command>   EXPECT: <…>
2. Verify health against baseline: <how>
3. Notify: <who, what to say>
4. Preserve evidence: logs, metrics, affected order rows — before rotation
NOTE: a rolled-back web bundle still runs against the migrated database. Confirm the previous
bundle tolerates the new schema, or the migration rollback runs first.

## Watch schedule
T+1h <name>  T+6h <name>  T+24h <name>  T+48h <name>  T+72h <name>
```

---

## P9 — Postmortem

Write it within 72 hours, while memory is accurate. **Blameless and specific** — blameless means no
names attached to faults, specific means the mechanism is described exactly.

```
POSTMORTEM — <what launched> — <date>

WHAT SHIPPED           one paragraph, in user terms
WHAT WE PREDICTED      the risks named in P0/P5 that actually happened   ← proof the process worked
WHAT SURPRISED US      what we did not see coming, and why we could not have
WHAT THE GATES CAUGHT  defects stopped before users saw them, with the gate that caught each
                       ← the ROI section; without it the process looks like pure overhead
WHAT THE GATES MISSED  every defect that reached users, and which ring should have caught it
TIMELINE               what happened when, including decisions and who made them
USER IMPACT            how many, how badly, for how long, and what we did
THE ONE CHANGE         exactly one process change, adopted now, written into this skill
```

**Why exactly one change.** A postmortem with fifteen action items produces zero adopted changes.
