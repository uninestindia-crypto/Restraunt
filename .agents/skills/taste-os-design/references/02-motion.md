# Motion — physics, timing, choreography

Motion is the part everyone gets wrong, and it is the loudest signal of quality. A correct interface
with bad motion feels cheap; a plain interface with correct motion feels expensive.

**The one-sentence theory:** every animation answers *"where did this come from and where did it
go?"* If it does not answer that, delete it.

---

## 1. The curves

The tokens are in `src/styles/variables.css`:

| Token | Value | Character |
|---|---|---|
| `--transition-fast` | `160ms cubic-bezier(0.16, 1, 0.3, 1)` | Press feedback, hover, small state changes |
| `--transition-normal` | `320ms cubic-bezier(0.16, 1, 0.3, 1)` | The default. Cards, sheets, transitions |
| `--transition-slow` | `550ms cubic-bezier(0.16, 1, 0.3, 1)` | Large-surface moves only |
| `--transition-spring` | `520ms cubic-bezier(0.175, 0.885, 0.32, 1.275)` | Overshoot — selection, arrival |

`cubic-bezier(0.16, 1, 0.3, 1)` is a long, luxurious deceleration: it starts fast and settles gently,
which is the correct shape for something *arriving*.

**Enter decelerates, exit accelerates.** Something arriving has been in motion and is coming to rest;
something leaving is being pushed away. Reversing these is the single most common motion bug — it
feels subtly wrong to everyone and is identifiable by almost nobody. For exits, use a curve that ends
fast: `cubic-bezier(0.4, 0, 1, 1)`.

**Distance scales duration.** A 20px nudge at 320ms feels sluggish; a full-screen slide at 160ms feels
violent. Roughly: <100px → 160ms, 100–400px → 320ms, >400px → 400ms.

**Ceiling: 400ms for anything blocking interaction.** Beyond that the interface feels like it is
thinking rather than responding. `--transition-slow` is for ambient and celebratory moments only —
and in a restaurant app, during a rush, there are no celebratory moments.

---

## 2. What may be animated

**Animate only `transform` and `opacity`.** These are composited on the GPU and do not trigger layout
or paint. Everything else risks jank on the low-end Android phones guests actually carry.

