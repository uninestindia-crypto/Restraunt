# Interaction — touch, pointer, keyboard, state

How it responds is what makes it feel real.

---

## 1. Targets

See `05-accessibility.md` §2 for the measurable floor. The design consequences:

- **Thumb zones matter.** On a phone the bottom third is easy, the top corners are hard. The
  storefront's primary actions — add to cart, checkout, place order — live at the bottom.
- **Destructive actions never go where a thumb rests.** "Cancel order" belongs behind a deliberate
  reach, never adjacent to "Mark served" at the bottom of a ticket.
- **On the till, targets grow.** A cashier is fast and imprecise. Dish tiles are 88px minimum, and
  the payment method buttons are larger than that.

---

## 2. Press and hover

**Every interactive element responds within 100ms**, before any network call resolves.

```css
/* pointer devices only — hover on touch produces sticky states */
@media (hover: hover) and (pointer: fine) {
  .btn:hover { background: var(--bg-card-hover); }
}
.btn:active { transform: scale(0.97); }
```

- `:active` is required. `:hover` is optional and **must be inside a hover media query**.
- Never rely on hover to reveal a control needed on touch.
- Cursor: `pointer` on anything clickable, `not-allowed` on disabled, default otherwise. A `pointer`
  cursor on non-interactive text is a lie.
- `touch-action: manipulation` on interactive elements removes the 300ms tap delay.

---

## 3. Gestures

- **Every gesture needs a visible fallback.** Swipe-to-advance a ticket must also exist as a button.
  A gesture is an accelerator for experienced users, never the only path — and the person on the till
  tonight may be new.
- Swipe actions reveal proportionally under the finger, snap open past 40% of the action width, spring
  back below it.
- Respect system edge gestures — no horizontal swipe target within 20px of the screen edge; it fights
  the OS back gesture.
- Pull-to-refresh only on screens that genuinely change: the KDS and the order list.
- Long-press (500ms) opens a context menu, with haptic feedback at the threshold.
- **Never hijack pinch-zoom or block scroll.**

---

## 4. Haptics

Available through the Capacitor wrapper; the web gets no-ops.

| Feedback | When |
|---|---|
| Selection tick | Category change, chip select, quantity step |
| Impact light | Add to cart, toggle |
| Impact medium | Sheet snapping, swipe action committing |
| Success notification | Order placed, payment taken |
| Warning notification | Validation blocked the submission |
| Error notification | The write was refused |

Haptics **confirm**, they do not decorate. Never on scroll, never per keystroke, never more than one
per user action.

---

## 5. The nine states

Every component. Written before shipping, forced rather than imagined.

1. **Default** — resting
2. **Hover** — pointer only
3. **Pressed** — within 100ms, `scale(0.97)`
4. **Focus-visible** — the ring
5. **Disabled** — with an adjacent explanation of why
6. **Loading** — skeleton for content, in-place spinner for an action, `aria-busy`
7. **Empty** — the right one of the three flavours
8. **Error** — what happened, what to do, how to retry
9. **Overflow** — 500 tickets, a 200-character dish name, a ₹99,99,999 total. Does it hold?

Plus the two this product cannot omit:

10. **Offline** — what still works, and what is queued
11. **Stale** — this is cached, and here is how old it is

---

## 6. Forms

- Validate on **blur**; re-validate on change only after a field has errored.
- One error summary at the top of a long form, linking to each bad field, plus inline errors.
- **Preserve input on failure.** Never clear a form because the server rejected it.
- Autosave long forms; show a "Saved" timestamp.
- Warn before navigating away from unsaved changes.
- **Submit disables itself during flight** and shows a spinner. This is the double-submit guard.
- After success: navigate, or show a confirmation. Never leave the user staring at the form wondering
  whether it worked.

---

## 7. Offline and slow networks

**This is a primary environment, not an edge case.** Guests are on cellular; the counter's wifi drops.

- **Optimistic UI for everything reversible** — show the result, reconcile after, and roll back
  *visibly with an explanation* if it fails. A silent rollback is a silent failure.
- **Queue mutations and replay them**, with a persistent, visible count of what is pending. A queued
  write with no visible home is the defect this product is most prone to.
- **Show the last-known data with its age** rather than an empty screen. "Menu as of 6:42 PM" is
  useful; a spinner forever is not.
- Images: `loading="lazy"`, explicit dimensions or `aspect-ratio`, a tinted placeholder.
- Every network error offers a Retry, and **distinguishes "you're offline" from "the server refused"**
  — those need different actions from the user, and in this product the second one often means a
  migration is unapplied or a role is wrong.
- Photos capture locally first and upload in the background. Never block the user on an upload — but
  never let the local copy silently become the only copy either. Surface what has not published.

---

## 8. Scroll

- `overscroll-behavior: contain` on scrollable panels so a scroll inside does not chain to the page.
- **Never hijack the scroll.** No scroll-jacking, no custom smooth-scroll libraries.
- Sticky headers use `position: sticky` and gain their material or shadow only once scrolled, via an
  `IntersectionObserver` sentinel rather than a scroll listener.
- **Check what makes an ancestor a containing block** before adding `overflow: clip` or a retained
  transform — both silently break `sticky` and `fixed`. See `01-foundations.md` §5.3.
- Restore scroll position on back navigation.
- Horizontal chip rows get `scroll-snap-type: x proximity` and a trailing mask so it is obvious there
  is more.
- Infinite scroll needs a visible loading indicator and a "load more" fallback for keyboard users.

---

## 9. Interruption

Real use is interrupted constantly: a guest locks their phone mid-order, a cashier is asked a
question, a cook walks away.

- **Nothing times out silently.** If a session expires, say so and preserve the cart.
- **Returning to a backgrounded tab refetches** rather than showing whatever was on screen an hour
  ago — and says so if the data changed.
- A modal open when a route changes closes cleanly and returns focus somewhere sensible.
- Two tabs of the storefront must not fight over one cart.
