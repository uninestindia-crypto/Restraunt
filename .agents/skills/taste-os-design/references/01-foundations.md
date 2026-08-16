# Foundations — grid, type, colour, shape, depth

Everything visual resolves to one of five systems. Learn these and most design decisions stop being
decisions.

---

## 1. The grid

An **8pt rhythm on a 4pt base**. Every gap, padding, and offset is a multiple of 4. The tokens exist;
use them, not raw pixels.

| Token | px | Use |
|---|---:|---|
| `--space-1` | 4 | Icon-to-label in a dense chip; optical nudges |
| `--space-2` | 8 | Inside a control; label to value |
| `--space-3` | 12 | Between sibling cards; list row vertical padding |
| `--space-4` | 16 | Card padding; screen edge margin on a phone |
| `--space-5` | 20 | Generous card padding |
| `--space-6` | 24 | Section gap; screen edge margin on a tablet |
| `--space-8` | 32 | Major section break; desktop screen margin |
| `--space-10` | 40 | Above a page's first section |
| `--space-12` | 48 | Between unrelated regions |
| `--space-16` | 64 | Empty-state breathing room |

**Screen margins** — 16px (phone) → 24px (tablet) → 32px (desktop).

**Readable measure** — body paragraphs cap around 60–75 characters. A dish description that runs the
full width of a tablet is unreadable; constrain it.

**Vertical rhythm** — the space *above* a heading is always larger than the space below it. That
asymmetry is what makes a long menu scannable.

**The POS exception.** The till is a dense instrument, not a document. It steps down one level:
`--space-3` where the storefront uses `--space-4`. It does not step below `--space-2` anywhere a
finger lands.

---

## 2. Typography

### 2.1 The stack

```css
--font-sans:    'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--font-display: 'Plus Jakarta Sans', -apple-system, …;
```

`-apple-system` resolves to real SF on Apple devices; Inter is the fallback whose metrics are the
closest match, so the layout does not reflow across platforms.

**Numerals.** Anything that sits in a column or updates in place — a price, a total, a quantity, an
order number, a timer — gets `font-variant-numeric: tabular-nums`. Proportional numerals in a price
column jitter, and jitter reads as amateur instantly.

```css
.tabular { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1; }
```

### 2.2 The scale

| Token | rem | px | Use |
|---|---|---:|---|
| `--text-xs` | 0.75 | 12 | Badges, field labels, metadata |
| `--text-sm` | 0.8125 | 13 | Dense row subtitles, helper text |
| `--text-base` | 0.9375 | 15 | Body, field values, list rows |
| `--text-lg` | 1.125 | 18 | Card titles, modal titles |
| `--text-xl` | 1.25 | 20 | Section headings |
| `--text-2xl` | 1.5 | 24 | Screen titles |
| `--text-3xl` | 1.875 | 30 | Hero numerals — a day's takings, an order total |

**Rules.**
- **Minimum size anywhere is 11px**, including legal text. Below that nobody reads it, so it is
  decoration pretending to be information — delete it or make it legible.
- Weight may be raised one step for emphasis, never lowered below `--font-normal`.
- Uppercase only on `--text-xs` eyebrow labels, always with positive letter-spacing. Uppercasing
  anything larger is a 2014 dashboard tell.
- **Never more than three distinct styles in one card.** Four means the card is doing too much.
- Never set a root font size in `px`. The scale is in `rem` so browser zoom and OS text settings
  scale it. `user-scalable=no` is banned. Layouts survive 200% text scaling — use `min-height`, not
  `height`, and let meaningful strings wrap rather than truncate.

**Truncate descriptions, never identifiers.** A cut-off dish description is fine. A cut-off order
number, table number, or staff name is a bug.

---

## 3. Colour

### 3.1 Two themes, one structure

The staff console is the `:root` in `src/styles/variables.css`. The storefront overrides a small set
of tokens in `src/styles/storefront.css` and inherits the rest.

**Never reach past a semantic token to a raw hex in a component.**

### 3.2 Staff console — obsidian

| Token | Value | Use |
|---|---|---|
| `--bg-primary` | `#040406` | The page behind everything |
| `--bg-surface` | `#0B0B0F` | Cards, list containers |
| `--bg-secondary` | `#0E0E14` | Modals, dialog cards — one step forward |
| `--bg-card` | `rgba(255,255,255,.02)` | Thin card backdrop over a surface |
| `--border-color` | `rgba(255,255,255,.04)` | Hairline |
| `--border-active` | `rgba(255,255,255,.12)` | Focused or selected edge |
| `--text-primary` | `#F9FAFB` | Primary text, values, headings |
| `--text-secondary` | `#94A3B8` | Subtitles, descriptions |
| `--text-muted` | `#7C8899` | Metadata. **Do not darken** — this is ~5.4:1 and was already raised once from a failing value. |

