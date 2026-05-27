# Changelog

## [2.2.0] - 2026-05-27 - "Production Launch Hardening"

### Added
- Added `LAUNCH_READINESS_BLUEPRINT.md` as the persistent public-launch tracker.
- Added safe Supabase launch schema with UUID order identity, idempotency keys, display tokens, staff memberships, audit events, and public order rate-limit storage.
- Added public Supabase Edge Function for server-side validation of customer orders before writing them to the cloud database.
- Added Playwright, Axe accessibility checks, Lighthouse smoke workflow, and conditional signed Android release workflow.
- Added a customer-facing storefront website experience for `/#/self-order` with hero imagery, service-mode selection, popular items, menu sections, sticky cart, polished checkout, and order success states.
- Added local storefront food assets in `public/assets/`.

### Changed
- Public online/QR orders now attempt Edge Function validation first and fall back to local pending validation if cloud is unavailable.
- Cloud staff password is no longer stored in frontend settings; Settings now uses transient Supabase Auth sign-in for the device session.
- Order sync uses `client_order_id` conflict handling for safer multi-device retries.
- Default seed/settings writes are now idempotent so fresh devices do not fail startup after migrations create settings records.
- Dexie `tables` access now uses `db.table('tables')` to avoid the reserved `db.tables` metadata property.
- Public route UI no longer behaves like a kiosk-only menu grid; it now presents The Taste as an online ordering website for home delivery, pickup, and dine-in QR.
- Mobile viewport settings now allow browser zoom instead of disabling scaling.

### Verified
- Passed `npm.cmd run launch:verify` with 6 / 6 unit tests, successful production build, and 0 production audit vulnerabilities.
- Passed `npm.cmd run test:e2e` with 25 / 25 Playwright checks across desktop, iPhone SE, iPhone 15, Pixel 5, and iPad emulation, including public storefront horizontal-overflow checks.

### Remaining Launch Gates
- Production Supabase migration, Edge Function deployment, staff membership setup, real-device QA, monitoring, backup restore drill, and signed Android release remain required before public launch.

## [2.1.0] - 2026-05-27 - "Public Online Ordering Launch Readiness"

### Launch Readiness
- Public website entry now opens customer ordering instead of the staff PIN screen.
- Added first-run owner setup, hashed admin lock PIN handling, legacy PIN migration, and PIN lockout.
- Added home delivery checkout with required customer name, phone, delivery address, and optional landmark.
- Added in-house delivery staff role, delivery assignment, out-for-delivery, delivered, and failed states.
- Added auditable UPI verification and cash/COD collection fields.
- Updated reports and analytics to count revenue only after payment is marked paid.

### Security and Cloud
- Added Dexie schema v4 with menu availability compound index and launch order metadata.
- Aligned Supabase schema with local order/payment/delivery fields.
- Added Supabase RLS policies for public menu reads, public order inserts, and authenticated staff access.
- Added Supabase Auth email/password support for staff sync sessions.
- Removed vulnerable `xlsx` dependency and replaced spreadsheet exports with CSV reports.
- Added Vercel security headers and hardened Android backup/cleartext settings.

### Verification
- Added `npm test` with helper/order parsing tests.
- Verified `npm test`, `npm run build`, and `npm audit --omit=dev`.
- Verified Android `assembleRelease`; unsigned release APK is generated until keystore env vars are provided.

All notable changes to the NextGenOS Restaurant Operating System will be documented in this file.

## [2.0.0] — 2026-05-26 — "Restaurant OS Transformation"

### 🚀 Platform Rebrand
- Rebranded from "The Taste POS" to "NextGenOS Restaurant Operating System"
- Added comprehensive visible and invisible watermarking across all layers
- Platform identity: "Created & Managed by NextGenOS"

### 🆕 New Modules
- **AI Command Center** (`#/ai`) — Conversational AI assistant for business queries
- **Smart Analytics** (`#/analytics`) — Revenue trends, heatmaps, AI insights
- **Customer CRM & Loyalty** (`#/customers`) — Profiles, loyalty tiers, engagement
- **Staff Management** (`#/staff`) — Roles, shifts, performance tracking
- **Inventory Management** (`#/inventory`) — Stock tracking, recipes, suppliers
- **Table Management** (`#/tables`) — Floor plan, reservations, status tracking
- **Multi-Channel Hub** (`#/channels`) — Unified order inbox across all sources

### 🏗️ Architecture Upgrades
- Sidebar navigation replacing bottom nav (11 routes from 5)
- Database schema v2 (13 tables from 4)
- Service layer expansion (AI, Analytics, Inventory, Tables)
- Event-driven cross-module communication
- Enhanced CSS design system with NextGenOS brand tokens

### 🔒 Watermarking (NextGenOS Attribution)
- **Visible**: Loading screen, header badge, sidebar footer, receipts, kiosk, PIN screen, about page
- **Invisible**: Meta tags, HTML comments, JS/CSS banners, console signature, DOM fingerprint, data fingerprint, HTTP headers, PWA manifest, build globals, CSS steganography, service worker

---

## [1.0.0] — 2026-05 — "Initial Release"

### Features
- POS Terminal with menu grid and cart
- Kitchen Display System (Kanban board)
- Admin Console with PIN protection
- Menu CRUD management
- Order history and daily dashboard
- Self-order customer kiosk
- UPI QR code payment
- Cash payment
- Bluetooth thermal receipt printing
- Supabase cloud synchronization (realtime)
- PWA (installable, offline-capable)
- Capacitor Android APK support

### Tech Stack
- Vite 6, Vanilla JS, CSS Custom Properties
- Dexie.js (IndexedDB), Supabase (PostgreSQL + Realtime)
- Web Bluetooth API, qrcode library
- vite-plugin-pwa + Workbox

---

> Created & Managed by NextGenOS
> © 2026 NextGenOS. All Rights Reserved.