| Safe | Expensive — avoid |
|---|---|
| `transform: translate / scale / rotate` | `width`, `height`, `top`, `left`, `margin` |
| `opacity` | `box-shadow` (animate a pseudo-element's opacity instead) |
| `filter` (sparingly) | `background-color` on large surfaces |
| `clip-path` | `backdrop-filter` (never animate this) |

**Never `transition: all`.** It animates properties you did not intend, including ones that trigger
layout, and it cannot be audited. Name the properties:

```css
transition-property: transform, opacity;
```

**Never animate to or from `display: none`.** Use `opacity` + `visibility`, or
`transition-behavior: allow-discrete`. A element at `opacity: 0` that is still in the DOM is still
focusable and still read by a screen reader — pair it with `visibility: hidden`, which is exactly the
fix the boot splash needed.

**`will-change` is a scalpel, not a seasoning.** Add it immediately before the animation, remove it
after. A permanently `will-change: transform` element holds a compositor layer forever.

**A retained transform makes an element a containing block.** An `animation` with `forwards` holds its
final matrix — even `translateY(0)` — and that is enough to break `position: sticky` and
`position: fixed` inside it. If a view has an entrance animation, it must not retain its transform.
This is why `.view-enter` does not use `forwards`.

---

## 3. The recipe book

Use these exactly. Do not improvise.

### Press feedback — every button, card, dish tile, and row
```css
transition: transform 160ms cubic-bezier(0.16,1,0.3,1),
            background-color 160ms cubic-bezier(0.16,1,0.3,1);
/* :active */ transform: scale(0.97);
```
0.97 for buttons, 0.98 for cards. On a full-width row use 0.99 or a background tint instead —
scaling a wide element looks like it is warping.

### Bottom sheet (dish detail, cart)
```
enter: translateY(100% → 0) + backdrop opacity(0 → 1), 400ms decelerate
exit:  translateY(0 → 100%) + backdrop opacity(1 → 0), 300ms accelerate
```
Exit is faster than enter. Dismissal should feel eager; arrival considered.

### Modal (payment, staff form)
```
enter: scale(0.96 → 1) + opacity(0 → 1), 320ms decelerate
exit:  scale(1 → 0.98) + opacity(1 → 0), 160ms accelerate
```

### Dropdown / menu
```
enter: scale(0.96 → 1) + opacity(0 → 1), 160ms decelerate
       transform-origin: the anchor's edge
exit:  scale(1 → 0.98) + opacity(1 → 0), 120ms accelerate
```
**`transform-origin` must point at whatever opened it.** A menu that grows from its trigger is
causally legible; one that fades in from centre is not.

### Category chip / tab selection
```
icon:  scale(1 → 1.12 → 1) over 320ms with --transition-spring
label: colour transition 160ms
```
The overshoot is the point — it is the tactile "click".

### Dish card enter (menu paints)
```
opacity(0 → 1) + translateY(8px → 0), 320ms decelerate
stagger: 30ms per card, capped at 6 (180ms total)
```
Never stagger more than 6. Beyond that the last item feels broken rather than choreographed.

### Ticket enter / exit on the KDS
```
enter: opacity(0 → 1) + translateY(8px → 0), 320ms decelerate
exit:  opacity(1 → 0) + scale(1 → 0.96), 200ms accelerate, THEN collapse height 200ms
```
Fade first, then collapse. Collapsing while still visible looks like a rendering glitch.
**A new ticket may not animate for longer than it takes a cook to notice it.** Arrival is the whole
job of this screen; make it obvious and make it fast.

### A number updates (running total, order count)
```
opacity(1 → 0.4 → 1) 320ms, plus translateY(-2px → 0) on the new value
```
Enough to catch the eye, not enough to distract. Never more than once per 500ms.

### Toast
```
enter: translateY(16px → 0) + opacity(0 → 1) + scale(0.96 → 1), 320ms spring
hold:  4000ms — 9000ms if it carries an error the operator must read
exit:  opacity(1 → 0) + scale(1 → 0.98), 200ms accelerate
```
Pause the hold on hover or focus. **An error toast that names a refusal reason gets the long hold** —
the operator has to be able to read a sentence.

### Skeleton → content
```
skeleton: opacity(1 → 0) 200ms
content:  opacity(0 → 1) 200ms, starting 100ms in (overlap)
```
A crossfade, not a swap. **The skeleton must match the final layout's dimensions** or the content
jumps, which is worse than no skeleton at all.

---

## 4. Choreography

- **One focal point.** The eye follows one thing; everything else supports it.
- **Stagger, don't scatter.** Related items enter in reading order, 30–50ms apart. Unrelated items
  should not animate at all.
- **Nothing crosses paths.** Two elements animating through each other reads as chaos.
- **Exit before enter, or overlap by ≤50%.** Never a full gap of empty screen.
- **Chrome never animates on load.** The header, the sidebar, the bottom bar are the frame, not the
  content.

```
0ms    — chrome already there, no animation
0ms    — skeletons already present
100ms  — the primary surface fades up
150ms  — the row of chips or stats, staggered 30ms each
250ms  — content sections
```
Total under 400ms.

---

## 5. Reduced motion

`prefers-reduced-motion: reduce` is a **medical accessibility setting**. Users enable it because
motion causes nausea, dizziness, or seizures.

**"Reduced" means reduced, not removed.** Stripping all animation makes state changes confusing —
things teleport.

| Normal | Reduced |
|---|---|
| Slide + fade | Fade only |
| Scale + fade | Fade only |
| Spring overshoot | Linear-ish ease, no overshoot |
| Staggered entry | All at once, fade only |
| 320ms | 150ms or less |

Also honour `prefers-reduced-transparency` (collapse materials to opaque) and `prefers-contrast: more`
(raise separator opacity, add borders to controls).

---

## 6. Perceived performance

Motion is how you buy time. These matter more than actual milliseconds — and they matter most on the
storefront, where the guest is on cellular.

- **Respond within 100ms, always.** The press state renders before anything else, even if the action
  takes three seconds.
- **Optimistic UI.** Show the result immediately, reconcile when the server answers, roll back
  *visibly with an explanation* if it fails. This is the whole shape of this product's write path —
  and the rollback must be visible, or you have built a silent failure.
- **Skeletons over spinners.** A skeleton shaped like the content says "this is what's coming." A
  spinner says "wait." Spinners are for indeterminate *actions* (submitting), never for content.
- **Don't show a loader under 300ms.** A flash of spinner is worse than a brief pause.
- **Never move content under a finger.** Reserve space with `min-height` or `aspect-ratio` for
  anything that loads in. Layout shift after load is the most infuriating bug in mobile web and it is
  always preventable.
- **Progressive disclosure of loading.** 0–300ms: nothing. 300ms–3s: skeleton. 3s+: skeleton plus a
  specific line — "Still reaching the kitchen…". 10s+: offer a way out.

---

## 7. Motion review

- [ ] Only `transform` and `opacity` are animated
- [ ] Properties are named — no `transition: all`
- [ ] Entering decelerates, exiting accelerates
- [ ] Duration ≤400ms for anything interactive
- [ ] `transform-origin` points at the causal source
- [ ] Interruptible — tapping twice fast does not break it
- [ ] No retained transform on an ancestor of anything `sticky` or `fixed`
- [ ] `prefers-reduced-motion` variant implemented and tested
- [ ] No layout shift when it finishes
- [ ] Nothing loops infinitely unless it represents ongoing activity