**Dark mode is not an inversion.** Surfaces get *lighter* as they come toward the user
(`#040406` → `#0B0B0F` → `#0E0E14`), which is the opposite of light mode's shadow-based depth.

### 3.3 Storefront — street-food night

| Token | Value | Use |
|---|---|---|
| `--store-soft` | `#14100e` | The page — near-black with a red-brown bias, never neutral grey |
| `--store-panel` | `#1d1815` | Cards, one step off the ground |
| `--store-accent-surface` | `#2b1713` | The tint behind a live control |
| `--store-line` | `rgba(247,239,230,.13)` | Hairline |
| `--store-ink` | `#f7efe6` | Body — warm off-white, cream rather than clinical white |
| `--store-muted` | `#a2938a` | Secondary — warm grey biased toward the cream |
| `--store-accent` | `#e03a21` | Chilli — **fills, rules and boundaries. Never small text.** |
| `--store-accent-fill` | `#c92e18` | Chilli **as a fill behind cream text** — the primary button |
| `--store-accent-ink` | `#ff7a5c` | Chilli **as small text on `--store-accent-surface`** |
| `--store-gold` | `#f2a93b` | Wok flame — eyebrows, prices, small accent text |
| `--store-green` | `#4fbf8f` | Success only. Not a heading colour. |

**Why the accent is three tokens.** `#e03a21` is 4.3:1 on the ground: enough for a rule or a fill,
not enough for a label. `#c92e18` takes it one step down so cream on it measures 4.74:1 — and a
~15px bold button label needs the full 4.5:1, because WCAG large text does not start until 18.66px
bold. `#ff7a5c` takes it the other way for small text on the accent tint. A brand colour is not one
colour: it is one colour *per background it lands on, at the size it lands there*.

**Hover darkens.** On a dark ground the instinct is to brighten a fill on hover; doing that here
pushed cream on the button to 3.17:1. `--color-primary-hover` is `#b52814` — deeper, 5.63:1.

**The storefront does not follow the viewer's theme.** It is a single committed look, so it paints
its own background and every colour explicitly. A page that leaves `body` transparent borrows the
host's ground and renders one theme's text on the other theme's surface.

**What this replaced, and why it matters beyond colour.** The storefront was warm cream `#fdf7f0`
with a terracotta `#bb4726` accent, a pill badge above the headline, and rounded cards each with a
tinted rounded icon square on the left. Every one of those is a default that generated interfaces
reach for, and together they read as a template rather than as this restaurant. The lesson is not
"dark is better" — it is that a palette and a set of component shapes are an identity, and an
identity assembled from defaults belongs to nobody. When you reach for a pill badge, a tinted icon
tile, or a 16px radius on everything, ask whether the subject asked for it.

### 3.4 Brand orange, and the same lesson in the dark theme

| Token | Value | Use |
|---|---|---|
| `--color-primary` | `#FF5E36` | The brand. Fills, glows, decorative marks. |
| `--color-primary-on-surface` | `#FF8960` | Brand **as text** on a dark surface |
| `--color-primary-fill` | `#C4401F` | Brand **as a fill behind white text** — `#FF5E36` gives white only 3.04:1 |

Three tokens for one brand colour, because a colour used as a fill, as text on dark, and as text on
light has three different jobs and three different contrast requirements.

### 3.5 Status

| Token | Value | Meaning |
|---|---|---|
| `--color-success` | `#10B981` | Paid, served, verified, in stock |
| `--color-warning` | `#F59E0B` | Preparing, low stock, pending sync |
| `--color-danger` | `#EF4444` | Failed, cancelled, out of stock, destructive |
| `--color-info` | `#3B82F6` | Neutral informational |
| `--nextgenos-purple` | `#8B5CF6` | Platform/developer surfaces only |

**Rules.**
- **Status is never colour alone** (Law 4). Colour + word + glyph.
- **Tint, don't fill.** A status badge is a 10% tint with the tone as text, not a saturated solid.
  Solid fills are for the single primary action and for genuinely critical alerts.
- **One accent per screen.** If three things are orange and prominent, none of them are primary.
- Saturated colours are desaturated and brightened for the dark theme, or they vibrate against
  obsidian.

---

## 4. Shape

| Token | px | Use |
|---|---:|---|
| `--radius-sm` | 8 | Badges, tags, inner elements inside a padded card |
| `--radius-md` | 12 | Buttons, inputs, icon tiles |
| `--radius-lg` | 20 | **The standard card** |
| `--radius-xl` | 32 | Hero cards, sheets, bottom-sheet top corners |
| `--radius-full` | 9999 | Pills, avatars, FABs, segmented controls |

