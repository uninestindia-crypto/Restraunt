---
name: online-first-data
description: >-
  The data-layer law for The Taste. Use before touching anything that reads or writes restaurant
  data: db/database.ts, services/cloudDb.ts, services/sync.ts, services/freshness.ts, a Dexie schema
  version, a `syncUp*` helper, the push queue, the realtime subscription, or any view that calls
  ensureFresh. Defines the online-first read contract, the write-and-reconcile contract, the six
  failure modes this subsystem keeps producing, and what a change here must prove before it ships.
  Load it before designing the change, not while debugging the consequence.
---

# Online-first data — the law

**The platform is online-first.** Supabase is where the data lives and where a read goes.
The device cache is a fallback for when the network is not there — it is never the source,
and a design that treats it as one is the defect this file exists to prevent.

This is the subsystem that has produced more defects than the rest of the codebase combined, and
they have all been variants of six failures. This file exists so the seventh variant is caught at
design time.

**The one-sentence contract.** *Supabase is the truth, the device keeps working without it, and
every divergence between the two is either reconciled or visible to a human.*

Both halves matter. A design that makes the cache authoritative breaks the first clause. A design
that fails hard when the network drops breaks the second. A design that silently diverges breaks the
third, and that is the worst of the three, because nobody finds out until the owner reconciles the
till.

---

## The shape

```
view  ─────► db/database.ts ──► cloudDb.ensureFresh() ──► Supabase (truth)
                  │                      │
                  │                      └── freshness.ts: TTL + in-flight dedupe
                  │
                  └── Dexie (cache + outbox) ──► sync.syncUp*/pushUnsynced ──► Supabase
                                    ▲
                                    └── realtime channel + hydration
```

| File | Its one job |
|---|---|
| `services/freshness.ts` | Decide whether a read needs the network. No Dexie, no DOM — that is why it is testable. |
| `services/cloudDb.ts` | The resource registry, the read-through, and hydration into Dexie. |
| `db/database.ts` | The Dexie schema, and the read/write API views actually call. |
| `services/sync.ts` | The outbox: push, retry, realtime, and conflict resolution. |

**The registry is the single source of truth for what syncs.** Adding a cloud table means adding it
to `CLOUD_RESOURCE_MAP`, not writing a bespoke fetch beside it. A resource that is not in the
registry gets no freshness, no dedupe, no hydration guard, and no missing-table tolerance.

---

## Reads — the online-first contract

1. **Every read that a user sees goes through `ensureFresh` first.** A view that reads Dexie
   directly is reading whatever this browser happened to cache, which on a second device is
   arbitrarily stale with nothing on screen saying so.
2. **The cache is the fallback, never the source.** When the cloud is unreachable, serve the cache —
   and the screen must be able to say that is what happened.
3. **Freshness is a TTL plus in-flight dedupe.** Ten views mounting at once produce one request. A
   failed fetch is never marked fresh.
4. **`force: true` at the moments the cache is least trustworthy**: login, reconnect, and any
   explicit refresh.
5. **A missing table is tolerated, not fatal.** `PGRST205` and `42P01` mean a migration has not been
   applied yet; treat the resource as empty and carry on. The app must survive a database that is
   one migration behind the bundle, because during every release it is.

**Internal reads are different.** A read-back inside a write path — checking what was just written —
must use `db.<store>.get()`, not the public read helper. Going through `ensureFresh` there makes the
write race its own confirmation, which is how a payment could revert itself.

---

## Writes — the reconcile contract

1. **Write locally first, mark it unsynced, then push.** The cashier does not wait for the network.
2. **Every push failure is queued and retried.** `markPushPending` on both the disconnected
   early-return *and* the catch. A helper that returns quietly on either path drops the write
   forever — that was ten separate helpers, once.
3. **A permanent refusal is surfaced, not looped.** RLS denial and constraint violations will never
   succeed on retry. Record them in `lastSyncError` and put them somewhere a human looks.
4. **Never report success before the server agreed.** "Staff member added" and "Order deleted" were
   both printed on the strength of a local write; both were false. Await the write, report what came
   back, and say what was and was not saved.
