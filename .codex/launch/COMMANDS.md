# COMMANDS — The Taste

Every command below was run in this repository. Anything not run is under
[Unverified](#unverified--do-not-cite-as-evidence) and may not be cited as gate evidence.

Written per `founder-mode/references/08-bootstrap.md`. Re-verify when `package.json` changes.

## Verified

| Ring / need | Command | Notes |
|---|---|---|
| Install | `npm ci` | Restores the lockfile exactly. Keeps the `libc` fields on the optional platform binaries — `npm audit fix` strips them, so check after any dependency change. |
| Typecheck | `npm run typecheck` | `tsc --noEmit`. **Only meaningful alongside the suppression count below.** |
| Dependency audit | `npm audit` | Part of `launch:verify`; it is the step that used to fail the whole chain. |
| Migration validation | `npm run db:validate` | Parses every migration in deterministic order. |
| Unit / contract / integration | `npm test` | `tsx --test tests/**/*.test.ts`, with `fake-indexeddb` for the Dexie paths. |
| Build | `npm run build` | env check → menu snapshot → `next build` → `harden-static-export.js`. Regenerates `public/sitemap.xml`, so the tree is dirty afterwards. |
| Serve the build | `npm run preview` | `serve dist -l 3000`. Playwright starts this itself. |
| E2E | `npm run test:e2e` | Builds, then Playwright across five device projects. |
| Accessibility | `npm run test:a11y` | Needs a build in `dist/` first. |
| Everything CI runs | `npm run launch:verify` | `db:validate → typecheck → test → audit → build → playwright`. |

**Chromium note.** The browser is pre-installed at `/opt/pw-browsers`; do not run
`playwright install`.

## Unverified — do not cite as evidence

| Need | Command | Why it is unverified here |
|---|---|---|
| Apply migrations | Supabase SQL editor, or `supabase db push` | Needs the project's credentials. A human step, never CI. |
| Deploy Edge Functions | `npx supabase functions deploy <name>` | Needs `SUPABASE_ACCESS_TOKEN`. A human step. |
| Deploy web | Vercel Git integration on push to `main` | Runs outside this repository. |
| Rollback web | Redeploy the previous Vercel build | **Never rehearsed. See the gaps below.** |

## Baseline

```
BASELINE (clean checkout, 2026-08-13, fde1091)

typecheck:    0 errors        suppressed: 0 files          ← was 0 errors / 66 files suppressed
audit:        0 vulnerabilities
db:validate:  13 migrations parsed
unit:         152 passed, 0 failed
e2e:          90 passed, 0 failed  (5 viewport projects)
build:        ok
largest JS chunk: 224 KB
```

The suppression count is recorded next to the error count deliberately. Before this baseline the
first number was 0 and the second was 66, and the pair is the only honest way to read either: a
green typecheck over three quarters of a codebase it is not allowed to read measures nothing.
**The rule from here is that the suppression count only ever goes down.** `tests/static_analysis_baseline.test.ts`
enforces it.

## Gaps found

These are findings, not chores. Each one is a gate that will block a release later.

1. **No migration rollback exists.** There are no down-migrations, so G7.6 ("rollback executed and
   timed") cannot pass for anything touching the schema. This is a **G7 blocker for T3+ work**.
   Closing it means either writing reversals for the migrations that have them, or accepting in
   writing that schema changes are forward-only and designing every one to be additive.
2. **No staging environment with its own Supabase project.** G7.3 ("deployed to a production-like
   environment") currently has nowhere to run. Every migration is therefore first executed against
   production data.
3. **No linter.** R0 is typecheck + audit only. There is no formatter check, no dead-code detection,
   and no secret-scanning tool — the secret check is a grep.
4. **No monitoring or alerting.** G7.7 ("every monitor fired and confirmed to reach a human") has
   nothing to fire. There is no way to learn that the storefront stopped taking orders except for
   someone noticing.
5. **The web rollback has never been executed.** It is a plausible paragraph, not a rehearsed
   procedure, and its duration is unknown.
6. **Seeding writes 25 demo orders with `isSynced: 0`.** On a fresh device pointed at a real store,
   `pushUnsynced()` will upload them to production.

Ranked by what each costs at G7: 1 and 2 move a launch date; 4 and 5 turn a bad launch into a long
one; 3 and 6 are contained.
