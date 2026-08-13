# Components — the contracts

This file was missing from the design set. Everything here is a contract: if a component does not
meet it, it is not finished, regardless of how it looks in the one state you built it in.

**The universal contract.** Every component declares, in its own code and in its review:

1. Its **job**, in one sentence.
2. Its **nine states** (Law 5) — default, loading, empty, error, offline, stale, disabled,
   permission-denied, overflow.
3. Its **accessible name and role**.
4. Its **hit area** (≥44×44).
5. What it does when the **data is wrong** — a 200-character name, a null price, 500 rows.

---

## 1. Button

**Job.** Commit to one outcome.

| Variant | Use | Look |
|---|---|---|
| **Primary** | The single most important action on the screen | `--color-primary-fill` behind white text |
| **Secondary** | The alternative | Surface + `--border-active` |
| **Ghost** | Tertiary, in a dense row | Text only, tinted on hover |
| **Destructive** | Cancel an order, delete a dish | `--color-danger` as text on a tint; solid only on confirm |

**Rules.**
- **One primary per screen.** If two things are primary, neither is.
- The label names the outcome: "Place order", "Take payment", "Mark served". Not "Submit", "OK",
  "Continue". 1–4 words.
- Destructive buttons name the thing: "Cancel order #2041", not "Cancel". And the button that closes
  a dialog without acting is always "Cancel" — never "Nevermind", never "Dismiss".
- **A button that triggers a network write disables itself during flight and shows a spinner in
  place.** Not a full-screen overlay. This is the double-submit guard, and on this product's write
  path it is the difference between one order and two.
- `--color-primary` may not sit behind white text. Use `--color-primary-fill` (3.04:1 vs 4.9:1).
- Press: `scale(0.97)` within 100ms, before the network is consulted.

**Disabled vs blocked.** Prefer **enabled with clear feedback** over disabled. A disabled button with
no explanation is a dead end — the user cannot tell whether they are missing a step or the app is
broken. Let them press it and show what is missing. Disable only when the action is genuinely
impossible (already submitted, no permission), and pair it with an adjacent reason.

---

## 2. Dish card (storefront)

**Job.** Make one dish appetising and orderable in one tap.

- Photo with a fixed `aspect-ratio` — **reserved before it loads**, or the grid reflows under a
  scrolling thumb.
- `loading="lazy"`, explicit dimensions, and a tinted placeholder.
- Name at `--text-base`, weight 600, wrapping to two lines then truncating.
- Price `tabular-nums`, never truncated.
- Veg/non-veg mark is a **glyph plus a colour**, never colour alone.
- The **whole card** is the target, not just the name.
- **Unavailable** is a state of this component, not a filter applied elsewhere: dimmed, labelled "Not
  available today", and not tappable.
- **No image** is the common case, not the exception. The no-photo card must look deliberate — a
  tinted panel with the dish's initial — not like a broken image.

---

## 3. List row (admin, orders, staff)

**Job.** Show one record and its one action.

- Leading: an icon tile or avatar, `--radius-md`, tinted by category or status.
- Primary text `--text-base`; secondary `--text-sm` in `--text-secondary`.
- Trailing: the value or the action, right-aligned, `tabular-nums` if numeric.
- Hairline separator between rows, not around each row.
- The **whole row** is the target. If there is also a secondary action, it needs its own 44px target
  with ≥8px of space between them — a delete control adjacent to a common one at 24px each is how
  the wrong order gets cancelled.

---

## 4. Ticket card (KDS)

**Job.** Tell a cook, from across the room, what to make and how long it has been waiting.

This is the one component where the usual density rules invert. It is read at 2–3 metres by someone
whose hands are full.

- Order number at `--text-2xl` minimum. It is the identifier, and it is never truncated.
- Elapsed time is the second-loudest element, and it **changes colour as it ages** — with the age also
  written in words, because Law 4 applies hardest here.
- Items at `--text-base`, one per line, quantity leading. Modifiers and notes indented beneath, never
  on the same line.
- Status is a rail down the leading edge plus a label.
- **The action is a large, unmissable target** — a cook taps it with a knuckle.
- **Nine states matter here more than anywhere.** A ticket whose status write failed must say so on
  the card, not in a toast that has already gone.