5. **Hydration must not clobber a queued write.** `hasUnpushedLocalEdit` guards
   `replaceLocalStore`/`mergeLocalStore`. A new store that hydrates without that guard will silently
   discard the order a cashier took while offline.
6. **A stale push must not resurrect a dead row.** Compare against server state before pushing
   (`serverOrderIsNewer` / `adoptServerOrder`). A queued update from twenty minutes ago must not
   un-cancel an order that was cancelled since.
7. **Allocation collides.** Order numbers are allocated on-device; two tills in the same second pick
   the same one. Retry on the unique violation rather than failing the sale.
8. **Device-local fields are never published, and never silently permanent.** `imageData` is local
   by design because the cloud column is a `varchar(500)`. Anything local-only needs a visible
   "not everywhere yet" state and a retry, or it diverges forever on one device.

---

## The six failures, and the probe for each

Every defect this subsystem has produced has been one of these. Probe all six on any change here.

| # | Failure | The probe |
|---|---|---|
| 1 | **The queued write that vanishes** | Kill the network mid-write. Reconnect. Is the row there, and did anything tell the operator while it was not? |
| 2 | **Hydration eats a local edit** | Queue a write offline, then force a full pull before it drains. Is the local edit still there? |
| 3 | **The stale push** | Queue an update, change the same row from another device, reconnect. Does the old value win? |
| 4 | **The self-racing read-back** | Write, then immediately read the same row in the same handler. Does the read revert the write? |
| 5 | **The collision** | Two devices, same second, same allocation. Does one sale fail? |
| 6 | **The silent divergence** | Make the server refuse a write permanently (wrong role, missing migration). Does anything on screen ever say so? |

**Probe 6 is the one that gets skipped and the one that costs most**, because its symptom is not an
error — it is a device that looks correct and is not.

---

## Changing the Dexie schema

A version bump is **at least T2**, and T3 if it rewrites existing rows.

- Versions are append-only. Never edit a shipped `db.version(n).stores({...})`.
- An upgrade runs on a device that has been offline for a week, with unsynced rows in the outbox.
  Write the upgrade so it preserves them.
- Two tabs: one on the old version, one upgrading. Dexie blocks. Decide what the user sees.
- New store → add it to the registry, the hydration guard, and the push path, or it will be a store
  that fills up and never syncs.

## Changing an RLS policy or a role

- The role list exists in **three** places — `authGuards.ts`, the `staff-admin` Edge Function, and
  the Postgres CHECK constraint. A change to one without the others produces an account that appears
  to save and does not work. There is a contract test; keep it passing.
- A policy change is a **migration**, and a migration is a separate deploy from the web bundle. See
  the three-deploy rule in `founder-mode`.
- After any role change, walk the role × screen matrix for all eight roles. Not the one you changed.

---

## What a change here must prove

Before a data-layer change is done, it has all of:

- [ ] The read path goes through `ensureFresh`, or there is a written reason it does not
- [ ] Every new write path calls `markPushPending` on **both** the early-return and the catch
- [ ] A permanent refusal reaches `lastSyncError` and a human-visible surface
- [ ] Hydration of any new store is guarded by `hasUnpushedLocalEdit`
- [ ] The success message fires after the server answered, and names the refusal when it did not
- [ ] All six probes above run, with the offline one done for real, not reasoned about
- [ ] A test that fails without the fix, for every defect found
- [ ] Clean-state verification with an **empty IndexedDB** — a seeded cache hides every one of these

**The last line is the one that matters most.** Every failure in the table above is invisible on a
device whose cache already has the right answer. If you have not tested from an empty IndexedDB, you
have not tested the data layer at all.

---

## Relationship to the other skills

- **`founder-mode`** names this subsystem's four money paths and requires R0–R8 on them. This file
  is what "correct" means for the data layer; that file is the process for proving it.
- **`.agents/AGENTS.md` directive 2** forbids naive last-write-wins. The staleness checks above are
  the current implementation of that rule, not an alternative to it.
- **`supabase-postgres-best-practices`** governs the query and index design underneath.
- **`taste-os-design`** owns what offline and stale *look* like; this file owns when they are true.
