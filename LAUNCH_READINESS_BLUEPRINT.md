# Launch Readiness Blueprint - The Taste Restaurant OS

Last updated: 2026-05-27

## Project Identification

- Project: `D:\Zeaul\Restraunt`
- Application: The Taste / NextGenOS Restaurant OS for one restaurant.
- Scope: public home ordering, pickup, dine-in QR, staff POS, kitchen display, delivery dispatch, admin, inventory, analytics, PWA, and Android staff app.
- Stack: Vite, vanilla JavaScript, CSS, Dexie/IndexedDB, Supabase, Supabase Edge Functions, Workbox PWA, Capacitor Android.
- Architecture: local-first browser/PWA app with protected staff routes, public `/#/self-order`, IndexedDB persistence, Supabase cloud sync, and Edge Function validation for public orders.

## Current Launch Rating

- Single-restaurant public web launch: 88 / 100
- Investor/demo readiness: 93 / 100
- Enterprise readiness: 51 / 100
- Global SaaS readiness: 39 / 100
- Local implementation progress: 90%
- Production launch gates verified: 0 / 9 external gates
- Launch decision: no-go for public worldwide launch until live Supabase migration, Edge Function deployment, production domain, live RLS tests, monitoring, backup restore drill, and signed Android release are verified.

## Completed This Phase

- Recreated this blueprint as the persistent source of truth.
- Replaced destructive Supabase schema reset with a safe, non-dropping launch schema.
- Added `client_order_id`, `idempotency_key`, `display_token`, validation status, sync diagnostics, staff membership, audit events, and public order rate limit tables.
- Added staff-membership based RLS so authenticated staff access is tied to `auth.uid()`.
- Removed stored Supabase staff password reliance from frontend settings.
- Added transient cloud staff sign-in/sign-out for Supabase Auth sessions.
- Added `supabase/functions/public-order` to validate public orders server-side, recompute totals, enforce payment/order rules, rate limit abuse, and write orders with service role credentials.
- Added local order UUID/idempotency metadata and offline pending validation fallback.
- Added Playwright and Axe accessibility test scaffolding across launch routes.
- Added GitHub Actions launch readiness workflow for tests, audit, build, E2E, accessibility, Lighthouse, and conditional Android signed build.
- Fixed launch-test regressions found during verification: seeded settings now use idempotent writes, Dexie `tables` access now avoids the reserved `db.tables` property, and Playwright device projects run consistently on Chromium in local and CI environments.
- Verified public ordering/staff gate/checkout validation across desktop, iPhone SE, iPhone 15, Pixel-sized Android, and iPad emulation.
- Rebuilt the public customer route from a kiosk-style menu grid into a real storefront website with hero imagery, public navigation, delivery/pickup/dine-in service modes, popular items, category imagery, menu sections, sticky cart, polished cart/checkout/success states, and mobile-first responsive behavior.
- Added project-local generated bitmap food assets under `public/assets/` so the storefront has visual product presentation without relying on remote stock images.
- Added a Playwright horizontal-overflow launch test across the full device matrix.

## Phase Tracker

| Phase | Status | Completion | Evidence |
| --- | --- | ---: | --- |
| 1. Public entry and owner setup | Complete | 100% | `/` routes to `/#/self-order`; staff routes protected. |
| 2. Public order validation | Code complete, deployment pending | 82% | Edge Function added; local checkout validation covered; live deploy not verified. |
| 3. Hybrid PIN + cloud auth | Partial | 68% | Local PIN retained; cloud session added; staff membership binding needs live setup. |
| 4. Safe Supabase schema/RLS | Code complete, live apply pending | 76% | Non-destructive SQL exists; production project not migrated in this session. |
| 5. Offline/idempotent sync | Partial | 78% | UUID/idempotency fields added; Dexie migration fixed; live conflict testing still pending. |
| 6. Premium mobile/customer UX | Code complete, real-device QA pending | 88% | Storefront website added; local desktop/mobile screenshots reviewed; 25/25 Playwright checks passed including no horizontal overflow. |
| 7. Admin/staff operations | Partial | 76% | Delivery/payment ops exist; audit log display and polished monitoring views still pending. |
| 8. DevOps/QA | Partial | 82% | Local unit/build/audit/E2E/a11y passed; CI run and Lighthouse threshold enforcement pending. |
| 9. Android release | Blocked | 45% | Release config exists; signed APK/AAB requires keystore secrets. |

## Progress Tracker

- Completed local implementation tasks: 13 / 14
- Completed production launch gates: 0 / 9
- Current milestone: production environment verification.
- Completed now: public entry verification, premium storefront UI, staff route protection, checkout validation, safe Supabase migration file, public-order Edge Function, cloud password removal, UUID/idempotent order sync metadata, CI workflow, local unit/build/audit/E2E/a11y verification.
- Still pending: production Supabase migration, Edge Function deploy, live RLS proof, production domain/env setup, Lighthouse score target, monitoring/alerting, backup restore drill, signed Android build, real-device smoke tests.

## P0 Launch Gates

- Apply `supabase-schema.sql` to the production Supabase project.
- Deploy `supabase/functions/public-order` with `SUPABASE_SERVICE_ROLE_KEY`, `STORE_ID`, `GST_PERCENT`, `ORDER_PREFIX`, and rate-limit salt configured.
- Create Supabase Auth staff users and `staff_memberships` rows for owner/manager/staff accounts.
- Configure production Vercel domain and environment variables with only public Supabase URL/anon key.
- Run `npm.cmd run launch:verify`, Playwright E2E, Axe accessibility, and Lighthouse in CI.
- Run real-device QA on iPhone SE, modern iPhone, small Android, tablet, desktop, kitchen display, and staff Android device.
- Complete a backup export and restore drill on a copy of live data.
- Provide Android keystore secrets and produce a signed release artifact.
- Add production monitoring/error reporting and an incident/contact process.

## Remaining Risks

- Public order Edge Function is implemented but not deployed or load-tested.
- RLS is stronger, but must be verified in the actual Supabase project using anon and authenticated test users.
- Client is still a vanilla JS SPA with many inline templates; the public route has been improved, but remaining admin/staff legacy XSS and accessibility audit must continue.
- Local PIN unlock is operationally fast but not enterprise-grade without cloud staff session enforcement and device approval policy.
- Offline public order fallback can queue pending validation, but customers must be operationally handled if cloud validation remains unavailable.
- No payment gateway/webhook exists; manual UPI verification depends on staff discipline.
- No live monitoring, synthetic checks, or alerting is configured yet.

## Verification Log

- Passed: `npm.cmd run launch:verify`
- Passed: `npm.cmd test` - 6 / 6 unit tests.
- Passed: `npm.cmd run build` - Vite production build completed; remaining warnings are chunking warnings for modules that are both static and dynamic imports.
- Passed: `npm.cmd audit --omit=dev` - 0 production vulnerabilities.
- Passed: `npm.cmd run test:e2e` - 25 / 25 Playwright tests across Desktop Chrome, iPhone SE, iPhone 15, Pixel 5, and iPad emulation.
- Passed: Axe critical accessibility check on public ordering route across the same Playwright device matrix.
- Passed: public storefront horizontal-overflow checks across the same Playwright device matrix.
- Visual evidence: `test-results/desktop-storefront-v2.png` and `test-results/mobile-storefront-v2.png` captured locally for review.
- Pending external: production Supabase migration, Edge Function deploy, live RLS tests, Vercel/domain deploy, Lighthouse CI threshold proof, monitoring setup, backup restore drill, signed Android build, real-device smoke testing.