**Concentricity (Law 7).** `inner = outer − padding`. A `--radius-lg` (20) card with `--space-3` (12)
padding holds a `--radius-sm` (8) child. Below 4, use a square inner element — a 3px radius reads as a
rendering artifact.

**Shape conveys affordance. Don't mix.**
- **Pill** — filters, chips, toggles, status. Reads as "selectable, ephemeral".
- **Rounded rect** — buttons and inputs. Reads as "committed action".
- **Card** — a container of related content. Reads as "an object".
- **Circle** — identity (avatar) or a single-purpose control.

A pill-shaped submit button next to a rounded-rect one is visual noise.

---

## 5. Depth

### 5.1 The ladder

| Token | Use |
|---|---|
| `--shadow-sm` | Resting card |
| `--shadow-md` | Raised or hovered card, sticky bar |
| `--shadow-lg` | Popover, dropdown |
| `--shadow-xl` | Sheet |
| `--shadow-modal` | Modal |

Each is two or three layers: a tight one for the contact edge, a wide one for ambient falloff, and a
1px hairline ring. That construction is what makes it read as light rather than as a grey rectangle.

**In the dark theme shadows barely work.** Depth comes from surface lightness instead. Keep the
hairline ring — `0 0 0 1px rgba(255,255,255,.04)` — which is what actually separates a card from the
obsidian behind it.

### 5.2 Materials

`--glass-bg` + `--glass-backdrop-filter: blur(28px) saturate(220%)`. The saturation boost is what
makes translucency look alive rather than like a grey wash.

**Rules.**
- **Material is for chrome only** — headers, the bottom bar, sheets. Never put content on a material;
  put content on a surface.
- **Material never stacks on material.** One layer of translucency per stacking context.
- Always provide the opaque fallback under `@supports not (backdrop-filter: blur(1px))`.
- Under `prefers-reduced-transparency: reduce`, collapse every material to its opaque equivalent.
- **Text on a material needs its contrast checked against the worst content that can scroll behind
  it.** If you cannot guarantee it, make the surface opaque. This is exactly how the storefront's
  bottom-nav label ended up at 4.45:1 — a 10% tint over a blurred bar composites differently
  depending on what is underneath.

### 5.3 The containing-block traps

Two CSS properties silently break `position: fixed` and `position: sticky` by making an ancestor a
containing block. Both have bitten this codebase:

- **`overflow: clip`** (unlike `hidden`) creates a containing block for fixed descendants. It is why
  the storefront's bottom navigation once sank to the foot of the page.
- **A retained animation transform.** An `animation` with `forwards` holds the final matrix — even an
  identity matrix — and that is enough. It is why a sticky toolbar refused to stick.

Before adding either, check what is `fixed` or `sticky` inside.

---

## 6. Iconography

- **One family: Material Symbols Rounded**, subset to the icons this app uses and served locally.
  Adding a new icon name means regenerating the subset — otherwise it renders as the literal
  ligature text.
- **Stroke weight scales with text.** Beside `--text-base` (15px), icons are 18–20px. The icon should
  read at the same ink density as the text next to it.
- **Optical alignment** — centre on the text's cap height, not its bounding box.
- **Filled is for selected, outline for unselected.** That is the only permitted mix.
- **Never an icon-only control without an accessible name.** `aria-label` on every one.
- **No emoji as UI icons.** They render differently on every platform and cannot be recoloured.

---

## 7. Layout archetypes

Name the one you are using before writing markup.

1. **Menu browse** — sticky category toolbar over a scrolling grid of dish cards. The storefront's
   main screen.
2. **Detail sheet** — a bottom sheet with the dish photo, description, add-ons, and a pinned action.
3. **Cart / checkout** — a scrolling list with an opaque pinned footer carrying the total and the
   commit action. Single column below 560px.
4. **Till** — a three-pane instrument: categories, item grid, cart. Collapses to a tabbed two-pane on
   a small screen. Never becomes a scrolling document.
5. **Ticket board** — the KDS. A grid of equal-weight cards, each with a status rail, readable across
   a room, ordered oldest-first.
6. **Admin list** — a header bar, a tab row, a scrolling list of rows with a trailing action.
7. **Form modal** — a single card of labelled fields with a sticky action pair at the bottom.

**Responsive rule.** The storefront is designed phone-first; the desktop layout is the phone layout
with wider columns, never a different information architecture. The till is the opposite: designed
for a fixed counter screen, and its small-screen form is a deliberate reduction, not a reflow.
