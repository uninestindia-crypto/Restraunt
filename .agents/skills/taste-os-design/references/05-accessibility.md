# Accessibility — the measurable floor

This file was missing from the design set. It is the machine-checkable part of the design law: what
`npm run test:a11y` asserts, plus the human checks a tool cannot make.

**Accessibility here is not a compliance exercise.** The storefront is used one-handed, outdoors, in
sunlight, by people of every age. The till is used for eight hours by someone who cannot stop to
squint. Every rule below has an operational reason.

---

## 1. Contrast

**The bar.**

| Content | Ratio |
|---|---|
| Text below 18.66px, or below 14px bold | **4.5:1** |
| Text 18.66px+ or 14px+ bold | **3:1** |
| Icons and control boundaries carrying meaning | **3:1** |
| Decorative — a glyph beside a label that already says it | no bar |

**Measure against the composited background, not the token.** A colour on a translucent surface
renders as the blend of everything behind it. Two failures in this codebase came from exactly this:

- `--text-muted` was `#575765`, which measured 2.8:1 on obsidian. It is now `#7C8899` (~5.4:1).
  **Do not darken it back.**
- The storefront's active bottom-nav label was `#bb4726` on a 10% tint over a blurred bar — 4.45:1,
  under the bar by 0.05. Fixed by making the pill opaque and adding `--store-accent-ink`.

**The lesson both share:** a translucent surface has no single contrast value. If you cannot compute
what is behind it, make it opaque.

**Never encode meaning in colour alone** (Law 4). Every status is colour + word + glyph.

---

## 2. Targets and spacing

- **44×44 CSS px minimum**, every platform, every control.
- The *visible* element may be smaller — expand the hit area with padding or a pseudo-element:
  ```css
  .tap-expand::after { content: ''; position: absolute; inset: -8px; }
  ```
- **≥8px between adjacent targets.** Two 44px targets flush against each other produce mis-taps.
- **Thumb zones.** On a phone the bottom third is easy and the top corners are hard. Primary actions
  go bottom. **Destructive actions never go where a thumb rests.**
- Whole rows and whole cards are targets, not just their titles.

---

## 3. Keyboard

Everything must be operable without a pointer. The till in particular is faster on a keyboard, and
some counter machines have no touchscreen at all.

| Key | Behaviour |
|---|---|
| `Tab` / `Shift+Tab` | Move between controls, in visual order |
| `Enter` | Activate a button or link; submit a single-field form |
| `Space` | Activate a button; toggle a checkbox |
| `Esc` | Close the topmost sheet, modal, or menu; clear a search field |
| `↑ ↓` | Move within a list or menu |
| `← →` | Move within a segmented control or chip row |
| `Home` / `End` | First / last item in a collection |

- Composite widgets (menu, chip row, tab list) are a **single tab stop** with arrow-key navigation
  inside. That is the ARIA authoring practice and it is what makes keyboard use fast rather than
  exhausting.
- **Focus order follows visual order.** If they disagree, fix the DOM order — not with `tabindex`.
- **Positive `tabindex` is banned.** `0` and `-1` only.
- Modals trap focus; closing returns focus to the trigger.
- On route change, move focus to the new view's heading and announce it.

---

## 4. Focus visibility

```css
:focus { outline: none; }              /* only ever paired with the next rule */
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: inherit;
}
```

- `:focus-visible`, not `:focus`, so a pointer click leaves no ring but `Tab` does.
- **Never `outline: none` without a replacement.** This is the most common accessibility failure in
  shipped web apps.
- The ring must clear 3:1 against **both** the control and the background behind it.

---

## 5. Names, roles, and structure

- Every control has an accessible name. Icon-only controls get `aria-label`.
- **One `<h1>` per view**, and headings descend without skipping.
- Landmarks: `<nav>`, `<main>`, `<header>` — with `aria-label` when there is more than one of a kind.
- Lists are lists. A grid of dish cards is a list of dishes, not a stack of divs.
- Images: `alt` describing the dish, or `alt=""` when the name is already beside it and the image is
  decorative duplication.
- `aria-hidden="true"` on every decorative glyph — otherwise a screen reader reads "restaurant" in the
  middle of a sentence.
- `aria-live="polite"` on the region that announces order status; `aria-live="assertive"` only for
  something the user must act on now.
- `aria-busy` while a region is loading.

---

## 6. Motion and sensory settings

- `prefers-reduced-motion: reduce` — reduce, don't remove (see `02-motion.md`).
- `prefers-reduced-transparency: reduce` — collapse every material to opaque.
- `prefers-contrast: more` — raise separator opacity, add borders to controls.
- **Nothing flashes more than three times per second.** Ever.
- **No audio-only feedback.** The kitchen chime is an enhancement; the visual arrival of the ticket is
  the signal. A kitchen is loud and a cook may be deaf.

---

## 7. Zoom, viewport, and overflow

- **320px wide with no horizontal scroll.** The page body never scrolls sideways; wide content
  (tables, chip rows, code) scrolls inside its own `overflow-x: auto` container.
- **200% text zoom with no clipping or overlap.** `min-height`, not `height`. Let meaningful strings
  wrap.
- `user-scalable=no` and `maximum-scale=1` are banned.
- Nothing that matters is hidden behind a hover — hover may only enhance.

---

## 8. Forms

- Every field has a `<label>`, not just a placeholder.
- Errors are associated with `aria-describedby` and the field carries `aria-invalid`.
- A long form gets an error summary at the top linking to each bad field, **plus** the inline errors.
- Required fields are marked in text, not only with an asterisk colour.
- Autocomplete attributes on name, phone, and email — a guest typing their number on a phone should
  not have to type it twice.

---

## 9. What the automated suite checks, and what it cannot

`npm run test:a11y` runs axe-core across all five viewport projects and asserts:

- zero **critical** or **serious** violations on the public ordering page, the staff sign-in, and the
  static marketing pages
- every interactive control meets the 44px minimum on mobile viewports
- the storefront does not scroll horizontally at 320px
- the customer navigation bar stays on screen rather than sinking to the page foot
- dish details are reachable by keyboard and the dialog manages focus

**What it cannot check, and what therefore needs a human at G6:**

- whether the accessible name *makes sense* ("button" passes; "Order now" is correct)
- whether the reading order is logical
- whether a live region announces at a useful moment
- whether the contrast is right on a surface whose backdrop changes with scroll
- whether the flow is completable by someone who has never seen it

**A green axe run is a floor, not a pass.** Say so when reporting it.

---

## 10. The pre-gate checklist

- [ ] Contrast measured on every text/background pair that changed, against the composited value
- [ ] No meaning carried by colour alone
- [ ] Every control ≥44px with ≥8px separation
- [ ] Whole flow completable by keyboard alone, including every modal
- [ ] Focus visible everywhere, focus order matches visual order
- [ ] Every control has a sensible accessible name; decorative glyphs are `aria-hidden`
- [ ] One `<h1>`; headings do not skip
- [ ] 320px: no horizontal scroll · 200% zoom: no clipping
- [ ] Reduced motion, reduced transparency, and increased contrast all honoured
- [ ] `npm run test:a11y` green on all five viewports — and reported as a floor, not a pass
