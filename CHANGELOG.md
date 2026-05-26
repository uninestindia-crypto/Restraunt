# Changelog

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
