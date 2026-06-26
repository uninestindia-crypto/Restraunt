---
name: tier-1-engineering-standards
description: Software engineering guidelines for building modular, secure, and sync-safe web platforms. Prevents spaghetti UI strings and sync conflicts.
---

# 🏆 Tier-1 Software Engineering Standards (Google, Microsoft, & Apple Level)

This document establishes the architectural rules and standards required to build high-fidelity, robust, and secure software systems, preventing common prototyping shortcuts. All development on this repository must align with these choices.

---

## 1. UI Component Architecture: Reactive Framework Migration
To maintain clean, readable, and highly testable user interfaces:
*   **Modularity & State Binding**: Do not write or append monolithic HTML strings (`container.innerHTML = '...'`). Views must be refactored into declarative, modular sub-components.
*   **Framework standard**: The codebase must transition to a lightweight, reactive component framework (**Preact** or **Svelte**). This enables structured lifecycle hooks, unified state bindings, and virtual DOM diffing to keep interactions under 100ms.
*   **Testability**: Every UI component must separate rendering logic from core business actions to ensure components can be unit-tested without rendering a full browser wrapper.

---

## 2. Synchronization & Collaborative State: CRDT Engine
To prevent split-brain states and quiet overrides across offline devices:
*   **No Simple LWW Sync**: Ad-hoc synchronization loops and naive Last-Write-Wins (LWW) overrides are prohibited.
*   **CRDT Engine Standard**: The database layer must utilize a mathematical **Conflict-Free Replicated Data Type (CRDT)** structure (such as **Replicache** or **Automerge** over Dexie and Supabase).
*   **State Conflict Safety**: When multiple cashiers or QR-ordering customers perform edits offline, the local database must merge state operations deterministically, preserving concurrent cart additions and table updates without data loss.

---

## 3. Security & Transaction Validation Boundaries: Server-Side Edge sandbox
To prevent frontend tampering and price manipulations:
*   **Zero-Trust Clients**: Frontend devices are untrusted. Do not calculate sales totals, tax distributions, discount logic, or user privilege level elevations on the client.
*   **Edge Compute Standard**: The client device must only submit a list of item IDs, quantities, and coupon tags. All final calculations, tax matrices, and permissions must be computed and verified inside a secure **remote edge sandbox trigger** (Supabase Edge Functions / Postgres server triggers) before the order is finalized in the database.
*   **Session Separation**: Keep customer loyalty/ordering views completely decoupled from administrative POS interfaces. Administrative actions must be guarded by strict Postgres Row-Level Security (RLS) policies linked directly to authenticated staff sessions.

---

## 4. UI Performance & Web Vitals
To match Google/Apple user experiences:
*   **Skeleton Screens**: Render CSS shimmer loading blocks while queries resolve to eliminate cumulative layout shifts (CLS).
*   **Progressive Image Loading**: Store image resources as compressed WebP formats. Load small blurred previews first, progressively upgrading once high-res assets load.
*   **Tactile Physics**: All interactive drawers, carousels, and checkout steps must use spring-based micro-animations to feel immediate and physical.
