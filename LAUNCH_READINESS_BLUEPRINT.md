# Launch Readiness Blueprint

Project: The Taste / NextGenOS Restaurant OS
Repository: d:\Zeaul\Restraunt
Assessment date: 2026-05-27

## Executive Verdict

Current launch rating: 38 / 100

Launch decision: Do not launch publicly yet.

The product is a strong prototype and can be used for an internal demo or a tightly controlled pilot with backup procedures. It is not ready for a whole-world launch because authentication, cloud security, tenant isolation, payment verification, data safety, release packaging, and automated QA are not at production standard yet.

Practical readiness levels:

| Use case | Rating | Decision |
| --- | ---: | --- |
| Product demo | 75% | Ready with caveats |
| Single trusted restaurant pilot | 45% | Possible only with supervision |
| Paid customer rollout | 30% | Not ready |
| Whole-world public launch | 20% | Blocked |

## Completion Tracker

Overall completion baseline: 38%

| Area | Completion | Current state | Launch gate |
| --- | ---: | --- | --- |
| Core POS order flow | 65% | Menu, cart, UPI QR, cash flow, receipt path, kitchen queue exist | Needs end-to-end QA, refunds/cancellations, payment reconciliation, order id cleanup |
| Kitchen display | 60% | Confirmed/preparing/ready/completed workflow exists | Needs real-time validation, load testing, edge-case handling |
| Self-order kiosk | 45% | View exists and public route boot has been started, but category data path still needs validation | Must work without staff login and load menu reliably |
| Online home ordering | 20% | Required customer-facing channel for people ordering from home is now tracked, but not production-ready | Needs public URL, pickup/delivery choice, address/contact capture, payment status clarity, and cloud-backed order intake |
| Auth and RBAC | 30% | Staff PIN login and route roles exist | Must remove hardcoded defaults, fix first-run owner seed, add lockout/session hardening |
| Admin/settings | 55% | Restaurant profile, printer, sync, backup, reports settings exist | Needs stronger validation, safer secrets handling, production onboarding flow |
| Cloud sync | 30% | Supabase client, realtime hooks, and push/pull logic exist | Must add RLS, tenant isolation, conflict policy, schema parity, retry guarantees |
| Data model and migrations | 45% | Dexie v3 schema and Supabase SQL exist | Must fix local/remote schema mismatch, first-run migrations, demo data separation |
| Payments and tax | 35% | UPI QR and cash recording exist; GST percent configurable | Needs payment confirmation, settlement/reconciliation, invoice/legal review |
| Inventory | 40% | Stock/supplier UI and deduction hook exist | Needs recipe mapping, audit trail, units, purchasing workflow, tested deduction rules |
| Customer CRM | 50% | Customer records, loyalty points, tiers exist | Needs consent/privacy controls, de-duplication, export/delete flows |
| Staff operations | 45% | Staff CRUD, roles, shifts/activity tabs exist | Needs secure PIN reset, role audit, timesheet accuracy, manager approvals |
| Reporting/analytics/AI | 45% | Reports, dashboard, keyword AI assistant exist | Needs verified calculations, dependency remediation, clear "local assistant" positioning |
| Security/privacy | 20% | Some PIN hashing exists | Blocked by XSS risk, weak PIN model, no server-side authorization, exposed client-side sync model |
| PWA/web deployment | 55% | Vite build passes, PWA service worker generates | Needs production hosting headers, offline QA, cache/update strategy |
| Android distribution | 35% | Capacitor project and APK builder exist | Must produce signed release build, remove debug assumptions, review permissions/backup |
| Testing/QA | 10% | Build command passes; no app test suite found | Needs unit, integration, e2e, device, offline, sync, printer, payment tests |
| Observability/support | 15% | Console logging exists | Needs crash/error reporting, audit dashboards, support playbooks, backups |
| Documentation/operations | 45% | Platform blueprint and changelog exist | Needs deployment guide, runbook, onboarding, incident response, compliance checklist |

## P0 Launch Blockers

These items must be complete before any public or paid launch.

| ID | Status | Task | Acceptance criteria |
| --- | --- | --- | --- |
| P0-01 | Not started | Fix first-run authentication | Fresh install creates an owner with hashed PIN, no plain default PIN, forced first-run PIN change |
| P0-02 | Not started | Remove hardcoded production credentials/defaults | No default `1234` admin/staff access in production builds; setup wizard required |
| P0-03 | Partial | Make self-order route truly public | `/#/self-order` loads without staff login and can place orders into the kitchen flow |
| P0-04 | Not started | Fix menu/category data access | Category menu queries work with IndexedDB indexes or use a tested non-indexed path |
| P0-05 | Not started | Add Supabase RLS and tenant isolation | Every remote table has row-level security; anon key cannot read/write other restaurants |
| P0-06 | Not started | Align local and remote schemas | Orders, staff, tables, inventory, customers sync all required fields both ways |
| P0-07 | Not started | Add sync conflict and retry policy | Multi-device writes do not silently overwrite data; failed sync is visible and recoverable |
| P0-08 | Not started | Escape/sanitize rendered data | User/admin/customer/menu/order values cannot inject HTML or script into the UI |
| P0-09 | Not started | Replace or mitigate vulnerable `xlsx` dependency | `npm audit --omit=dev` has no high/critical production vulnerabilities |
| P0-10 | Not started | Add core automated tests | POS order, payment, kitchen, self-order, admin auth, sync mapping, and backup restore are covered |
| P0-11 | Not started | Produce release Android build | Signed release APK/AAB, versioning, minify/shrinking review, backup/permissions reviewed |
| P0-12 | Not started | Payment verification strategy | UPI/cash statuses are auditable; unpaid/pending/paid cannot be confused in reports |
| P0-13 | Not started | Production data policy | Demo seed data cannot pollute real stores; import/export handles PII safely |
| P0-14 | Not started | Operational backups and restore drill | Daily backup and tested restore process exists before live use |
| P0-15 | Not started | Online home ordering channel | Customers can order from home through a public URL with pickup/delivery details, payment state, and order sync into restaurant operations |

