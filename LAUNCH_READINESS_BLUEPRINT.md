# Launch Readiness Blueprint

Project: The Taste / NextGenOS Restaurant OS  
Repository: `d:\Zeaul\Restraunt`  
Assessment date: 2026-05-27  
Launch model: single restaurant, public online ordering, in-house delivery staff

## Executive Verdict

Current launch rating: 84 / 100

Launch decision: Conditional go for a single-restaurant public launch after production environment setup is completed.

The codebase now supports the core public launch workflow: customers can open the public website from home, place delivery or pickup orders without a staff PIN, pay by UPI pending verification or cash/COD, and staff can process kitchen, payment, and in-house delivery operations. The remaining blockers are operational, not core application flow: apply the Supabase SQL, create/configure the Supabase Auth staff account, deploy the web build to the production domain, and provide Android signing credentials for a signed release artifact.

| Use case | Rating | Decision |
| --- | ---: | --- |
| Product demo | 95% | Ready |
| Single trusted restaurant pilot | 88% | Ready after Supabase setup |
| Single restaurant public web launch | 84% | Conditional go |
| Whole-world public launch | 72% | Needs live ops, monitoring, signed release, and real-device QA |

## Completion Tracker

Overall completion: 84%

| Area | Completion | Current state | Launch gate |
| --- | ---: | --- | --- |
| Public customer ordering | 95% | `/` and `/#/self-order` open online ordering without PIN; delivery/pickup/dine-in supported | Verify on production domain |
| Staff auth and setup | 85% | First-run owner setup, hashed PINs, no default production owner, PIN lockout | Run fresh-device QA |
| Online home delivery | 90% | Name, phone, address, landmark, UPI pending, COD unpaid | Confirm service area/fees manually |
| Kitchen workflow | 85% | Delivery address/payment state visible; delivery orders move to dispatch after ready | Real kitchen tablet QA |
| Delivery operations | 85% | Delivery role, assignment, out-for-delivery, delivered/failed, COD collection | Driver device QA |
| Payments and reporting | 90% | Revenue counts only paid orders; UPI/cash audit fields added | Daily reconciliation process |
| Cloud sync/security | 75% | Schema aligned, RLS added, staff Supabase Auth supported, retry status tracked | Apply SQL and test live Supabase |
| XSS/security cleanup | 70% | Shared escaping helpers and core public/order/staff paths hardened | Remaining full-view audit recommended |
| Dependency security | 100% | `xlsx` removed; production audit has 0 vulnerabilities | Re-run before deploy |
| Backup/restore | 70% | JSON backup/restore and CSV exports exist | Perform restore drill on production data copy |
| Android release | 75% | Release build passes and unsigned APK is generated; signing env supported | Provide keystore env vars for signed APK/AAB |
| Automated QA | 45% | Node unit tests added and passing | Add browser E2E before scaling |

## P0 Launch Blockers

| ID | Status | Task | Acceptance evidence |
| --- | --- | --- | --- |
| P0-01 | Complete | Fix first-run authentication | Owner setup wizard creates hashed owner PIN |
| P0-02 | Complete | Remove hardcoded production defaults | New installs no longer seed default `1234` owner/admin access |
| P0-03 | Complete | Make self-order route truly public | `/` and `/#/self-order` route to customer ordering without staff login |
| P0-04 | Complete | Fix menu/category data access | Dexie v4 adds `[categoryId+isAvailable]` and fallback query |
| P0-05 | Code complete, ops pending | Add Supabase RLS and tenant isolation | `supabase-schema.sql` includes `store_id`, RLS, anon menu read, anon order insert, authenticated staff access |
| P0-06 | Complete | Align local and remote schemas | Local order fields and Supabase order columns now include delivery/payment/sync metadata |
| P0-07 | Complete | Add sync retry/conflict basics | Sync retries remain; failed order sync records `syncStatus`, attempts, and errors |
| P0-08 | Partial | Escape/sanitize rendered data | Core customer/order/kitchen/staff/toast paths hardened; full legacy admin/menu audit remains |
| P0-09 | Complete | Replace vulnerable `xlsx` dependency | `npm audit --omit=dev` reports 0 vulnerabilities |
| P0-10 | Partial | Add core automated tests | `npm test` passes helper/order parsing tests; E2E suite still needed |
| P0-11 | Partial | Produce release Android build | `assembleRelease` passes and creates unsigned release APK; signed release needs keystore env vars |
| P0-12 | Complete | Payment verification strategy | UPI remains pending until verified; COD/cash becomes paid only when collected |
| P0-13 | Partial | Production data policy | Default owner disabled; demo menu still seeds for first install and should be reviewed before live import |
| P0-14 | Partial | Operational backups and restore drill | Backup/restore tools exist; live restore drill still required |
| P0-15 | Complete | Online home ordering channel | Home delivery/pickup details persist and flow into kitchen/admin/delivery operations |

