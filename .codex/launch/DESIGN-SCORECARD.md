# DESIGN SCORECARD — 2026-08-14 — `f9ff4ca`

Scored against `.agents/skills/taste-os-design/`. Every line has a measurement behind it; nothing
here is an impression.

# TOTAL: 65/100

The engineering scorecard is 97/100. This one is 65. That gap is the honest state of the product:
it is correct, tested and secure, and it is not yet held to the standard the design law describes.

---

| Area | Score | |
|---|---:|---|
| Foundations — grid, type, colour, shape, depth | 15/20 | token discipline broken in the view layer |
| Motion | 9/20 | **the weakest area**; the law's one hard rule is broken 70 times |
| Components — the nine states | 11/20 | the state this product most needs does not exist |
| Interaction | 13/15 | strong |
| Accessibility | 11/15 | the automated floor is clean; the human layer is not covered |
| Writing | 6/10 | voice rules are not applied |

---

## Deductions, ranked by what they cost the user

### 1. No offline or stale surface exists anywhere — **−6**
`03-components.md` §10 makes this mandatory for this product, and `grep` finds nothing: no banner,
no "as of" timestamp, no pending-changes count. The data layer queues writes correctly and the
screen never says so. A cashier cannot tell a working till from a diverging one, which is the
single largest gap between what this product does and what it shows.

### 2. `transition: all` × 70 — **−7**
26 in stylesheets, 44 in inline styles. `02-motion.md` §2: *"Never `transition: all`. It animates
properties you didn't intend, including ones that trigger layout, and it cannot be audited."* On
the low-end Android phones guests use, this is the difference between smooth and janky.

### 3. 134 raw hex values in views and components — **−5**
e.g. `LoyaltyDrawer.tsx` carries `#8C7853`, `#4E3E28`, `#BDC3C7` inline. `01-foundations.md` §3:
*"Never write a raw hex in a component."* None of these are in the token file, so none of them
respond to the theme, and none were contrast-checked.

### 4. `prefers-reduced-transparency` and `prefers-contrast` unhandled — **−4**
Zero occurrences of either. `05-accessibility.md` §6 requires both. The app leans heavily on
`backdrop-filter` materials, which is exactly the case `reduced-transparency` exists for.

### 5. 7 of 18 icon-only buttons have no accessible name — **−4**
`05-accessibility.md` §5: *"Never an icon-only control without an accessible name."* These pass axe
only because axe cannot reach them behind interaction.

### 6. 35 exclamation marks in toasts — **−3**
`06-writing.md` §1: *"No exclamation marks. One per product, maybe."* "Staff member added!",
"Order placed!" — the voice is a brand's, not the product's.

### 7. Three dead-end error strings — **−2**
"Something went wrong while showing this page" in `StorefrontErrorBoundary`. §4: *"Never 'Something
went wrong'. Say what."*

### 8. One transition animating a layout property — **−1**
Triggers layout on every frame instead of compositing.

### 9. Human review (R7) not performed — **−3**
No Customer Zero pass on a real phone, no taste review with a remove list. `05-accessibility.md`
§9 is explicit that a green axe run is a floor, not a pass — so this cannot be scored from a
container, and is deducted rather than assumed.

---

## What already meets the standard

Worth stating, because these are the parts most products get wrong:

- **Contrast.** 0 critical or serious axe violations across all five viewports. Both near-misses
  were found and fixed with the reasoning recorded next to the token: `--text-muted` was raised
  from a failing 2.8:1, and `--store-accent-ink` exists precisely because the brand terracotta
  measures 4.37:1 on its own accent tint.
- **Targets and viewport.** 44px minimum and no horizontal scroll at 320px, both asserted by tests
  rather than assumed.
- **Focus.** `:focus:not(:focus-visible)` is the correct idiom, no positive `tabindex`, no
  `user-scalable=no`.
- **Escaping.** 105 `escapeHtml` call sites against 71 `innerHTML` assignments, with a test.
- **Currency.** `toLocaleString('en-IN')` — real lakh grouping, not a hand-rolled separator.
- **Reduced motion.** Handled in three stylesheets.
- **Status vocabulary.** "Deleted" is never printed for an order, which is the specific wording
  failure that produced "it says deleted but nothing happens".

---

## The order to fix them

Two changes recover 13 of the 35 points and are the only two a user would feel:

1. **Build the offline/stale banner.** One component, spec in `03-components.md` §10.
2. **Replace `transition: all` with named properties.** Mechanical, 70 sites, no design decisions.

Then 3, 4 and 5 together are another 13 and are all mechanical. The writing items are an hour.
Human review is a session with a real phone and cannot be shortcut.

**Nothing here is a correctness bug.** This is the difference between finished and good — which is
the exact question `06-taste` exists to ask, and the answer today is: finished, not yet good.
