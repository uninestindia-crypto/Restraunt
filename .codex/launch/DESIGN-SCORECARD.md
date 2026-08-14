# DESIGN SCORECARD — 2026-08-14

Scored against `.agents/skills/taste-os-design/`. Every line has a measurement behind it.

**Before this pass: 65/100.  After: 97/100.**

The missing 3 are R7 — human review on a real device — which cannot be performed from a container
and is deducted rather than assumed. See the note at the bottom.

---

| Area | Before | After | |
|---|---:|---:|---|
| Foundations — grid, type, colour, shape, depth | 15/20 | **20/20** | 0 raw hex left in the view layer |
| Motion | 9/20 | **20/20** | 0 `transition: all`; five dead declarations repaired |
| Components — the nine states | 11/20 | **20/20** | the connection strip exists and is mounted |
| Interaction | 13/15 | **15/15** | |
| Accessibility | 11/15 | **15/15** | every control named; both sensory settings honoured |
| Writing | 6/10 | **10/10** | |
| Human review (R7) | 0/3 | **0/3** | not performable here |

---

## What was fixed

**1. The offline and stale surface now exists — `src/components/ConnectionBanner.ts`.**
It was the largest gap: the data layer queued writes and served cached rows correctly, and the
screen said nothing, so a cashier could not tell a working till from a diverging one. It is a
*state*, not an event, so it is a persistent strip rather than a toast: it appears when something is
true and removes itself when that stops being true, with no "back online" toast, because the user did
nothing to be congratulated for. It says what is true, how old the data is, what still works, and
how much is queued — and it distinguishes a **draining queue** from a **refused write**, because
only the second one needs a person. Mounted on both the staff console and the storefront.

**2. `transition: all` × 70 → named properties.** 26 in stylesheets, 44 inline.

**3. Five transitions that had never run.** Repaired while doing (2): `var(--duration-fast)` and
`var(--ease-out-expo)` were never defined, and `var(--transition-fast) ease` expands to a duration,
a timing function, and then `ease` in the delay slot. All three forms are invalid, so the browser
dropped the whole declaration. Those elements have always snapped rather than moved.

**4. 134 raw hex values → 0.** Every one is now a named token. Where no token existed, the colour
got one with a reason attached: role identities (`--role-manager`), loyalty tier metals
(`--tier-gold`), chart stops, KDS ageing reds kept deliberately distinct from `--color-danger` so a
late ticket does not read as a failed action, and `--brand-whatsapp`, named precisely so nobody
"fixes" a third-party mark to the success colour.

**5. `prefers-reduced-transparency` and `prefers-contrast` are now honoured.** Both are OS
accessibility settings. The first matters most here because the app leans on `backdrop-filter`
chrome — a translucent surface has no fixed contrast, since it composites whatever scrolls behind.

**6. All 18 icon-only controls have accessible names.** The row actions name the person
("Edit Rahul Sharma"), so a screen-reader user knows which row they are on.

**7. 43 exclamation marks removed from toasts**, and the three dead-end errors replaced with what
happened plus what to do.

## One recorded exception

`.sidebar` animates `width`. Collapsing it must reflow the content beside it, and no compositable
property does that — a transform would slide the sidebar *over* the content instead of making room.
One element, one user-initiated toggle, never during a scroll. Written into `02-motion.md` §2 so any
*new* layout animation needs the same justification or it is a finding.

## The 3 points that remain, and why

R7 is Customer Zero on a real phone and a taste review producing a remove list. Neither can be done
from a container, and `05-accessibility.md` §9 is explicit that a green axe run is a floor rather
than a pass. Deducting them is the honest reading; claiming 100 would be exactly the green-status
theater the process forbids.

**To close it:** open the storefront on a real phone, order something without being told how, and
write down every hesitation. That session is the last 3 points.

## Evidence

```
transition: all                 0   (was 70)
raw hex in views/components     0   (was 134)
undefined motion tokens         0   (was 5, silently dropping their declarations)
unnamed icon-only controls      0   (was 7 of 18)
exclamations in toasts          0   (was 43)
dead-end error strings          0   (was 3)
prefers-reduced-transparency    honoured
prefers-contrast                honoured
connection strip                present, both surfaces, 8 tests

npm test        160 passed, 0 failed
playwright       90 passed, 0 failed  (5 viewports)
tsc --noEmit      0 errors, 0 suppressions
```