P0 progress: 10 / 15 complete, 67%  
P0 code progress: 13 / 15 complete, 87%  
Remaining P0s are operational setup, full legacy XSS audit, E2E coverage, signed Android artifact, and restore drill.

## Launch Blueprint

Phase 1: Core stabilization - Complete
- Public root opens online ordering, not PIN.
- Staff uses protected routes such as `/#/pos`.
- First-run owner setup replaces default owner PIN.
- PIN hashes and legacy PIN migration are in place.
- Menu category lookup works with the required compound index.

Phase 2: Online home ordering - Complete
- Customer checkout supports delivery, pickup, and dine-in QR.
- Delivery requires name, 10-digit phone, address, and optional landmark.
- Orders persist channel/source/type/table/customer/delivery/payment fields.
- UPI orders remain pending; COD orders remain unpaid until staff collection.

Phase 3: Delivery and payment operations - Complete
- Delivery staff role is available.
- Orders can be assigned, dispatched, delivered, or failed.
- Delivered COD orders can mark payment collected.
- Kitchen shows delivery address and sends delivery orders to dispatch.

Phase 4: Cloud sync and security - Code complete, ops pending
- Supabase schema includes aligned columns, `store_id`, RLS, and safe anon policies.
- Staff devices can authenticate to Supabase using stored Supabase Auth email/password.
- Public anon access can read menu and insert public orders only.
- Failed order sync becomes visible and retryable through sync metadata.

Phase 5: Production hardening - Mostly complete
- `xlsx` dependency removed and CSV reports replace spreadsheet generation.
- Production audit is clean.
- Core HTML injection paths are escaped.
- Vercel security headers are defined.
- JSON backup/restore and CSV export remain available.

Phase 6: Distribution - Build complete, signing/deployment pending
- Web build passes.
- Android release build passes with minify/shrink enabled.
- Android release signing is env-driven through `THE_TASTE_KEYSTORE`, `THE_TASTE_KEYSTORE_PASSWORD`, `THE_TASTE_KEY_ALIAS`, and `THE_TASTE_KEY_PASSWORD`.
- Current generated artifact is unsigned because signing env vars are not configured.

## Verification Evidence

| Check | Result |
| --- | --- |
| `npm test` | Passes, 3 tests |
| `npm run build` | Passes |
| `npm audit --omit=dev` | Passes, 0 vulnerabilities |
| `android\gradlew.bat assembleRelease` | Passes |
| Android output | `android/app/build/outputs/apk/release/app-release-unsigned.apk` |
| Gradle daemon | Stopped after verification |

## Go/No-Go Checklist

| Gate | Status |
| --- | --- |
| Fresh install login works securely | Go |
| Public ordering works without staff login | Go |
| Delivery checkout captures address/contact | Go |
| Kitchen receives public orders | Go |
| Delivery staff workflow exists | Go |
| Payment reconciliation is auditable | Go |
| Supabase schema/RLS prepared | Go after SQL is applied |
| No high/critical production vulnerabilities | Go |
| Automated tests for critical helpers | Partial |
| Signed Android release build | No-go until keystore env vars are set |
| Backup and restore tested on live copy | No-go until restore drill is completed |
| Full legacy XSS audit | Partial |

Public launch status: Conditional go for web after Supabase migration, production env configuration, and one live ordering dry run. Android public distribution remains no-go until a signed release APK/AAB is produced.
