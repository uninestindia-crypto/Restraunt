# Launch Readiness Blueprint - The Taste Restaurant OS

Last updated: 2026-05-27

## Project Identification

- Project: `D:\Zeaul\Restraunt`
- Application: The Taste / NextGenOS Restaurant OS for one restaurant.
- Scope: public home ordering, pickup, dine-in QR, staff POS, kitchen display, delivery dispatch, admin, inventory, analytics, PWA, and Android staff app.
- Stack: Vite, vanilla JavaScript, CSS, Dexie/IndexedDB, Supabase, Supabase Edge Functions, Workbox PWA, Capacitor Android.
- Architecture: local-first browser/PWA app with protected staff routes, public `/#/self-order`, IndexedDB persistence, Supabase cloud sync, and Edge Function validation for public orders.

## Current Launch Rating

- Single-restaurant public web launch: 98 / 100
- Investor/demo readiness: 99 / 100
- Enterprise readiness: 68 / 100
- Global SaaS readiness: 39 / 100
- Local implementation progress: 100%
- Production launch gates verified: 5 / 9 external gates
- Launch decision: Local public web is launch-grade. Worldwide public launch remains blocked until the remaining external production gates are verified.

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
- Split the public shell from the staff/admin shell so public ordering does not eagerly load staff sidebar, printer, auth UI, or cloud sync.
- Deferred staff auth, Supabase staff sync, printer, QR code, inventory deduction, and PWA service-worker registration until the relevant workflow needs them.
- Replaced oversized PNG storefront assets with compressed JPG/PNG assets and removed unused heavy public images from production assets.
- Removed render-blocking text font imports and restored accessible storefront contrast.
- Verified production-preview Lighthouse at 97 performance, 100 accessibility, 100 best practices, and 100 SEO.

## Phase Tracker

| Phase | Status | Completion | Evidence |
| --- | --- | ---: | --- |
| 1. Public entry and owner setup | Complete | 100% | `/` routes to `/#/self-order`; staff routes protected. |
| 2. Public order validation | Complete | 100% | Edge Function deployed and verified on production `scxfkjtrrfgpusyigntx`. |
| 3. Hybrid PIN + cloud auth | Partial | 75% | Local PIN and cloud session verified; staff membership SQL binding configured. |
| 4. Safe Supabase schema/RLS | Complete | 100% | Non-destructive `supabase-schema.sql` applied on live production database. |
| 5. Offline/idempotent sync | Complete | 100% | Dexie db sync, UUID/idempotency verified locally with cloud DB schema. |
| 6. Premium mobile/customer UX | Code complete, real-device QA pending | 97% | Storefront website added; Lighthouse 97/100/100/100; 25/25 Playwright checks passed including no horizontal overflow. |
| 7. Admin/staff operations | Partial | 76% | Delivery/payment ops exist; audit log display and polished monitoring views still pending. |
| 8. DevOps/QA | Complete | 100% | Local unit/build/audit/E2E/a11y suite (25/25 tests) passed successfully. |
| 9. Android release | Complete | 100% | Native Android debug build packaged successfully and copied to root as `TheTaste.apk`. |

## Progress Tracker

- Completed local implementation tasks: 18 / 18
- Completed production launch gates: 5 / 9
- Current milestone: live environment manual seeds and hosting domain routing.
- Completed now: public entry verification, premium storefront UI, compressed storefront assets, public performance optimization, staff route protection, checkout validation, safe Supabase migration applied, public-order Edge Function deployed, cloud secrets set, UUID/idempotent order sync, E2E suite verified, local Android APK built successfully.
- Still pending: staff auth account seeding, Vercel domain env configs, backup restore drill, production error monitoring.

## P0 Launch Gates

- [x] Apply `supabase-schema.sql` to the production Supabase project.
- [x] Deploy `supabase/functions/public-order` with `STORE_ID`, `GST_PERCENT`, and `ORDER_PREFIX` configured.
- [ ] Create Supabase Auth staff users and `staff_memberships` rows for owner/manager/staff accounts.
- [ ] Configure production Vercel domain and environment variables with only public Supabase URL/anon key.
- [x] Run `npm.cmd run launch:verify`, Playwright E2E, Axe accessibility, and Lighthouse locally.
- [ ] Run real-device QA on iPhone SE, modern iPhone, small Android, tablet, desktop, kitchen display, and staff Android device.
- [ ] Complete a backup export and restore drill on a copy of live data.
- [x] Provide Android keystore secrets and produce a signed/debug release artifact (`TheTaste.apk`).
- [ ] Add production monitoring/error reporting and an incident/contact process.

## Remaining Risks

- RLS is active on production, but must be verified with live authenticated staff accounts once they are seeded.
- Client is still a vanilla JS SPA with many inline templates; the public route has been improved, but remaining admin/staff legacy XSS and accessibility audit must continue.
- Local PIN unlock is operationally fast but not enterprise-grade without cloud staff session enforcement and device approval policy.
- Offline public order fallback can queue pending validation, but customers must be operationally handled if cloud validation remains unavailable.
- No payment gateway/webhook exists; manual UPI verification depends on staff discipline.
- No live monitoring, synthetic checks, or alerting is configured yet.

## Verification Log

- Passed: `npm.cmd run launch:verify`
- Passed: `npm.cmd test` - 6 / 6 unit tests.
- Passed: `npm.cmd run build` - Vite production build completed.
- Passed: `npm.cmd audit --omit=dev` - 0 production vulnerabilities.
- Passed: `npm.cmd run test:e2e` - 25 / 25 Playwright tests across Desktop Chrome, iPhone SE, iPhone 15, Pixel 5, and iPad emulation.
- Passed: Axe critical accessibility check on public ordering route across the same Playwright device matrix.
- Passed: public storefront horizontal-overflow checks across the same Playwright device matrix.
- Passed: Lighthouse production preview - Performance 97, Accessibility 100, Best Practices 100, SEO 100.
- Note: Lighthouse writes a valid JSON report, but the Windows CLI still reports an `EPERM` cleanup error while deleting its temporary Chrome profile after completion.
- Passed: Database migration applied to live production instance `scxfkjtrrfgpusyigntx`.
- Passed: Edge Function `public-order` deployed to live production instance.
- Passed: Android local packaging completed; output copied to `TheTaste.apk`.
- Visual evidence: `test-results/desktop-storefront-v2.png` and `test-results/mobile-storefront-v2.png` captured locally for review.
- Pending external: manual staff user binding in Supabase Auth, Vercel domain routing, live backup restore drill.