P0 progress: 0 / 15 complete, 0%

## P1 Production Hardening

| ID | Status | Task |
| --- | --- | --- |
| P1-01 | Not started | Add rate limiting/lockout for PIN attempts |
| P1-02 | Not started | Add owner setup wizard and staff invite/reset flow |
| P1-03 | Not started | Add cancellation, refund, void, discount, and comp workflows |
| P1-04 | Not started | Add receipt numbering/invoice compliance review for GST/FSSAI use |
| P1-05 | Not started | Add stock purchase, wastage, adjustment, and audit log flows |
| P1-06 | Not started | Add customer consent, data deletion, and privacy controls |
| P1-07 | Not started | Add monitoring for sync failures, app crashes, and backup failures |
| P1-08 | Not started | Add deployment guide for web, Android, Supabase, and environment variables |
| P1-09 | Not started | Add accessibility and responsive QA passes for tablets/phones |
| P1-10 | Not started | Add real device printer compatibility matrix |

P1 progress: 0 / 10 complete, 0%

## Evidence Summary

Build and dependency checks:

| Check | Result |
| --- | --- |
| `npm run build` via `npm.cmd` | Passes |
| Production audit | Fails readiness due to high-severity `xlsx` advisories |
| Test scripts | None found in `package.json` |
| Android packaging path | Debug APK builder, not production release |

Notable implementation evidence:

| Finding | Evidence |
| --- | --- |
| Fresh auth seed mismatch | `src/db/seed.js` seeds `pin: '1234'`, while `src/services/auth.js` authenticates against `pinHash` |
| Admin default PIN | `src/db/seed.js` and `src/views/admin/AdminView.js` default to `1234` |
| Self-order not actually public on first load | App shows login before registering/starting router unless staff auto-login succeeds |
| IndexedDB category lookup issue | `getItemsByCategory()` uses `[categoryId+isAvailable]` but the schema does not define that compound index |
| No RLS in Supabase schema | `supabase-schema.sql` creates tables and realtime publication but no RLS/policies |
| Debug Android path | `build-apk.ps1` runs `assembleDebug`; Android release has `minifyEnabled false` |
| XSS risk | Many views insert user-controlled values with `innerHTML` without consistent escaping |
| Vulnerable dependency | `xlsx@0.18.5` has high-severity audit advisories and no npm audit fix available |

## Launch Blueprint

Phase 1: Stabilize the core

- Fix first-run auth, admin setup, hashed PIN seed, PIN lockout, and public kiosk routing.
- Fix IndexedDB indexes/data access and order object consistency.
- Add online home ordering as a first-class public customer channel, separate from staff POS.
- Separate demo seed data from production onboarding.
- Add smoke tests for POS, self-order, kitchen, admin, and settings.

Exit criteria: A clean install can create a secure owner, add menu items, place an order, move it through kitchen, collect payment, print/share receipt, and survive reload/offline mode.

Phase 2: Secure the platform

- Add Supabase RLS policies and tenant/store identifiers to every remote table.
- Align Supabase schema with local Dexie fields.
- Define conflict resolution and visible sync error recovery.
- Sanitize every dynamic HTML render path.
- Replace or isolate vulnerable report dependencies.

Exit criteria: Two restaurants cannot read/write each other's data, security audit has no critical/high open items, and sync loss is recoverable.

Phase 3: Production operations

- Add automated backups, restore drills, export/import validation, and audit logs.
- Add observability for crash, sync, payment, and backup failure.
- Add compliance documentation for GST/FSSAI receipt fields and customer data privacy.
- Add support runbooks and onboarding guides.

Exit criteria: A non-developer operator can onboard a store, recover data, diagnose sync status, and contact support with logs.

Phase 4: Distribution

- Build signed Android release APK/AAB.
- Review Android permissions, backup behavior, versioning, and Play Store readiness.
- Configure web hosting security headers and PWA cache update strategy.
- Run tablet/mobile/browser/printer compatibility matrix.

Exit criteria: Release builds are reproducible, signed, versioned, tested on real devices, and backed by rollback instructions.

Phase 5: Launch

- Run beta with 1 to 3 restaurants for at least 2 weeks.
- Track order completion rate, payment mismatch rate, sync failure rate, crash-free sessions, restore success, and support tickets.
- Freeze P0/P1 bug fixes before public launch.

Exit criteria: No P0 defects open, no high-risk P1 defects open, and beta metrics are stable.

## Go/No-Go Checklist

| Gate | Status |
| --- | --- |
| Fresh install login works securely | No-go |
| POS order flow tested end-to-end | No-go |
| Self-order kiosk works without staff login | No-go |
| Supabase tenant isolation/RLS | No-go |
| No high/critical dependency vulnerabilities | No-go |
| Automated tests for critical workflows | No-go |
| Signed Android release build | No-go |
| Backup and restore tested | No-go |
| Payment status reconciliation | No-go |
| Production runbook and support path | No-go |

Public launch status: No-go.
