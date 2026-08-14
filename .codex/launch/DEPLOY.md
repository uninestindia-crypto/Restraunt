# DEPLOY — how this product actually ships

`.github/workflows/deploy.yml`. Read this before setting the secrets.

## The three artifacts

A release here is up to three independent things, and historically only one of them shipped itself.
That asymmetry is why fixes landed on `main` and were reported as still broken.

| # | Artifact | Automated? | Reversible? |
|---|---|---|---|
| 1 | Migrations | **No — manual, on purpose** | **No.** Forward-only; there are no down-migrations. |
| 2 | Edge Functions | Yes, after Launch Readiness passes | Yes — redeploy the previous version |
| 3 | Web bundle | Yes, after Launch Readiness passes | Yes — redeploy the previous build |

**Order matters when a release needs more than one:** migrations, then functions, then the bundle.
The new bundle must never be the first thing to ask for a column or a function that does not exist.

## Why migrations are not automated

This repository has no down-migrations. Every migration is forward-only against a production
database holding real order history, and `trg_prevent_delete_orders` exists precisely because that
data is not casually recoverable. Auto-applying schema changes on every merge, with no rehearsed
rollback, is the most dangerous thing this pipeline could do.

To apply them: **Actions → Deploy → Run workflow**, and type the project ref into
`confirm_migrations`. The job refuses if it does not match. Take a backup first.

## Secrets to set

**Settings → Secrets and variables → Actions.** Missing secrets make the workflow *skip* with a
warning rather than fail, so an unconfigured repo does not go permanently red.

| Secret | For | Where to get it |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Functions, migrations | Supabase → Account → Access Tokens |
| `SUPABASE_PROJECT_REF` | Functions, migrations | `scxfkjtrrfgpusyigntx` |
| `SUPABASE_DB_PASSWORD` | Migrations only | The database password |
| `VERCEL_TOKEN` | Web | Vercel → Settings → Tokens |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Web | `.vercel/project.json` after `vercel link` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Web build | The project's API settings. Public by design. |
| `PRODUCTION_URL` | Smoke check | e.g. `https://thetaste.in` |

Two environments gate the sensitive jobs: `production` (functions, web) and `production-database`
(migrations). Add required reviewers to either in **Settings → Environments** if you want a human
approval step before a deploy runs.

## Check this first

On 2026-08-14, `main` was at `ff88307` and production was serving an older build — the same asset
path returned 200 with different content. Either the Vercel Git integration is not connected to this
repository, or it is building a different branch.

**Before adding `VERCEL_TOKEN`, open Vercel and confirm the project is connected to
`uninestindia-crypto/restraunt` and building from `main`.** If it is disconnected, this workflow will
deploy correctly while the integration continues to do nothing — and you will have two mechanisms
disagreeing about what is live, which is worse than one that is broken.

If the integration is working, disable its production deploys and let this workflow own them.
Two things deploying the same branch race, and the loser silently wins.

## What "deployed" means here

Every job verifies rather than assuming, because "the command exited 0" is not evidence:

- **Functions:** an unauthenticated POST to each of the four must return something other than 404.
  A 401 proves it is deployed and reachable; a 404 proves it is not there.
- **Web:** the deployment URL and `/menu` must return 200 *and* render the storefront, then the
  production domain is checked after the alias has had time to move.

The `report` job writes a table to the run summary saying which of the three actually shipped, and
names any secret that was missing. That table is the answer to "is it live?".