---

## 5. Modal and bottom sheet

**Job.** One decision, with the context needed to make it.

- Below 640px a modal becomes a **bottom sheet**. Thumbs are at the bottom of the phone.
- Focus moves into it on open and returns to the trigger on close.
- Focus is trapped while it is open. `Esc` closes it.
- The backdrop is dismissible **only if the action is non-destructive and the form is empty**. A
  half-filled form that vanishes because a thumb brushed the edge is a real loss of work.
- Actions are pinned to the bottom, primary on the trailing side, and the pinned bar is **opaque** —
  a translucent action bar over scrolling content is unreadable at the exact moment it matters.
- Never nest a modal inside a modal. If you need to, the flow is wrong.

---

## 6. Toast

**Job.** Report the outcome of something the user just did.

- Position: bottom on a phone (above the nav bar), top-trailing on desktop.
- Hold 4s; **9s when it carries a refusal the operator must read and act on.**
- One line where possible; two when the second line says what to do next.
- Never a toast for something the user can see on screen. Never two toasts at once.
- **Never a success toast before the server answered.** This is the most important rule in this file
  and it is a correctness rule wearing a design costume: "Staff member added!" and "Order deleted"
  were both printed before the write was accepted, and both were false.
- An error toast names the refusal in the operator's language, not a Postgres code.

---

## 7. Badge and chip

- **Badge** — non-interactive status. `--radius-sm`, a 10% tone tint, the tone as text, `--text-xs`,
  plus a glyph. Never colour alone.
- **Chip** — interactive filter or category. `--radius-full`, 44px tall including its hit area,
  selected state is a filled tint plus a weight change, not colour alone.
- A row of chips scrolls horizontally with `scroll-snap-type: x proximity` and a mask on the trailing
  edge so it is obvious there is more.

---

## 8. Field

- Label above, always. Placeholder is never the label — it vanishes exactly when the user needs it.
- `--radius-md`, `--bg-input`, `--border-color`; focused adds `--border-active` plus the focus ring.
- Helper text below in `--text-sm`; error text replaces it in `--color-danger`, and the field gets
  `aria-invalid` and `aria-describedby`.
- Numeric fields: `inputmode="numeric"`, `tabular-nums`.
- Phone fields: `inputmode="tel"`, and **trim whitespace and strip formatting on the way in** — a
  pasted number with spaces and a `+` is the single most common cause of "my details don't work".
- Validate on blur; re-validate on change only after a field has errored.
- **Preserve input on failure.** Never clear a form because the server rejected it.

---

## 9. Empty state

Three flavours, and they are different components:

| Flavour | Title | Body | Action |
|---|---|---|---|
| Nothing yet | "No orders yet today" | "Orders will appear here as they come in." | — |
| No results | "No dishes match" | "Try a different category or clear the search." | Clear filters |
| Error | "Couldn't load the menu" | "Check your connection and try again." | Retry |

Never a bare "No data". Never a joke — the user is trying to work or trying to eat.

---

## 10. Offline and stale banner

**This product needs this component and most products do not.** When the app is showing cached data
because the cloud was unreachable, the user must be able to tell.

- A persistent, low-profile strip — not a toast, because it describes a *state*, not an event.
- Says what is true and how old it is: "Offline — showing the menu as of 6:42 PM."
- Says what still works: taking orders queues them.
- When writes are queued, it says how many: "3 changes waiting to sync."
- It disappears by itself when the connection returns and the queue drains, and the disappearance is
  the confirmation — no separate success toast.

---

## Component review checklist

- [ ] The job is stated in one sentence
- [ ] All nine states exist and were forced, not imagined
- [ ] Accessible name and role on every control
- [ ] Hit area ≥44×44 with ≥8px between adjacent targets
- [ ] Contrast measured against the actual composited background
- [ ] Survives a 200-character string and a 500-row list
- [ ] Survives 320px width and 200% zoom
- [ ] Double-tap does not double-submit
- [ ] Every interpolation escaped
- [ ] Keyboard: reachable, activatable, escapable
- [ ] Reduced-motion variant
