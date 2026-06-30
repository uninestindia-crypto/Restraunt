# The Taste Customer Platform Roadmap

## Product objective

Evolve the public storefront from a single ordering page into a complete customer platform that supports discovery, ordering, retention, loyalty, support, and brand trust across mobile and desktop.

## Experience principles

- Food and brand come first; operational language stays contextual.
- Every core journey works with one hand on mobile.
- The cart survives navigation and checkout remains uninterrupted.
- Customer, staff, and administrative experiences remain strictly separated.
- Pricing, tax, discounts, payment status, and permissions are server validated.
- Every page provides loading, empty, offline, error, and accessible focus states.

## Delivery phases

### Phase 1 — Platform foundation

- Shared customer shell, navigation, footer, mobile navigation, and design tokens.
- Route-aware page model for Home, Menu, Offers, Account, About, Catering, and Support.
- Persistent cart, session, responsive layout, and accessible navigation states.

### Phase 2 — Commerce journey

- Dedicated searchable Menu and dish-detail experiences.
- Dietary filters, customisations, recommendations, favourites, and bundles.
- Cart, coupon, fulfilment estimate, checkout, saved address, scheduling, and payment choice.
- Server-authoritative totals, offers, inventory, and payment verification.

### Phase 3 — Account and order lifecycle

- Profile, saved addresses, favourites, order history, reorder, preferences, and security.
- Confirmation, live order timeline, ETA, receipt, cancellation, support, rating, and review.

### Phase 4 — Loyalty and retention

- Rewards dashboard, points ledger, tiers, referral programme, personalised offers, and lifecycle messaging.
- Birthday rewards, abandoned-cart recovery, WhatsApp updates, and push notifications.

### Phase 5 — Brand and discovery

- Brand story, locations, hours, gallery, reviews, catering, events, FAQ, allergens, and policies.
- SEO metadata, structured data, shareable menu items, and campaign landing pages.

### Phase 6 — Premium capabilities

- Intelligent recommendations, multilingual UI, gift cards, wallet credit, group ordering, QR table ordering, and advanced accessibility preferences.

## Initial route map

| Route | Purpose |
| --- | --- |
| `/` | Brand-led home and discovery |
| `/menu` | Searchable ordering catalogue |
| `/offers` | Current rewards and bundles |
| `/account` | Customer identity and history |
| `/about` | Story and values |
| `/catering` | Group and event enquiries |
| `/support` | Help, contact, FAQ, and policies |

## Execution status

- [x] Roadmap committed to the codebase.
- [x] Premium storefront design foundation.
- [x] Shared customer shell and in-app page navigation.
- [x] Route-aware customer shell using `#/self-order?page=...` links and mobile bottom navigation.
- [x] Customer discovery and brand pages.
- [x] Account foundation and authenticated rewards entry.
- [x] Local order history, favourites, saved addresses, preferences, and reorder surface.
- [x] Live order tracking timeline, ETA, receipt, support, and review capture.
- [x] Server-backed offers and authenticated favourites contract with local fallback.
- [x] Customer-owned Supabase resource migration with RLS policies.
- [x] Retention preference surfaces without unbounded automation.
- [x] SEO metadata, structured restaurant data, policies, and premium accessibility-ready polish.

## Launch gates

- Keyboard and screen-reader navigation verified.
- Mobile layouts verified at 360, 390, and 430 pixel widths.
- No client-authoritative price, discount, tax, or payment decisions.
- Customer data access protected by authenticated ownership and RLS.
- Unit, integration, accessibility, and production-build checks pass.
