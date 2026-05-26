# 🍜 NextGenOS — Restaurant Operating System
## Complete Platform Blueprint & Architecture Document

> **Version**: 2.0.0  
> **Codename**: Project Taste  
> **Platform**: NextGenOS Restaurant OS  
> **Created**: May 2026  
> **Author**: NextGenOS Engineering  
> **Status**: Approved for Development  

---

## Table of Contents

1. [Executive Vision](#1-executive-vision)
2. [Platform Identity](#2-platform-identity)
3. [Architecture Overview](#3-architecture-overview)
4. [Technology Stack](#4-technology-stack)
5. [Module Specifications](#5-module-specifications)
6. [Database Architecture](#6-database-architecture)
7. [Navigation & UI System](#7-navigation--ui-system)
8. [Design System](#8-design-system)
9. [AI Engine Specification](#9-ai-engine-specification)
10. [Watermarking Strategy](#10-watermarking-strategy)
11. [File Structure Blueprint](#11-file-structure-blueprint)
12. [Data Flow Architecture](#12-data-flow-architecture)
13. [Security Architecture](#13-security-architecture)
14. [Offline-First Strategy](#14-offline-first-strategy)
15. [API & Service Layer](#15-api--service-layer)
16. [Deployment & Distribution](#16-deployment--distribution)
17. [Phased Roadmap](#17-phased-roadmap)
18. [Success Metrics](#18-success-metrics)

---

## 1. Executive Vision

### 1.1 The Problem
Restaurant owners today juggle 5-10 disconnected tools: a POS terminal, a kitchen display, 
a reservation book, a spreadsheet for inventory, WhatsApp for suppliers, a notebook for staff 
schedules, and gut instinct for business decisions. No single platform unifies all operations 
under one intelligent roof.

### 1.2 The Solution
**NextGenOS Restaurant OS** is the world's first AI-native, offline-first, all-in-one operating 
system built specifically for restaurant businesses. It replaces every disconnected tool with 
one unified platform that:

- **Runs the floor** — POS, Kitchen Display, Table Management, Multi-Channel Orders
- **Runs the business** — Analytics, Inventory, Staff Management, Customer CRM
- **Thinks for you** — AI Command Center that answers questions, predicts demand, and automates decisions

### 1.3 Core Principles

| Principle | Description |
|-----------|-------------|
| **Offline-First** | Every feature works without internet. Cloud syncs when available. |
| **AI-Native** | Intelligence is not bolted on — it's woven into every module. |
| **Zero Training** | Any restaurant staff should be productive in under 5 minutes. |
| **Mobile-First** | Designed for tablets and phones first, desktop second. |
| **One Platform** | No switching between apps. Everything lives in one unified OS. |
| **India-First** | UPI payments, GST compliance, Hindi/English, INR currency — built-in. |

### 1.4 Target Users

```
┌──────────────────────────────────────────────────────────┐
│                    RESTAURANT OWNER                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌────────────┐ │
│  │ Manager │  │ Cashier │  │ Kitchen │  │   Waiter   │ │
│  │         │  │         │  │  Staff  │  │            │ │
│  └─────────┘  └─────────┘  └─────────┘  └────────────┘ │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              CUSTOMERS (Self-Order)               │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Platform Identity

### 2.1 Branding

| Element | Value |
|---------|-------|
| **Platform Name** | NextGenOS Restaurant OS |
| **Product Name** | The Taste (customizable per restaurant) |
| **Tagline** | "The Operating System for Modern Restaurants" |
| **Creator Attribution** | "Created & Managed by NextGenOS" |
| **Version Format** | `MAJOR.MINOR.PATCH` (current: `2.0.0`) |
| **Build Identifier** | `nextgenos-restaurant-os-{git-hash}` |

### 2.2 Brand Colors

```
Primary Brand:    #FF6B35  (Vibrant Orange — energy, appetite, warmth)
Primary Dark:     #E85D2C  (Deep Orange — hover states)
Primary Light:    #FF8960  (Soft Orange — accents)
Secondary:        #FFB347  (Warm Yellow — highlights)
NextGenOS Accent: #6C5CE7  (Premium Purple — NextGenOS brand identity)
NextGenOS Glow:   #A29BFE  (Soft Purple — NextGenOS accent glow)
```

### 2.3 Typography

```
Headlines:  Plus Jakarta Sans (800, 700)
Body Text:  Inter (400, 500, 600)
Monospace:  JetBrains Mono (code, receipts, order numbers)
Icons:      Material Symbols Rounded (FILL=1)
```

---

## 3. Architecture Overview

### 3.1 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser/PWA/APK)                  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    APP SHELL (main.js)                     │   │
│  │  ┌────────┐  ┌──────────┐  ┌───────────┐  ┌──────────┐  │   │
│  │  │Sidebar │  │  Router  │  │  Toast    │  │ Watermark│  │   │
│  │  │Nav     │  │  (hash)  │  │  System   │  │ Layer    │  │   │
│  │  └────────┘  └──────────┘  └───────────┘  └──────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────── VIEW LAYER ──────────────────────────┐   │
│  │                                                           │   │
│  │  ┌─────┐ ┌───────┐ ┌──────┐ ┌─────────┐ ┌──────────┐   │   │
│  │  │ POS │ │Kitchen│ │Tables│ │Channels │ │Self-Order│   │   │
│  │  └─────┘ └───────┘ └──────┘ └─────────┘ └──────────┘   │   │
│  │                                                           │   │
│  │  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌─────────────┐  │   │
│  │  │Analytics│ │Inventory│ │Customers │ │    Staff    │  │   │
│  │  └─────────┘ └─────────┘ └──────────┘ └─────────────┘  │   │
│  │                                                           │   │
│  │  ┌────────────────────┐  ┌────────────────────────────┐  │   │
│  │  │  AI Command Center │  │   Admin (Dashboard/CRUD)   │  │   │
│  │  └────────────────────┘  └────────────────────────────┘  │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────── SERVICE LAYER ───────────────────────┐   │
│  │  ┌──────┐  ┌───────┐  ┌───────┐  ┌────┐  ┌──────────┐  │   │
│  │  │  AI  │  │ Sync  │  │Receipt│  │UPI │  │ Printer  │  │   │
│  │  └──────┘  └───────┘  └───────┘  └────┘  └──────────┘  │   │
│  │  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐   │   │
│  │  │Analytics │  │  Watermark   │  │   Notification   │   │   │
│  │  └──────────┘  └──────────────┘  └──────────────────┘   │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────── DATA LAYER ──────────────────────────┐   │
│  │  ┌──────────────────┐    ┌────────────────────────────┐  │   │
│  │  │   Dexie/IndexedDB │    │    Supabase (Cloud Sync)  │  │   │
│  │  │   (Local-First)   │◄──►│    (Realtime Replication) │  │   │
│  │  └──────────────────┘    └────────────────────────────┘  │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────── DEVICE LAYER ────────────────────────┐   │
│  │  Bluetooth Thermal Printer  │  Camera (QR)  │  Vibration │   │
│  │  Audio Feedback             │  PWA Install  │  Capacitor │   │
│  └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Design Patterns

| Pattern | Usage |
|---------|-------|
| **View Pattern** | Each screen is a class with `mount(container)`, `unmount()`, and `render()` methods |
| **Service Singleton** | Services (AI, Sync, Printer) are singleton instances exported from modules |
| **Event-Driven** | `CustomEvent` dispatch for cross-module communication (`sync-data-changed`) |
| **Lazy Loading** | Views loaded via dynamic `import()` only when navigated to |
| **Offline-First** | Write to IndexedDB first, async replicate to Supabase |

---

## 4. Technology Stack

### 4.1 Core Technologies

| Layer | Technology | Why |
|-------|-----------|-----|
| **Build** | Vite 6.x | Blazing fast HMR, native ES modules, tree-shaking |
| **Language** | Vanilla JavaScript (ES2020+) | Zero framework overhead, maximum performance |
| **Styling** | Vanilla CSS + CSS Custom Properties | Full control, no utility class bloat |
| **Local DB** | Dexie.js (IndexedDB wrapper) | Powerful queries, versioned schema, hooks |
| **Cloud Sync** | Supabase (PostgreSQL + Realtime) | Open-source Firebase alternative, row-level security |
| **Payments** | UPI deep links + QR (qrcode lib) | India-native digital payments |
| **Printing** | Web Bluetooth API | Direct thermal printer connection |
| **PWA** | vite-plugin-pwa + Workbox | Installable, offline-capable |
| **Mobile** | Capacitor 8.x | Wrap as Android APK |
| **Fonts** | Google Fonts (Plus Jakarta Sans, Inter) | Premium, modern typography |
| **Icons** | Material Symbols Rounded | Consistent, variable-weight icons |

### 4.2 AI Technologies

| Component | Technology | Fallback |
|-----------|-----------|----------|
| **Quick Queries** | Chrome Built-in AI (Gemini Nano via `window.ai`) | Local computation |
| **Complex Analysis** | Gemini API (configurable key) | Graceful degradation to local |
| **Forecasting** | Client-side statistical models (moving avg, linear regression) | Always local |
| **NLP** | Prompt templates with structured data injection | Works with any LLM |

---

## 5. Module Specifications

### 5.1 Module Registry

```
┌────────────────────────────────────────────────────────────────┐
│                    NEXTGENOS MODULE MAP                         │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ╔══════════════════ OPERATIONS ══════════════════════╗        │
│  ║  📱 POS Terminal          (#/pos)                  ║        │
│  ║  🍳 Kitchen Display       (#/kitchen)              ║        │
│  ║  🍽️ Table Management      (#/tables)               ║        │
│  ║  📡 Multi-Channel Hub     (#/channels)             ║        │
│  ║  🛒 Self-Order Kiosk      (#/self-order)           ║        │
│  ╚════════════════════════════════════════════════════╝        │
│                                                                │
│  ╔══════════════════ BUSINESS ════════════════════════╗        │
│  ║  📊 Smart Analytics       (#/analytics)            ║        │
│  ║  📦 Inventory & Suppliers (#/inventory)            ║        │
│  ║  🎯 Customer CRM & Loyalty(#/customers)           ║        │
│  ║  👥 Staff & Roles         (#/staff)                ║        │
│  ╚════════════════════════════════════════════════════╝        │
│                                                                │
│  ╔══════════════════ INTELLIGENCE ════════════════════╗        │
│  ║  🤖 AI Command Center     (#/ai)                   ║        │
│  ╚════════════════════════════════════════════════════╝        │
│                                                                │
│  ╔══════════════════ SYSTEM ══════════════════════════╗        │
│  ║  ⚙️ Admin Console          (#/admin)               ║        │
│  ║  📋 Order History          (#/orders)              ║        │
│  ╚════════════════════════════════════════════════════╝        │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

### 5.2 Module: POS Terminal (`#/pos`)

**Purpose**: Core order-taking interface for cashiers.

**Current Features** (Existing):
- Split layout: Menu Grid (left) + Cart Panel (right)
- Category-based menu browsing with search
- Cart with quantity adjustment, item notes
- Order types: Takeaway, Dine-in, Delivery
- Payment modal with UPI QR generation and Cash option
- Bluetooth thermal receipt printing
- Sound + vibration feedback on actions

**AI-Era Enhancements**:
- 🆕 **Smart Suggestions**: "Customers who ordered X also ordered Y" — upsell prompts
- 🆕 **Voice Ordering**: Microphone input → AI parses → adds to cart (future)
- 🆕 **Quick Combos**: AI-generated combo suggestions based on popular pairings
- 🆕 **Customer Recognition**: Enter phone → auto-load preferences, show loyalty tier
- 🆕 **Dynamic Pricing Hints**: Show items with high margin in a "Recommended" row

**Key Files**:
```
src/views/pos/
├── PosView.js          — Main POS layout controller
├── MenuGrid.js         — Category tabs + menu item grid
├── CartPanel.js        — Cart sidebar with totals
└── PaymentModal.js     — Payment flow (UPI QR / Cash)
```

**Data Flow**:
```
User taps item → addToCart() → CartPanel.updateCart()
                                      ↓
User taps "Place Order" → PaymentModal.show()
                                      ↓
Payment confirmed → createOrder() → Dexie (local)
                                      ↓
                              syncService.syncUpOrder() → Supabase (cloud)
                                      ↓
                              printerService.print() → Bluetooth Printer
```

---

### 5.3 Module: Kitchen Display System (`#/kitchen`)

**Purpose**: Kanban board for kitchen staff to manage order preparation.

**Current Features** (Existing):
- 3-column Kanban: Incoming → Preparing → Ready to Serve
- Color-coded age indicators (green < 8min, yellow < 15min, red > 15min)
- Pulsing red border for overdue orders
- Audio alerts for new incoming orders
- Auto-refresh every 5 seconds
- One-tap status progression: Start Cook → Food Ready → Done & Serve

**AI-Era Enhancements**:
- 🆕 **Prep Time Estimation**: AI predicts cook time per order based on items + kitchen load
- 🆕 **Priority Sorting**: Auto-prioritize by wait time + order value + customer loyalty tier
- 🆕 **Kitchen Load Indicator**: Real-time heatbar showing kitchen capacity utilization
- 🆕 **Smart Batching**: AI suggests grouping similar items across orders for efficiency

**Key Files**:
```
src/views/kitchen/
└── KitchenView.js      — Kanban board with order cards
```

---

### 5.4 Module: AI Command Center (`#/ai`) — 🆕 NEW

**Purpose**: The flagship feature. A conversational AI assistant that understands the restaurant business.

**Capabilities**:

| Category | Example Query | How It Works |
|----------|--------------|-------------|
| **Sales Queries** | "What was today's revenue?" | Queries `orders` table, sums totals |
| **Menu Intelligence** | "What's my best seller this week?" | Aggregates order items, ranks by quantity |
| **Price Optimization** | "Should I increase momo prices?" | Analyzes demand trends, price elasticity |
| **Forecasting** | "Predict tomorrow's sales" | Day-of-week patterns, moving averages |
| **Marketing** | "Write a WhatsApp promo for tonight" | Generates copy using current specials |
| **Menu Creation** | "Create a combo: rice + drink at ₹180" | Adds combo item to menu database |
| **Staff Insights** | "Who processed the most orders today?" | Queries activity log per staff |
| **Customer Insights** | "Show me customers who haven't visited in 30 days" | Queries customer CRM data |
| **Inventory** | "Am I running low on anything?" | Checks stock levels vs. thresholds |
| **Anomaly Detection** | "Anything unusual today?" | Compares today vs. historical averages |

**UI Design**:
```
┌─────────────────────────────────────────────────────┐
│  🤖 AI Command Center                    ⋮ History  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  👋 Welcome! I'm your restaurant AI assistant │  │
│  │  Ask me anything about your business.         │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  Quick Actions:                                     │
│  ┌──────────┐ ┌───────────┐ ┌────────────────────┐ │
│  │📊 Today's│ │🏆 Best    │ │📈 Revenue         │ │
│  │ Summary  │ │ Sellers   │ │ Forecast           │ │
│  └──────────┘ └───────────┘ └────────────────────┘ │
│                                                     │
│  ┌─────────────────────────────────────┐            │
│  │ User: What was today's revenue?     │            │
│  └─────────────────────────────────────┘            │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │ 🤖 AI: Today's total revenue is ₹12,450    │    │
│  │ from 34 orders. Average bill: ₹366.         │    │
│  │                                             │    │
│  │ 📊 Top items: Chicken Momos (23), Hakka    │    │
│  │ Noodles (18), Cold Coffee (15)              │    │
│  │                                             │    │
│  │ 💡 Revenue is 12% higher than same day     │    │
│  │ last week. Great job!                       │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
├─────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────┐ ┌──────────┐│
│  │ Ask anything about your business… │ │   Send   ││
│  └───────────────────────────────────┘ └──────────┘│
└─────────────────────────────────────────────────────┘
```

**AI Service Architecture**:
```
User Query (natural language)
        ↓
  ┌─────────────────┐
  │ Intent Classifier│ ← Determines query type
  └────────┬────────┘
           ↓
  ┌─────────────────┐
  │  Data Retriever  │ ← Queries Dexie tables
  └────────┬────────┘
           ↓
  ┌─────────────────┐
  │ Response Builder │ ← Formats answer with data
  └────────┬────────┘
           ↓
  ┌─────────────────┐
  │   AI Formatter   │ ← Chrome AI / Gemini API
  └────────┬────────┘    (makes response conversational)
           ↓
     Chat Message
```

**Key Files**:
```
src/views/ai/
├── AICommandCenter.js  — Chat UI, message rendering, quick actions
├── AIMessageBubble.js  — Individual message component
└── AIQuickChips.js     — Pre-built action chips

src/services/
├── ai.js               — AI orchestrator (intent → data → response)
├── aiIntents.js        — Intent classification + query mapping
└── aiAnalytics.js      — Statistical functions for AI queries
```

---

### 5.5 Module: Smart Analytics (`#/analytics`) — 🆕 NEW

**Purpose**: Business intelligence dashboard with AI-powered insights.

**Dashboard Layout**:
```
┌──────────────────────────────────────────────────────────────┐
│  📊 Smart Analytics              [Today ▾] [This Week] [Month]│
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐│
│  │ ₹24,500  │  │   67     │  │  ₹366    │  │   12% ↑     ││
│  │ Revenue  │  │  Orders  │  │ Avg Bill │  │   Growth    ││
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘│
│                                                              │
│  ┌─────────────────────────────────┐ ┌──────────────────────┐│
│  │     Revenue Trend (7 days)      │ │  Payment Split Pie   ││
│  │     📈 Line Chart              │ │  🥧 Donut Chart      ││
│  │                                 │ │                      ││
│  └─────────────────────────────────┘ └──────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────┐ ┌──────────────────────┐│
│  │   Hourly Revenue Heatmap       │ │  Top 10 Items List   ││
│  │   🗓️ Calendar Grid            │ │  🏆 Ranked Table     ││
│  └─────────────────────────────────┘ └──────────────────────┘│
│                                                              │
│  ┌──────────────────────────────────────────────────────────┐│
│  │  💡 AI Insight: "Chicken Momos sales peak at 7-8 PM.    ││
│  │  Consider running a 6 PM 'Early Bird' discount to       ││
│  │  spread demand and reduce kitchen bottleneck."           ││
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

**Analytics Capabilities**:
- Revenue trends (daily, weekly, monthly) with line/bar charts
- Hourly revenue heatmap (which hours make the most money)
- Top sellers leaderboard with quantity + revenue ranking
- Payment method breakdown (UPI vs Cash donut chart)
- Order type split (Takeaway vs Dine-in vs Delivery)
- Customer acquisition trend (new vs returning)
- Food cost ratio per item (when inventory is set up)
- AI-generated insights panel with actionable recommendations

**Charts**: Rendered with Canvas 2D API (no external charting library).

**Key Files**:
```
src/views/analytics/
├── AnalyticsDashboard.js — Main dashboard layout
├── RevenueChart.js       — Line/bar chart component
├── HeatmapChart.js       — Hourly revenue heatmap
├── TopItemsTable.js      — Best sellers leaderboard
└── InsightCard.js        — AI insight component

src/services/
└── analytics.js          — Data aggregation + statistical computations
```

---

### 5.6 Module: Customer CRM & Loyalty (`#/customers`) — 🆕 NEW

**Purpose**: Build customer relationships and drive repeat visits.

**Features**:
- Auto-create customer profiles from order phone numbers
- Loyalty points: Earn 1 point per ₹10 spent
- Tier system: Bronze (0) → Silver (500pts) → Gold (2000pts) → Platinum (5000pts)
- Customer order history and preferences
- Visit frequency tracking
- Birthday/occasion offers
- AI-powered re-engagement: "Send offer to customers inactive 30+ days"

**Loyalty Tier Progression**:
```
  🥉 Bronze        🥈 Silver        🥇 Gold         💎 Platinum
  (New Customer)   (500+ points)   (2000+ points)  (5000+ points)
       │                │               │               │
  No discount      5% off next      10% off next    15% off next
                   order             order + free     order + free
                                    beverage         dessert + 
                                                     priority
```

**Key Files**:
```
src/views/customers/
├── CustomersView.js    — Customer list with search and filters
├── CustomerProfile.js  — Individual profile card + order history
└── LoyaltyDashboard.js — Tier progress, points summary
```

---

### 5.7 Module: Staff Management (`#/staff`) — 🆕 NEW

**Purpose**: Manage team members, roles, shifts, and performance.

**Features**:
- Staff directory with role-based icons
- 5 predefined roles with permission matrices:

| Permission | Owner | Manager | Cashier | Kitchen | Waiter |
|-----------|-------|---------|---------|---------|--------|
| POS | ✅ | ✅ | ✅ | ❌ | ❌ |
| Kitchen | ✅ | ✅ | ❌ | ✅ | ❌ |
| Admin | ✅ | ✅ | ❌ | ❌ | ❌ |
| Analytics | ✅ | ✅ | ❌ | ❌ | ❌ |
| AI Center | ✅ | ✅ | ❌ | ❌ | ❌ |
| Inventory | ✅ | ✅ | ❌ | ❌ | ❌ |
| Customers | ✅ | ✅ | ✅ | ❌ | ❌ |
| Staff Mgmt | ✅ | ❌ | ❌ | ❌ | ❌ |
| Settings | ✅ | ❌ | ❌ | ❌ | ❌ |
| Tables | ✅ | ✅ | ✅ | ❌ | ✅ |
| Self-Order | ✅ | ✅ | ✅ | ❌ | ✅ |

- Shift clock-in/out with time tracking
- Activity audit log
- Performance metrics per staff member

**Key Files**:
```
src/views/staff/
├── StaffView.js       — Staff directory + add/edit
├── ShiftManager.js    — Shift scheduling
└── ActivityLog.js     — Audit trail viewer
```

---

### 5.8 Module: Inventory Management (`#/inventory`) — 🆕 NEW

**Purpose**: Track raw ingredients, manage stock, and control food costs.

**Features**:
- Ingredient registry with units (kg, liters, pieces)
- Stock level bars with color thresholds (green/yellow/red)
- Recipe mapping: menu item → list of ingredients with quantities
- Auto-deduct: When an order is placed, auto-deduct ingredients
- Low stock alerts with configurable thresholds
- Supplier directory with contact info
- Purchase order generation
- Food cost analysis: ingredient cost / selling price = margin %

**Stock Level Visual**:
```
  Chicken (kg)    ████████████████████░░░░░  80% (16/20 kg)  ✅
  Paneer (kg)     ████████░░░░░░░░░░░░░░░░  35% (3.5/10 kg) ⚠️
  Maida (kg)      ███░░░░░░░░░░░░░░░░░░░░░  12% (1.2/10 kg) 🔴
  Oil (liters)    ██████████████████████░░░  90% (9/10 L)    ✅
```

**Key Files**:
```
src/views/inventory/
├── InventoryView.js    — Stock dashboard
├── IngredientEditor.js — Add/edit ingredients
├── RecipeMapper.js     — Map items to ingredients
└── SupplierDirectory.js— Supplier management

src/services/
└── inventory.js        — Stock calculation, auto-deduction
```

---

### 5.9 Module: Table Management (`#/tables`) — 🆕 NEW

**Purpose**: Visual floor plan for dine-in table tracking and reservations.

**Features**:
- Interactive SVG floor map with draggable tables
- Real-time table status: Available (green), Occupied (red), Reserved (yellow), Cleaning (blue)
- Link orders to specific tables
- Reservation calendar with time-slot booking
- Party size and estimated wait time
- Table merge for large groups

**Floor Plan Visual**:
```
┌──────────────────────────────────────────────────┐
│                RESTAURANT FLOOR                   │
│                                                   │
│    ┌──┐   ┌──┐   ┌──┐                           │
│    │T1│   │T2│   │T3│   Kitchen                  │
│    │🟢│   │🔴│   │🟡│   ┌─────┐                  │
│    │2p│   │4p│   │2p│   │     │                  │
│    └──┘   └──┘   └──┘   │     │                  │
│                          └─────┘                  │
│    ┌──────┐   ┌──┐                               │
│    │  T4  │   │T5│                               │
│    │  🟢  │   │🔴│   Counter                     │
│    │  6p  │   │2p│   ┌────────────┐              │
│    └──────┘   └──┘   │   POS 📱   │              │
│                       └────────────┘              │
│    ┌──┐   ┌──┐   ┌──┐                           │
│    │T6│   │T7│   │T8│                            │
│    │🟢│   │🟢│   │🔵│                            │
│    │4p│   │4p│   │2p│                            │
│    └──┘   └──┘   └──┘                            │
│                                                   │
│  🟢 Available  🔴 Occupied  🟡 Reserved  🔵 Clean │
└──────────────────────────────────────────────────┘
```

**Key Files**:
```
src/views/tables/
├── TablesView.js       — Floor plan + status overview
├── FloorPlanEditor.js  — Drag-and-drop table layout
├── TableCard.js        — Individual table component
└── ReservationView.js  — Booking calendar

src/services/
└── tables.js           — Table status management, wait time calc
```

---

### 5.10 Module: Multi-Channel Hub (`#/channels`) — 🆕 NEW

**Purpose**: Unified order inbox aggregating all order sources.

**Channels**:
- 📱 POS Counter — Direct cashier orders
- 🛒 Self-Order Kiosk — Customer self-service
- 🪑 QR Table Order — Scan QR at table to order
- 📲 WhatsApp Orders — Future integration
- 🌐 Website/App Orders — Future integration

**Key Files**:
```
src/views/channels/
├── ChannelHub.js       — Unified order inbox
├── ChannelStats.js     — Revenue per channel
└── ChannelConfig.js    — Enable/disable channels
```

---

## 6. Database Architecture

### 6.1 Complete Schema (Dexie/IndexedDB)

```javascript
// Database: TheTastePOS
// Engine: Dexie.js wrapping IndexedDB

db.version(2).stores({
  
  // ═══════════════════ EXISTING TABLES ═══════════════════
  
  // Menu Categories (e.g., Momos, Noodles, Burgers)
  menuCategories: '++id, name, sortOrder, isActive',
  // Fields: id, name, icon, sortOrder, isActive, isSynced
  
  // Menu Items (e.g., Steamed Veg Momos ₹80)
  menuItems: '++id, categoryId, name, price, isAvailable, isVeg, sortOrder',
  // Fields: id, categoryId, name, price, isVeg, isAvailable, sortOrder, 
  //         description, imageUrl, isSynced
  
  // Orders
  orders: '++id, orderNumber, type, status, paymentMethod, paymentStatus, createdAt, completedAt, customerId, staffId, tableId, channel',
  // Fields: id, orderNumber, type, status, items (JSON), subtotal, tax, 
  //         total, paymentMethod, paymentStatus, customerName, customerPhone,
  //         notes, createdAt, completedAt, customerId, staffId, tableId,
  //         channel, isSynced, _platform
  
  // Settings (key-value store)
  settings: 'key',
  // Fields: key, value
  
  
  // ═══════════════════ NEW TABLES ═════════════════════════
  
  // Customer CRM
  customers: '++id, phone, name, totalSpent, visitCount, loyaltyPoints, tier, lastVisit, createdAt',
  // Fields: id, phone, name, email, totalSpent, visitCount, loyaltyPoints,
  //         tier (bronze/silver/gold/platinum), lastVisit, birthday,
  //         preferences (JSON), notes, createdAt, isSynced, _platform
  
  // Staff Members
  staff: '++id, name, role, pin, isActive, createdAt',
  // Fields: id, name, role (owner/manager/cashier/kitchen/waiter), pin,
  //         phone, isActive, avatar, createdAt, isSynced, _platform
  
  // Shift Records
  shifts: '++id, staffId, date, clockIn, clockOut',
  // Fields: id, staffId, date, clockIn, clockOut, hoursWorked,
  //         notes, isSynced, _platform
  
  // Inventory Items
  inventory: '++id, name, unit, quantity, minThreshold, categoryTag',
  // Fields: id, name, unit (kg/liters/pieces/packs), quantity, cost,
  //         minThreshold, maxCapacity, categoryTag, supplierId,
  //         lastRestocked, isSynced, _platform
  
  // Suppliers
  suppliers: '++id, name, phone, category',
  // Fields: id, name, phone, email, address, category (produce/dairy/meat/dry),
  //         notes, createdAt, isSynced, _platform
  
  // Recipe Mapping (menu item → ingredients)
  recipes: '++id, menuItemId',
  // Fields: id, menuItemId, ingredients (JSON array of {inventoryId, quantity, unit}),
  //         isSynced, _platform
  
  // Tables (Floor Plan)
  tables: '++id, number, status, floorSection',
  // Fields: id, number, capacity, status (available/occupied/reserved/cleaning),
  //         floorSection, x, y, width, height, shape (round/square/rect),
  //         currentOrderId, isSynced, _platform
  
  // Reservations
  reservations: '++id, tableId, customerId, date, time, status',
  // Fields: id, tableId, customerId, customerName, customerPhone,
  //         date, time, duration, partySize, status (confirmed/cancelled/completed),
  //         notes, createdAt, isSynced, _platform
  
  // Activity Audit Log
  activityLog: '++id, staffId, action, timestamp',
  // Fields: id, staffId, staffName, action, module, details (JSON),
  //         timestamp, _platform
  
  // AI Conversations
  aiConversations: '++id, createdAt, title',
  // Fields: id, title, messages (JSON array of {role, content, timestamp}),
  //         createdAt, lastMessageAt, _platform
});
```

### 6.2 Entity Relationship Diagram

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   STAFF      │     │   ORDERS     │     │  CUSTOMERS   │
├──────────────┤     ├──────────────┤     ├──────────────┤
│ id (PK)      │──┐  │ id (PK)      │  ┌──│ id (PK)      │
│ name         │  │  │ orderNumber  │  │  │ phone        │
│ role         │  │  │ type         │  │  │ name         │
│ pin          │  └─►│ staffId (FK) │  │  │ loyaltyPoints│
│ isActive     │     │ customerId(FK)│◄─┘  │ tier         │
└──────────────┘     │ tableId (FK) │     │ totalSpent   │
                     │ channel      │     └──────────────┘
                     │ items (JSON) │            ▲
                     │ total        │            │
                     └──────┬───────┘     ┌──────┴───────┐
                            │             │ RESERVATIONS │
                     ┌──────▼───────┐     ├──────────────┤
                     │  MENU_ITEMS  │     │ id (PK)      │
                     ├──────────────┤     │ tableId (FK) │
                     │ id (PK)      │     │ customerId   │
                     │ categoryId   │     │ date/time    │
                     │ name         │     │ partySize    │
                     │ price        │     └──────────────┘
                     └──────┬───────┘            ▲
                            │                    │
                     ┌──────▼───────┐     ┌──────┴───────┐
                     │   RECIPES    │     │    TABLES    │
                     ├──────────────┤     ├──────────────┤
                     │ menuItemId   │     │ id (PK)      │
                     │ ingredients  │     │ number       │
                     └──────┬───────┘     │ capacity     │
                            │             │ status       │
                     ┌──────▼───────┐     │ x, y         │
                     │  INVENTORY   │     └──────────────┘
                     ├──────────────┤
                     │ id (PK)      │
                     │ name         │     ┌──────────────┐
                     │ quantity     │     │ ACTIVITY_LOG │
                     │ minThreshold │     ├──────────────┤
                     │ supplierId   │     │ staffId (FK) │
                     └──────┬───────┘     │ action       │
                            │             │ timestamp    │
                     ┌──────▼───────┐     └──────────────┘
                     │  SUPPLIERS   │
                     ├──────────────┤     ┌──────────────┐
                     │ id (PK)      │     │AI_CONVERSATIONS│
                     │ name         │     ├──────────────┤
                     │ phone        │     │ id (PK)      │
                     │ category     │     │ messages     │
                     └──────────────┘     │ title        │
                                          └──────────────┘
```

### 6.3 Data Fingerprinting

Every record synced to Supabase will include a `_platform` field:

```javascript
{
  _platform: 'nextgenos',
  _platformVersion: '2.0.0',
  _createdBy: 'nextgenos-restaurant-os'
}
```

This is an **invisible watermark** embedded in the data layer, ensuring all data 
can be traced back to NextGenOS even if exported or migrated.

---

## 7. Navigation & UI System

### 7.1 Sidebar Navigation Architecture

Replace the current 4-button bottom nav with a full sidebar:

```
┌────┬───────────────────────────────────────────────┐
│    │                                               │
│ 🍜 │  ┌─────────────────────────────────────────┐  │
│    │  │                                         │  │
│ ── │  │          MAIN CONTENT AREA              │  │
│📱  │  │          (Router Viewport)              │  │
│POS │  │                                         │  │
│    │  │                                         │  │
│🍳  │  │                                         │  │
│KDS │  │                                         │  │
│    │  │                                         │  │
│🍽️  │  │                                         │  │
│TBL │  │                                         │  │
│    │  │                                         │  │
│📡  │  │                                         │  │
│HUB │  │                                         │  │
│    │  │                                         │  │
│ ── │  │                                         │  │
│📊  │  └─────────────────────────────────────────┘  │
│ANL │                                               │
│    │  ┌─────────────────────────────────────────┐  │
│📦  │  │  Powered by NextGenOS                   │  │
│INV │  └─────────────────────────────────────────┘  │
│    │                                               │
│🎯  │                                               │
│CRM │                                               │
│    │                                               │
│👥  │                                               │
│STF │                                               │
│    │                                               │
│ ── │                                               │
│🤖  │                                               │
│ AI │                                               │
│    │                                               │
│ ── │                                               │
│⚙️  │                                               │
│ADM │                                               │
│    │                                               │
└────┴───────────────────────────────────────────────┘
```

**Desktop** (>1024px): Sidebar visible, icons + labels, collapsible
**Tablet** (768-1024px): Sidebar icons only, expandable on hover
**Mobile** (<768px): Bottom sheet drawer, hamburger trigger in header

### 7.2 Route Registry

```javascript
const ROUTES = {
  // Operations
  '#/pos':        { view: 'PosView',        icon: 'point_of_sale', label: 'POS',       group: 'operations' },
  '#/kitchen':    { view: 'KitchenView',    icon: 'restaurant',    label: 'Kitchen',    group: 'operations' },
  '#/tables':     { view: 'TablesView',     icon: 'table_bar',     label: 'Tables',     group: 'operations' },
  '#/channels':   { view: 'ChannelHub',     icon: 'hub',           label: 'Channels',   group: 'operations' },
  
  // Business
  '#/analytics':  { view: 'AnalyticsDashboard', icon: 'analytics', label: 'Analytics',  group: 'business'   },
  '#/inventory':  { view: 'InventoryView',  icon: 'inventory_2',   label: 'Inventory',  group: 'business'   },
  '#/customers':  { view: 'CustomersView',  icon: 'loyalty',       label: 'Customers',  group: 'business'   },
  '#/staff':      { view: 'StaffView',      icon: 'groups',        label: 'Staff',      group: 'business'   },
  
  // Intelligence
  '#/ai':         { view: 'AICommandCenter', icon: 'smart_toy',    label: 'AI Center',  group: 'intelligence'},
  
  // System
  '#/admin':      { view: 'AdminView',      icon: 'admin_panel_settings', label: 'Admin', group: 'system'  },
  '#/orders':     { view: 'OrderHistory',   icon: 'receipt_long',  label: 'Orders',     group: 'system'     },
  
  // Standalone (no sidebar)
  '#/self-order': { view: 'CustomerView',   standalone: true },
};
```

---

## 8. Design System

### 8.1 CSS Custom Properties (variables.css)

```css
:root {
  /* ── NextGenOS Brand ───────────────────────── */
  --nextgenos-purple: #6C5CE7;
  --nextgenos-purple-glow: #A29BFE;
  --nextgenos-purple-bg: rgba(108, 92, 231, 0.06);
  --nextgenos-purple-border: rgba(108, 92, 231, 0.2);
  
  /* ── Restaurant Brand (Customizable) ────────── */
  --brand-primary: #FF6B35;
  --brand-primary-dark: #E85D2C;
  --brand-primary-light: #FF8960;
  --brand-secondary: #FFB347;
  
  /* ── Surfaces ──────────────────────────────── */
  --bg-primary: #0F0F1A;
  --bg-secondary: #1A1A2E;
  --bg-elevated: rgba(255, 255, 255, 0.02);
  --bg-glass: rgba(255, 255, 255, 0.01);
  
  /* ── Sidebar ───────────────────────────────── */
  --sidebar-width: 240px;
  --sidebar-collapsed-width: 64px;
  --sidebar-bg: rgba(9, 9, 14, 0.95);
  --sidebar-border: var(--border-glass);
  
  /* ── Spacing Scale ─────────────────────────── */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;
  
  /* ── Component Tokens ──────────────────────── */
  --card-radius: var(--radius-xl);
  --card-padding: 24px;
  --card-border: 1px solid var(--border-glass);
  --card-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
}
```

### 8.2 Component Library

| Component | CSS Class | Description |
|-----------|----------|-------------|
| Card | `.card-glass` | Glassmorphism card with blur backdrop |
| Button Primary | `.btn-primary` | Orange gradient with glow shadow |
| Button Secondary | `.btn-secondary` | Transparent with glass border |
| Badge | `.badge-{color}` | Status indicator pills |
| Input | `.input` | Dark glass input with focus glow |
| Tab | `.tab` | Navigation tab with active state |
| Status Dot | `.status-dot` | Online/offline indicator |
| Toast | `.toast` | Notification popup |
| Stepper | `.stepper` | +/- quantity control |
| Veg Badge | `.badge-veg` | Green square veg indicator |
| Non-veg Badge | `.badge-nonveg` | Red triangle non-veg indicator |
| NextGenOS Badge | `.nextgenos-badge` | Purple branded micro-badge |

---

## 9. AI Engine Specification

### 9.1 Intent Classification System

```javascript
const AI_INTENTS = {
  // Revenue & Sales
  REVENUE_TODAY:      { keywords: ['revenue', 'sales', 'earned', 'money', 'income', 'today'],
                        handler: 'getRevenueToday' },
  REVENUE_PERIOD:     { keywords: ['revenue', 'sales', 'week', 'month', 'yesterday'],
                        handler: 'getRevenuePeriod' },
  
  // Menu Intelligence
  BEST_SELLERS:       { keywords: ['best', 'top', 'popular', 'selling', 'seller', 'famous'],
                        handler: 'getBestSellers' },
  WORST_SELLERS:      { keywords: ['worst', 'least', 'slow', 'not selling', 'flop'],
                        handler: 'getWorstSellers' },
  PRICE_SUGGESTION:   { keywords: ['price', 'increase', 'decrease', 'charge', 'cost'],
                        handler: 'analyzePricing' },
  
  // Forecasting
  FORECAST_REVENUE:   { keywords: ['predict', 'forecast', 'tomorrow', 'next', 'expect'],
                        handler: 'forecastRevenue' },
  FORECAST_DEMAND:    { keywords: ['demand', 'prepare', 'stock', 'how many', 'how much'],
                        handler: 'forecastDemand' },
  
  // Operations
  ORDER_COUNT:        { keywords: ['orders', 'count', 'how many orders', 'total orders'],
                        handler: 'getOrderCount' },
  PEAK_HOURS:         { keywords: ['peak', 'busy', 'rush', 'busiest', 'hour'],
                        handler: 'getPeakHours' },
  AVG_ORDER_VALUE:    { keywords: ['average', 'avg', 'bill', 'ticket', 'order value'],
                        handler: 'getAvgOrderValue' },
  
  // Customer
  CUSTOMER_INSIGHTS:  { keywords: ['customer', 'frequent', 'regular', 'loyal', 'visitor'],
                        handler: 'getCustomerInsights' },
  INACTIVE_CUSTOMERS: { keywords: ['inactive', 'lost', 'haven\'t visited', 'dormant'],
                        handler: 'getInactiveCustomers' },
  
  // Staff
  STAFF_PERFORMANCE:  { keywords: ['staff', 'employee', 'who', 'processed', 'performance'],
                        handler: 'getStaffPerformance' },
  
  // Inventory
  LOW_STOCK:          { keywords: ['stock', 'low', 'running out', 'inventory', 'reorder'],
                        handler: 'getLowStock' },
  
  // Marketing
  WRITE_PROMO:        { keywords: ['promo', 'marketing', 'whatsapp', 'message', 'offer', 'write'],
                        handler: 'generatePromo' },
  
  // General
  DAILY_SUMMARY:      { keywords: ['summary', 'overview', 'report', 'how was', 'day going'],
                        handler: 'getDailySummary' },
  ANOMALY_DETECT:     { keywords: ['unusual', 'anomaly', 'strange', 'weird', 'different'],
                        handler: 'detectAnomalies' },
};
```

### 9.2 AI Response Format

Every AI response follows this structure:

```javascript
{
  type: 'text' | 'chart' | 'table' | 'action',
  content: 'The formatted response text with markdown',
  data: {}, // Raw data for charts/tables
  suggestions: ['Follow-up question 1', 'Follow-up question 2'],
  confidence: 0.95
}
```

### 9.3 Statistical Functions

```javascript
// Built-in analytics functions (no external library needed)
class AIAnalytics {
  // Moving average for trend smoothing
  movingAverage(data, windowSize)
  
  // Linear regression for forecasting
  linearRegression(xValues, yValues)
  
  // Growth rate calculation
  growthRate(current, previous)
  
  // Standard deviation for anomaly detection
  standardDeviation(values)
  
  // Percentile calculation for ranking
  percentile(values, p)
  
  // Day-of-week pattern detection
  dayOfWeekPattern(orders, metric)
  
  // Hour-of-day pattern detection  
  hourOfDayPattern(orders, metric)
  
  // Item co-occurrence for recommendations
  itemCoOccurrence(orders)
}
```

---

## 10. Watermarking Strategy

### 10.1 Visible Watermarks

#### 10.1.1 Loading Screen
```html
<!-- Existing brand + NextGenOS attribution -->
<div class="loading-brand">The Taste</div>
<div class="loading-tagline">Fast Food & Chinese</div>
<div class="loading-powered-by">
  Powered by <span class="nextgenos-text">NextGenOS</span>
</div>
```

#### 10.1.2 App Header
```html
<header class="app-header">
  <a href="#/pos" class="logo">🍜 The Taste</a>
  <span class="nextgenos-header-badge">NextGenOS</span>  <!-- Subtle purple micro-badge -->
  ...
</header>
```

#### 10.1.3 Sidebar Footer
```html
<div class="sidebar-footer">
  <div class="nextgenos-attribution">
    <span class="nextgenos-logo-icon">◆</span>
    <span>Created & Managed by</span>
    <span class="nextgenos-text">NextGenOS</span>
  </div>
  <div class="platform-version">v2.0.0</div>
</div>
```

#### 10.1.4 Thermal Receipt
```
================================
        THE TASTE
   Fast Food & Chinese
================================
  ... order details ...
================================
  Powered by NextGenOS
  www.nextgenos.com
================================
```

#### 10.1.5 Self-Order Kiosk
```html
<div class="kiosk-footer">
  Powered by <span class="nextgenos-text">NextGenOS</span> Restaurant OS
</div>
```

#### 10.1.6 Admin PIN Screen
```html
<div class="pin-screen-brand">
  <span class="nextgenos-logo">◆</span>
  <span>NextGenOS</span> Terminal
</div>
```

#### 10.1.7 Settings/About Page
```
About This Platform
━━━━━━━━━━━━━━━━━━
Platform:  NextGenOS Restaurant OS
Version:   2.0.0
Build:     nextgenos-2026.05.26-a1b2c3d
License:   Commercial — NextGenOS Pvt Ltd
Support:   support@nextgenos.com
━━━━━━━━━━━━━━━━━━
© 2026 NextGenOS. All Rights Reserved.
```

---

### 10.2 Invisible Watermarks

#### 10.2.1 HTML Meta Tags
```html
<meta name="generator" content="NextGenOS Restaurant Platform v2.0.0">
<meta name="platform" content="NextGenOS">
<meta name="platform-version" content="2.0.0">
<meta name="author" content="NextGenOS Engineering">
<meta name="copyright" content="© 2026 NextGenOS. All Rights Reserved.">
```

#### 10.2.2 HTML Comment Watermark
```html
<!--
  ╔══════════════════════════════════════════════════╗
  ║  NextGenOS Restaurant Operating System v2.0.0    ║
  ║  Created & Managed by NextGenOS                  ║
  ║  Build: nextgenos-{timestamp}-{hash}             ║
  ║  © 2026 NextGenOS. All Rights Reserved.          ║
  ╚══════════════════════════════════════════════════╝
-->
```

#### 10.2.3 JavaScript File Banner (All .js files)
```javascript
/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: {module-name}
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */
```

#### 10.2.4 CSS File Banner (All .css files)
```css
/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Stylesheet: {stylesheet-name}
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 * ═══════════════════════════════════════════════════
 */
```

#### 10.2.5 Console Signature (on app boot)
```javascript
console.log(`
%c ╔══════════════════════════════════════════════╗
 ║                                              ║
 ║   ◆  N E X T G E N O S                      ║
 ║      Restaurant Operating System             ║
 ║      Version 2.0.0                           ║
 ║                                              ║
 ║   Created & Managed by NextGenOS             ║
 ║   © 2026 NextGenOS. All Rights Reserved.     ║
 ║                                              ║
 ╚══════════════════════════════════════════════╝
`, 'color: #6C5CE7; font-family: monospace; font-size: 12px;');
```

#### 10.2.6 Hidden DOM Watermark
```html
<div aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;"
     data-platform="nextgenos" 
     data-version="2.0.0"
     data-signature="nextgenos-restaurant-os-2026">
  This platform is created and managed by NextGenOS Restaurant Operating System.
</div>
```

#### 10.2.7 HTTP Headers (vercel.json)
```json
{
  "key": "X-Powered-By",
  "value": "NextGenOS Restaurant OS v2.0.0"
},
{
  "key": "X-Platform",
  "value": "NextGenOS"
}
```

#### 10.2.8 PWA Manifest Watermark
```json
{
  "name": "The Taste - Restaurant POS | NextGenOS",
  "description": "Restaurant Operating System — Powered by NextGenOS"
}
```

#### 10.2.9 Build-Time Global Variable
```javascript
// Injected by Vite at build time
window.__NEXTGENOS__ = {
  platform: 'NextGenOS Restaurant OS',
  version: '2.0.0',
  build: '{BUILD_HASH}',
  timestamp: '{BUILD_TIMESTAMP}',
  copyright: '© 2026 NextGenOS. All Rights Reserved.'
};
```

#### 10.2.10 CSS Steganographic Watermark
```css
/* Encoded NextGenOS signature in custom properties */
:root {
  --_ng-sig-1: 78;   /* N */
  --_ng-sig-2: 101;  /* e */
  --_ng-sig-3: 120;  /* x */
  --_ng-sig-4: 116;  /* t */
  --_ng-sig-5: 71;   /* G */
  --_ng-sig-6: 101;  /* e */
  --_ng-sig-7: 110;  /* n */
  --_ng-sig-8: 79;   /* O */
  --_ng-sig-9: 83;   /* S */
}
```

#### 10.2.11 Service Worker Comment
```javascript
/**
 * NextGenOS Restaurant OS — Service Worker
 * Platform: NextGenOS | Version: 2.0.0
 * © 2026 NextGenOS. All Rights Reserved.
 */
```

#### 10.2.12 Data Layer Fingerprint
```javascript
// Every record synced to Supabase includes:
{
  _platform: 'nextgenos',
  _platformVersion: '2.0.0'
}
```

---

## 11. File Structure Blueprint

```
d:\Zeaul\Restraunt\
├── PLATFORM_BLUEPRINT.md          ← THIS FILE (Architecture Doc)
├── LICENSE                         ← NextGenOS proprietary license
├── index.html                      ← Entry point (with watermarks)
├── package.json                    ← Dependencies
├── vite.config.js                  ← Build config (with banner injection)
├── vercel.json                     ← Deployment config (with headers)
├── capacitor.config.json           ← Android config
│
├── public/
│   ├── favicon.svg                 ← App icon
│   └── icons/
│       ├── icon-192.png
│       ├── icon-512.png
│       └── nextgenos-badge.svg     ← NextGenOS brand icon
│
├── src/
│   ├── main.js                     ← App shell, sidebar, router setup
│   ├── router.js                   ← Hash-based SPA router
│   │
│   ├── components/                 ← Shared UI components
│   │   ├── Sidebar.js              ← 🆕 Sidebar navigation
│   │   ├── NextGenOSWatermark.js   ← 🆕 Watermark components
│   │   └── ChartCanvas.js          ← 🆕 Canvas chart base class
│   │
│   ├── db/
│   │   ├── database.js             ← Dexie schema + query functions
│   │   └── seed.js                 ← Initial data seeding
│   │
│   ├── services/
│   │   ├── ai.js                   ← 🆕 AI orchestrator
│   │   ├── aiIntents.js            ← 🆕 Intent classification
│   │   ├── aiAnalytics.js          ← 🆕 Statistical computation engine
│   │   ├── analytics.js            ← 🆕 Data aggregation service
│   │   ├── inventory.js            ← 🆕 Stock management service
│   │   ├── tables.js               ← 🆕 Table status management
│   │   ├── printer.js              ← Bluetooth printer service
│   │   ├── receipt.js              ← Receipt builder
│   │   ├── sync.js                 ← Supabase cloud sync
│   │   ├── upi.js                  ← UPI QR generation
│   │   └── watermark.js            ← 🆕 Watermark utilities
│   │
│   ├── utils/
│   │   └── helpers.js              ← Formatting, sounds, vibration
│   │
│   ├── styles/
│   │   ├── variables.css           ← Design tokens + NextGenOS brand
│   │   ├── base.css                ← Reset, typography, animations
│   │   ├── components.css          ← Button, card, badge, input styles
│   │   ├── layout.css              ← Grid, flex, responsive utilities
│   │   ├── sidebar.css             ← 🆕 Sidebar navigation styles
│   │   ├── ai.css                  ← 🆕 AI chat interface styles
│   │   └── analytics.css           ← 🆕 Chart + dashboard styles
│   │
│   └── views/
│       ├── pos/
│       │   ├── PosView.js          ← POS layout controller
│       │   ├── MenuGrid.js         ← Menu item grid
│       │   ├── CartPanel.js        ← Cart sidebar
│       │   └── PaymentModal.js     ← Payment flow
│       │
│       ├── kitchen/
│       │   └── KitchenView.js      ← Kitchen Display System
│       │
│       ├── admin/
│       │   ├── AdminView.js        ← PIN screen + admin console
│       │   ├── MenuManager.js      ← Menu CRUD
│       │   ├── OrderHistory.js     ← Order log viewer
│       │   └── Settings.js         ← App settings
│       │
│       ├── customer/
│       │   └── CustomerView.js     ← Self-order kiosk
│       │
│       ├── ai/                     ← 🆕 NEW MODULE
│       │   ├── AICommandCenter.js  ← Chat UI + message rendering
│       │   ├── AIMessageBubble.js  ← Message component
│       │   └── AIQuickChips.js     ← Pre-built action chips
│       │
│       ├── analytics/              ← 🆕 NEW MODULE
│       │   ├── AnalyticsDashboard.js ← Main dashboard
│       │   ├── RevenueChart.js     ← Revenue line/bar chart
│       │   ├── HeatmapChart.js     ← Hourly revenue heatmap
│       │   └── TopItemsTable.js    ← Best sellers leaderboard
│       │
│       ├── customers/              ← 🆕 NEW MODULE
│       │   ├── CustomersView.js    ← Customer list
│       │   ├── CustomerProfile.js  ← Individual profile
│       │   └── LoyaltyDashboard.js ← Tier + points
│       │
│       ├── staff/                  ← 🆕 NEW MODULE
│       │   ├── StaffView.js        ← Staff directory
│       │   ├── ShiftManager.js     ← Shift scheduling
│       │   └── ActivityLog.js      ← Audit trail
│       │
│       ├── inventory/              ← 🆕 NEW MODULE
│       │   ├── InventoryView.js    ← Stock dashboard
│       │   ├── IngredientEditor.js ← Add/edit ingredients
│       │   ├── RecipeMapper.js     ← Item-ingredient mapping
│       │   └── SupplierDirectory.js← Supplier management
│       │
│       ├── tables/                 ← 🆕 NEW MODULE
│       │   ├── TablesView.js       ← Floor plan overview
│       │   ├── FloorPlanEditor.js  ← Drag-and-drop layout
│       │   └── ReservationView.js  ← Booking calendar
│       │
│       └── channels/               ← 🆕 NEW MODULE
│           ├── ChannelHub.js       ← Unified order inbox
│           └── ChannelStats.js     ← Per-channel analytics
│
└── dist/                           ← Build output
```

---

## 12. Data Flow Architecture

### 12.1 Order Lifecycle

```
┌──────────────────────────────────────────────────────────────┐
│                      ORDER LIFECYCLE                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────┐    ┌───────────┐    ┌───────────┐    ┌──────┐ │
│  │ CREATED │───►│ CONFIRMED │───►│ PREPARING │───►│READY │ │
│  │(POS/Kiosk)│   │ (Paid)    │    │ (Kitchen) │    │(Serve)│ │
│  └─────────┘    └───────────┘    └───────────┘    └──┬───┘ │
│                                                       │      │
│                                                  ┌────▼────┐ │
│                                                  │COMPLETED│ │
│                                                  │(Archived)│ │
│                                                  └─────────┘ │
│                                                              │
│  Side Effects at Each Stage:                                 │
│  CREATED    → Save to IndexedDB, Sync to Supabase           │
│  CONFIRMED  → Print receipt, Notify kitchen, Deduct inventory│
│  PREPARING  → Start kitchen timer, Update KDS                │
│  READY      → Audio alert, Notify customer (if self-order)   │
│  COMPLETED  → Update analytics, Award loyalty points         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 12.2 Sync Flow

```
┌─────────────────┐          ┌──────────────────┐
│   IndexedDB     │          │    Supabase      │
│   (Local)       │          │    (Cloud)       │
│                 │  PUSH    │                  │
│  Write locally  │─────────►│  Upsert remote   │
│  (offline-first)│          │  (async)         │
│                 │          │                  │
│                 │  PULL    │                  │
│  Apply remote   │◄─────────│  Realtime events │
│  changes        │          │  (postgres_changes)│
│                 │          │                  │
│  isSynced: 0    │  RETRY   │                  │
│  (unsynced flag)│─────────►│  On reconnect    │
│                 │          │                  │
└─────────────────┘          └──────────────────┘
```

---

## 13. Security Architecture

### 13.1 Authentication Layers

```
Layer 1: Admin PIN        → 4-digit master PIN (existing)
Layer 2: Staff PINs       → Per-staff 4-digit PIN (🆕)
Layer 3: Role Permissions → Module access per role (🆕)
Layer 4: Supabase RLS     → Row-level security on cloud data
```

### 13.2 Data Protection

- All data stored locally in IndexedDB (encrypted by browser)
- Supabase connection uses HTTPS + anon key
- No sensitive data (PINs) synced to cloud
- Activity audit log tracks all admin actions
- Session auto-lock after configurable idle timeout

---

## 14. Offline-First Strategy

### 14.1 Offline Capability Matrix

| Feature | Offline | Notes |
|---------|---------|-------|
| POS ordering | ✅ Full | All data in IndexedDB |
| Kitchen display | ✅ Full | Local order polling |
| Receipt printing | ✅ Full | Bluetooth is local |
| Menu management | ✅ Full | Syncs when online |
| Order history | ✅ Full | Local data |
| Analytics | ✅ Full | Computed from local data |
| AI Command Center | ⚠️ Partial | Local stats work; LLM needs network |
| Cloud sync | ❌ Queued | Queues changes, syncs on reconnect |
| Self-order kiosk | ✅ Full | Runs independently |
| Customer CRM | ✅ Full | Local database |
| Inventory | ✅ Full | Local tracking |
| Staff management | ✅ Full | Local authentication |

### 14.2 PWA Configuration

- **Service Worker**: Precaches all app shell resources
- **Cache Strategy**: CacheFirst for fonts/icons, NetworkFirst for API
- **Install Prompt**: Custom install button in header
- **Background Sync**: Queue order syncs for when network returns

---

## 15. API & Service Layer

### 15.1 Service Registry

| Service | File | Singleton | Purpose |
|---------|------|-----------|---------|
| `syncService` | `sync.js` | ✅ | Supabase cloud synchronization |
| `printerService` | `printer.js` | ✅ | Bluetooth thermal printing |
| `aiService` | `ai.js` | ✅ | AI query orchestration |
| `analyticsService` | `analytics.js` | ✅ | Data aggregation engine |
| `inventoryService` | `inventory.js` | ✅ | Stock management |
| `tableService` | `tables.js` | ✅ | Table status management |

### 15.2 Event System

```javascript
// Cross-module communication via CustomEvents
window.dispatchEvent(new CustomEvent('sync-data-changed', { detail }));
window.dispatchEvent(new CustomEvent('order-created', { detail: order }));
window.dispatchEvent(new CustomEvent('inventory-low', { detail: item }));
window.dispatchEvent(new CustomEvent('customer-visited', { detail: customer }));
window.dispatchEvent(new CustomEvent('staff-clocked-in', { detail: staff }));
window.dispatchEvent(new CustomEvent('table-status-changed', { detail: table }));
```

---

## 16. Deployment & Distribution

### 16.1 Deployment Targets

| Target | Method | Config |
|--------|--------|--------|
| **Web (PWA)** | Vercel | `vercel.json` |
| **Android APK** | Capacitor 8 | `capacitor.config.json` |
| **Desktop** | PWA Install | Chrome/Edge install prompt |
| **Kiosk Mode** | Chrome `--kiosk` flag | Fullscreen self-order |

### 16.2 Build Pipeline

```
Source (src/)
    ↓ vite build
    ↓ Banner injection (NextGenOS copyright)
    ↓ Tree shaking + minification
    ↓ PWA manifest + service worker generation
    ↓ __NEXTGENOS__ global injection
    ↓
  dist/  →  Deploy to Vercel
    ↓
  npx cap sync  →  Android APK
```

---

## 17. Phased Roadmap

### Phase 1: Foundation (Current Sprint)
- [x] POS Terminal
- [x] Kitchen Display
- [x] Admin Console (Dashboard, Menu CRUD, Order History, Settings)
- [x] Self-Order Kiosk
- [x] Cloud Sync (Supabase)
- [x] Bluetooth Printing
- [x] PWA + Android APK
- [ ] **NextGenOS Watermarks (Visible + Invisible)**
- [ ] **Sidebar Navigation Overhaul**
- [ ] **Database Schema v2 (New tables)**

### Phase 2: Intelligence (Next Sprint)
- [ ] **AI Command Center**
- [ ] **Smart Analytics Dashboard**

### Phase 3: Operations (Following Sprint)
- [ ] **Customer CRM & Loyalty**
- [ ] **Staff & Roles Management**
- [ ] **Inventory Management**

### Phase 4: Advanced (Future)
- [ ] **Table Management & Reservations**
- [ ] **Multi-Channel Order Hub**
- [ ] Voice Ordering (AI-powered)
- [ ] WhatsApp integration
- [ ] Multi-branch support
- [ ] Multi-language (Hindi, English, Regional)

---

## 18. Success Metrics

### 18.1 Platform KPIs

| Metric | Target |
|--------|--------|
| App load time | < 2 seconds (first paint) |
| Offline functionality | 100% of core features |
| Module count | 11 modules (from 4) |
| Database tables | 13 tables (from 4) |
| Code routes | 11 routes (from 5) |
| AI query response | < 3 seconds for local queries |
| Watermark layers | 12+ invisible + 8 visible |

### 18.2 Business Impact

| Metric | Before | After |
|--------|--------|-------|
| Disconnected tools needed | 5-10 | **1** |
| Time to get business insights | Hours (manual) | **Seconds** (AI) |
| Customer retention tracking | None | **Automated** |
| Inventory management | Manual/Excel | **Integrated** |
| Staff accountability | None | **Full audit trail** |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | May 2026 | NextGenOS | Initial POS system |
| 2.0.0 | May 2026 | NextGenOS | Full Restaurant OS transformation |

---

> **© 2026 NextGenOS. All Rights Reserved.**  
> This document is proprietary and confidential. Unauthorized reproduction or distribution is prohibited.
> 
> **Created & Managed by NextGenOS**
