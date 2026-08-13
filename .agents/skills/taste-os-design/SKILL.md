---
name: taste-os-design
description: >-
  The design law for The Taste restaurant OS. Use whenever building, changing, or reviewing anything
  a human looks at — a storefront screen, a POS or KDS surface, an admin view, a modal, a toast, an
  empty state, a piece of interface copy, a colour, a motion, or a component's states. Defines the
  two theme systems (the staff console's obsidian dark and the storefront's warm light), the type,
  space, shape and depth scales, the component contracts, the interaction and accessibility rules,
  and the writing voice. Founder Mode's P6 taste gate defers to this file entirely. Load it before
  the first line of markup or CSS, not after.
---

# The Taste — Design Law

Two products live in this codebase, and they do not look alike on purpose.

| | **Storefront** | **Staff console** |
|---|---|---|
| Who | A hungry stranger, on their phone, outdoors, one-handed | A cashier or cook, on a fixed screen, for eight hours |
| Mood | Warm, appetising, calm — a menu on good paper | Focused, high-contrast, low-fatigue — an instrument |
| Ground | Cream `#fdf7f0`, cards in true white | Obsidian `#040406`, surfaces in graphite |
| Accent | Terracotta `#bb4726` | Vermillion `#FF5E36` |
| Density | Generous. One decision per screen. | Dense. Everything reachable without scrolling. |
| Failure cost | They leave and eat elsewhere | The queue stops moving |

**They share the grid, the type ramp, the motion physics, the interaction rules, and the voice.**
They share nothing else. A storefront card dropped into the POS looks broken, and vice versa — that
is correct, and reviewers should stop treating it as an inconsistency to fix.

**Where the tokens actually live:**

- `src/styles/variables.css` — the staff console's `:root`. The dark theme, the brand orange, the
  type ramp, the 8pt space scale, the radius scale, the shadow ladder, the motion curves.
- `src/styles/storefront.css` — the storefront's own palette, layered on the same structural tokens.
- `src/styles/base.css`, `layout.css`, `components-v2.css`, `sidebar.css` — the shared chrome.
- `src/styles/storefront-static.css` — the pre-rendered marketing pages.

**Never write a raw hex in a component.** If the colour you need is not a token, the decision is
whether it should be a token — take that decision deliberately and add it, with a comment saying
what it is for and what it measures against its background.

---

## The nine laws

**Law 1 — The screen serves one job.**
Name the job before you write markup. "Choose a dish", "take payment", "clear this ticket". Anything
on the screen not serving that job is a candidate for the remove list.

**Law 2 — Contrast is not a preference.**
Body text meets 4.5:1 against its actual composited background. Text at 18.66px+ or 14px+ bold meets
3:1. This is measured, not estimated — and it is measured against what the pixel actually renders,
which for a translucent surface is not the token's value. See `references/05-accessibility.md`.

**Law 3 — Every interactive element is at least 44×44 CSS pixels.**
The visible part may be smaller; the hit area may not. A cashier taps this ten thousand times a week
and a guest taps it with a thumb while walking.

**Law 4 — Status is never colour alone.**
"Preparing" is amber *and* says "Preparing" *and* has a glyph. Roughly one in twelve men cannot
separate your red from your green, and the kitchen screen is read across a room.

**Law 5 — Nine states or it is not a component.**
Default, loading, empty, error, offline, stale, disabled, permission-denied, overflow. Written in the
same slice as the happy path. In this product **offline and stale are not edge cases** — the network
drops mid-service routinely, and a screen that cannot say "this is what we last knew" is lying.

**Law 6 — Motion answers "where did this come from and where did it go?"**
If it does not answer that, delete it. Entering decelerates, exiting accelerates, nothing blocking
runs longer than 400ms.

**Law 7 — Concentric corners.**
`inner_radius = outer_radius − padding`. Get it wrong and the gap between the curves visibly pinches.
Below 4px, use a square inner element.

**Law 8 — The words are part of the design.**
Read every string aloud. If it sounds like marketing, a lawyer, or a stack trace, rewrite it. An
error that does not say what to do next is a design failure, not a copy detail.

**Law 9 — Escape everything.**
This codebase composes views as HTML strings. Every interpolation of user, menu, or order data goes
through `escapeHtml`. This is a design law because it is a property of how these views are written,
and it is the single highest-yield defect in the view layer.

---

## The remove list

The primary output of a design review is not a fix list. It is a **remove list**: the things that
ship and should not.

Look for: an option that should be a default; three screens that should be one; a setting nobody will
change; a badge that repeats what the row already says; a "learn more" nobody clicks; a confirmation
step for a reversible action; a feature that is 60% good and drags the average down; every word not
doing work.

**A design review whose remove list is empty did not happen.** Write it, execute it, and say what was
cut.

---

## Reviewing a screen — the walk

In this order, on a real device, with realistic data:

1. **The job.** What is this screen for? Can you tell in two seconds without reading?
2. **The hierarchy.** Squint. What is loudest? Is that the most important thing? Is there exactly one
   primary action?
3. **The states.** Force all nine. Not by imagining them — by disconnecting the network, emptying the
   data, and pasting a 200-character dish name.
4. **The copy.** Read every string aloud. Buttons name outcomes; errors say what to do next; empty
   states offer a way forward.
5. **The measurements.** Contrast on the text that matters; 44px on everything tappable; 320px with
   no horizontal scroll; 200% zoom with no clipping.
6. **The motion.** Interrupt it. Tap twice fast. Turn on reduced motion.
7. **The remove list.** What goes?

---

## References

| File | Load it when |
|---|---|
| `references/01-foundations.md` | Grid, type, colour, shape, depth — any visual decision |
| `references/02-motion.md` | Anything that moves, appears, or disappears |
| `references/03-components.md` | Building or changing a button, card, row, modal, toast, badge, field |
| `references/04-interaction.md` | Touch, pointer, keyboard, focus, forms, offline behaviour |
| `references/05-accessibility.md` | Before every taste gate; contrast, keyboard, screen reader, motion |
| `references/06-writing.md` | Any user-visible string |

---

## Relationship to the rest of the project's law

- **`.agents/AGENTS.md` outranks this file** on architecture — particularly the anti-spaghetti
  directive. Where this file says "compose the markup", AGENTS.md's direction toward modular
  components is the target state; do not read this skill as a licence to add more monolithic HTML
  strings.
- **`founder-mode`'s P6 gate defers here.** `taste-critic` loads this file and applies it as the
  standard rather than inventing taste.
- **`founder-mode`'s R6 ring is measured by `npm run test:a11y`**, whose assertions are the
  machine-checkable subset of `references/05-accessibility.md`.
