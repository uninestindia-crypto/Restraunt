# NextGenOS Developer & AI Agent Rules

All development agents (including AI assistants) modifying the codebase at `d:\Zeaul\Restraunt` must strictly adhere to the rules and standards established in the workspace skill: [SKILL.md](file:///d:/Zeaul/Restraunt/.agents/skills/tier-1-engineering-standards/SKILL.md).

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

