# NextGenOS Developer & AI Agent Rules

All development agents (including AI assistants) modifying this codebase must strictly adhere to the rules and standards established in the workspace skill: [tier-1-engineering-standards](./skills/tier-1-engineering-standards/SKILL.md).

## The workspace skills, and what each one governs

| Skill | Governs | Load it |
|---|---|---|
| [`tier-1-engineering-standards`](./skills/tier-1-engineering-standards/SKILL.md) | Architecture: component modularity, sync safety, server-side trust boundaries | Before any structural change |
| [`founder-mode`](./skills/founder-mode/SKILL.md) | Process: phases, evidence gates, test rings, tiers, release and rollback | Before any substantial feature, migration, role change, or release; and whenever asked "is it ready?" |
| [`taste-os-design`](./skills/taste-os-design/SKILL.md) | Design: the two themes, type, space, colour, motion, components, accessibility, copy | Before the first line of markup or CSS |
| [`offline-first-data`](./skills/offline-first-data/SKILL.md) | Data: the online-first read contract, the write-and-reconcile contract, Dexie versions, the push queue | Before touching `db/`, `cloudDb`, `sync`, a schema version, or an RLS policy |
| [`supabase`](./skills/supabase/SKILL.md), [`supabase-postgres-best-practices`](./skills/supabase-postgres-best-practices/SKILL.md) | Database: RLS, indexing, pagination, locks | Before designing a migration or a query |

**Precedence.** This file and `tier-1-engineering-standards` outrank the others on anything they
cover. `founder-mode` supplies the process and defers to `taste-os-design` at its taste gate and to
the Supabase skills for database design.

## Critical Directives

1. **Anti-Spaghetti UI Directive**:
   * Do not write or append inline concatenated HTML strings in JavaScript files.
   * Modifying views must involve refactoring monolithic components into declarative, modular sub-components (using Preact or Svelte).

2. **Sync-Safety & Transaction Boundaries**:
   * Do not implement simple Last-Write-Wins (LWW) mechanisms for collaborative data.
   * All shared states (e.g. active carts, cashiers, kitchen tickets) must be mapped to transactional event logs or mathematical CRDT stores (using Automerge or Replicache).

3. **Insecure Client-Calculation Prevention**:
   * Client devices are untrusted. Do not calculate sales totals, tax distributions, or privilege level elevations in the frontend. All transaction validations must execute inside secure remote edge sandbox triggers (Supabase Edge Functions).

4. **Session Separation Safeguards**:
   * Keep customer loyalty operations and internal cashier POS operations completely decoupled.
   * Never instantiate or overlap public customer views with administrative local PIN authentication interfaces.

5. **Git Author & Vercel Deployment Safeguard**:
   * All Git commits in this repository MUST be authored using `uninestindia-crypto` and `uninestindia@gmail.com`.
   * Never alter `user.email` or modify `.githooks/pre-commit` away from `uninestindia@gmail.com` to prevent Vercel deployment block errors.

