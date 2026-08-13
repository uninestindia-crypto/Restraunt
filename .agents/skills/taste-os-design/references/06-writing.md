# Writing — the words are part of the design

Interface writing is the least-copied and most important part of a design language. It is plain,
direct, and respects the reader. It never sounds like a brand.

**The test:** read the string aloud. If it sounds like marketing, a lawyer, or a stack trace, rewrite
it.

---

## 1. Voice

| Do | Don't |
|---|---|
| "Add to order" | "Submit item to cart queue" |
| "Order placed — the kitchen has it" | "Transaction successful" |
| "Couldn't reach the kitchen. Your order is saved and will send when you're back online." | "Error 500: Request failed" |
| "No orders yet today" | "No data available" |
| "Paid ₹480 · 7:42 PM" | "PAYMENT_STATUS: COMPLETE" |
| "Saved on this device, but the cloud refused it: only developers can assign owner roles." | "Sync error" |

- **Sentence case everywhere.** Not Title Case, not ALL CAPS except a small eyebrow label.
- **Second person.** "Your order", not "My order".
- **Active voice.** "The kitchen has your order", not "Your order has been received".
- **Contractions.** "Couldn't", "you're", "we'll". Formal English reads as cold.
- **No exclamation marks.** One per product, maybe.
- **No jargon the user didn't bring.** Staff say: order, ticket, table, dish, add-on, cover, till,
  KOT, shift. They do not say: entity, payload, record, instance, sync conflict, RLS.
- **Numbers as numerals.** "3 items", not "three items".

---

## 2. Buttons

A label states **the outcome**, as a verb phrase. The user should read only the button and know what
happens.

| Good | Bad |
|---|---|
| Place order | Submit |
| Take payment | OK |
| Mark served | Continue |
| Add to order · ₹240 | Add |
| Cancel order #2041 | Delete |

- 1–4 words. More means the button is doing too much.
- Include the amount or the object when it removes ambiguity.
- Destructive buttons name the thing.
- The dialog-closing button is "Cancel". Always.

---

## 3. Titles and headings

- Screen titles are **nouns**: "Menu", "Orders", "Kitchen", "Staff & roles".
- Section headings are nouns too: "Today's takings", "Open tickets".
- Subtitles explain the screen's job in one lowercase line: "what the kitchen is working on now".
- No colons, no trailing punctuation on headings.

---

## 4. Errors

Three parts, in this order: **what happened → why (if useful) → what to do**.

```
Couldn't place your order.
The kitchen system didn't respond.
Try again   ·   Save for later
```

- Never "An error occurred" or "Something went wrong". Say what.
- **Never blame the user.** "Enter a 10-digit phone number" beats "Invalid input".
- Never expose a stack trace, a Postgres error code alone, or an internal table name. A reference
  code is fine *alongside* a human explanation.
- **Always offer the next action.** A dead-end error is a design failure.
- **Distinguish "you're offline" from "the server refused you"** — the user's action differs
  completely, and in this product the second usually means a role or a migration is wrong.
- **Say what was and was not saved.** "Saved on this device, but the cloud refused it — they can't
  sign in until this is resolved" is the shape. The operator must know the true state.

---

## 5. Empty states

| Flavour | Title | Body | Action |
|---|---|---|---|
| Nothing yet | "No orders yet today" | "They'll appear here as they come in." | — |
| No results | "No dishes match" | "Try another category or clear the search." | Clear filters |
| Error | "Couldn't load the menu" | "Check your connection and try again." | Retry |

Never a bare "No data". Never a joke — the user is trying to work or trying to eat.

---

## 6. Loading and progress

- "Loading…" is acceptable but weak. Say what: "Getting today's menu…", "Sending to the kitchen…".
- Over three seconds, say something specific and reassuring: "Still sending — your order is saved."
- Never a percentage you cannot compute honestly.

---

## 7. Numbers, currency, dates

India-first. Format through `Intl`, never by hand.

- **Currency** — `Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 })`
  → `₹1,90,000` with lakh grouping, not `₹190,000`. A hand-rolled thousands separator is a bug.
- **Dates** — "13 Aug 2026" absolute; relative for recent ("10 min ago", "2 hr ago"), switching to
  absolute past 7 days. Always include the year on anything financial.
- **Times** — 12-hour with uppercase meridiem: "7:42 PM". Be consistent.
- **The service day is not the calendar day.** An order at 00:30 belongs to the previous evening's
  service. Say which one you mean whenever it could be either.
- **Percentages** — no decimal unless the precision is meaningful.
- **Ranges** — en dash, no spaces: "15–20 min".
- **Tabular numerals** on anything in a column or that updates in place.

---

## 8. Labels and metadata

- Field labels are short nouns: "Table", "Phone number", "Special instructions".
- Don't repeat the section title in every row.
- Timestamps are metadata — small, secondary, trailing, never emphasised.
- **Truncate descriptions, never identifiers.** A cut-off order number or staff name is a bug.

---

## 9. Status words

One word per state, used identically everywhere. Inconsistent status vocabulary is how a cook and a
cashier end up believing different things about the same order.

| State | The word | Never |
|---|---|---|
| Placed, not started | **New** | Pending, Queued, Received |
| Being cooked | **Preparing** | In progress, Cooking, WIP |
| Ready to hand over | **Ready** | Done, Complete |
| Given to the guest | **Served** | Delivered, Closed |
| Money taken | **Paid** | Settled, Completed |
| Stopped before serving | **Cancelled** | Deleted, Voided, Removed |

**"Deleted" is never used for an order.** Order history is not deletable by design — the word implies
something the system will not do, and printing it when the row is still there is how "it says deleted
but nothing happens" happens.

---

## 10. AI copy

- Prefix suggestions with the source: "Suggested: prep 12 portions of momos for tonight."
- State confidence when a model extracted something: "Read 8 fields with 94% confidence — check
  before saving."
- Justifications are plain language, not scores.
- Never present a model output as certain fact. "likely", "suggests", "may".
- Never anthropomorphise beyond the product name.

---

## 11. Multilingual

- English chrome, but dish names and guest-entered text appear as written, wrapped in the correct
  `lang` attribute.
- Never machine-translate a price, a dish name, or a legal line.
- Design for +40% string length; never truncate a translated label.
