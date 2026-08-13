# 05 — Hardening: The Twelve Attack Families

This is the Red Team's ammunition and the P5 work list. Work it **systematically**, family by
family. Free-associating about what might break produces the failures you already imagined; the
catalog produces the ones you did not.

Every probe below is written against *this* product. Where a family has a known past finding in this
repository, it is named — those are the probes most likely to find a sibling defect.

**Record findings as:**

```
FINDING  <one line>
FAMILY   <which of the twelve>
REPRO    <exact, copy-pasteable input or sequence>
OBSERVED <what actually happened — the wrong behavior>
EXPECTED <what should have happened>
BLAST    <who is affected, how badly, how many>
SEVERITY Blocker | Major | Minor
```

**Severity rubric — apply it strictly, it is what makes the gate meaningful:**

| Severity | Definition |
|---|---|
| **Blocker** | Lost or duplicated order, wrong money, data visible across stores, security bypass, silent corruption, unrecoverable state, or a money path broken. **Blocks the gate. Always.** |
| **Major** | A real user hits it on a plausible path; workaround is painful; recovery requires the owner. Must be fixed or founder-accepted in writing. |
| **Minor** | Cosmetic, rare, or self-recovering with an obvious workaround. |

**The tie-breaker:** if a failure is *silent* — a wrong total with no error, a push that vanishes, a
toast that says success while the server refused — **escalate it one level.** Loud failures get
reported by staff. Silent ones get discovered by the owner reconciling the till a week later.

---

## Family 1 — Input boundaries

*The value is technically valid and completely unreasonable.*

For every field the storefront, POS, and admin screens accept:

- Empty string; whitespace only; a single space
- `null`, `undefined`, missing key, key present with no value
- Zero; negative; the maximum for the type; `NaN`; `Infinity`
- Quantity of `0`, `-1`, `999999`; a price of `0`; a 100% discount; a discount over 100%
- A number where a string is expected and the reverse — `"007"`, `"1e5"`, `"0x10"`
- 10,000 characters in a dish name; 10MB in a note field
- Unicode: emoji in a customer name, RTL text, combining accents, zero-width characters
- Leading/trailing whitespace in a phone number or email that should be trimmed and is not
- Boolean-ish strings: `"false"`, `"0"`, `""` — all truthy in JavaScript
- A dish note of 5,000 characters arriving at the kitchen screen and at the printer
- An order with 500 line items

**The question:** is it rejected clearly at the boundary, or does it travel inward and land in
`orders.items`, on a receipt, or in a Postgres column that silently truncates?

---

## Family 2 — Identity, authorization, and tenancy

*The most damaging family. Assume every user is trying to see another store's data.*

- Every staff route, unauthenticated: navigate directly to `#/staff`, `#/admin`, `#/analytics`
- **Every one of the eight roles × every screen × every action.** Build the matrix, test the matrix:
  `developer, owner, manager, cashier, kitchen, waiter, delivery, temporary_staff`
- Another store's rows by direct `store_id`, then by ID in a filter, then in an export
- **Cross-store write**, tested separately from read
- Enumerate order IDs and order numbers; harvest UUIDs from URLs and error messages
- Expired token; revoked token; token for a deactivated staff member; a member whose role was
  downgraded a second ago but whose tab is still open
- Privilege escalation: can a cashier assign themselves `owner`? Can a manager create a developer?
  Can anyone bypass the "last active owner" guard?
- **Permission by UI**: every screen the sidebar hides — call the underlying Supabase table
  directly with that role's session and confirm RLS, not the sidebar, refuses it
- Indirect leaks: a count that includes invisible orders, a search matching a hidden field, an error
  message that reveals existence, an analytics total that aggregates rows the role cannot list
- The Edge Function called directly with a non-owner token

**Known past finding in this family:** the `staff` table has no insert/update grant for
`authenticated` at all — only the `staff-admin` Edge Function may write it. Any code path that tries
a direct staff write is permanently refused and will queue forever. Probe for new ones.

**The question:** is the check on the *server*, on *every* path to the data, including the paths
nobody remembered?

---

## Family 3 — Concurrency and ordering

*Two things happen at the same time. The universe does not respect your assumptions.*

- The same order submitted twice, simultaneously — double-tap "Place order" on a slow connection
- Two cashiers editing the same open table order
- Two devices advancing the same kitchen ticket at the same moment
- **Check-then-act on stock**: two sales of the last portion, concurrently → negative stock
- **Order-number allocation**: two devices calling `getNextOrderNumber()` in the same second
- A queued offline push arriving *after* the order was cancelled on another device
- Hydration (`ensureFresh`) landing while a local write is still queued
- The realtime echo of a write racing the local read-back of that same write
- A retry arriving after the original succeeded
- A migration running while devices are serving traffic

**Known past findings in this family**, all real, all shipped fixes — probe for regressions:
order-number unique-violation aborting checkout; a stale push resurrecting a cancelled order;
hydration overwriting a queued local edit; `updatePayment` reverting itself via its own read-back.

**The question:** for every mutating path, what happens when it is called twice at once? "We don't
know" on a money path is a Blocker.

---

## Family 4 — Failure injection

*Supabase will be down, slow, or lying. Usually during dinner service.*

- Supabase unreachable: DNS failure, connection refused, TLS failure
- Supabase slow: a 30-second response on the checkout path
- 401 (expired session mid-shift), 403, 429, 500, an HTML error page instead of JSON
- **RLS denial** on a write the UI believed was allowed — does the operator learn, or does it queue
  silently forever?
- `PGRST205` / `42P01`: the table does not exist because the migration was never applied
- Realtime channel dropped and never resubscribed — does the KDS go quietly stale?
- Storage refuses an image upload — does the photo stay device-local and silently diverge?
- Network lost mid-checkout, mid-upload, mid-payment
- The browser tab backgrounded for two hours, then resumed
- IndexedDB unavailable (private mode, quota exceeded, corrupted)
- localStorage full or blocked
- The clock wrong on one device by an hour

**The question, for each:** does it fail **safely** (no half-committed order), **visibly** (the
operator sees something true), and **recoverably** (it retries and reconciles)? All three, or it is a
finding.

---

## Family 5 — State machine and lifecycle

*The order goes through states. Try every illegal transition.*

- Every transition not in the diagram: cancel a completed order, pay a cancelled order, refund
  twice, serve a cancelled ticket, re-open a closed order
- Skip a step: go from placed straight to served by URL or by direct table write
- Repeat a terminal step: submit twice, pay twice, mark served twice
- Act on a deleted parent: add an item to a deleted order; a dish deleted mid-order; a table deleted
  while an order sits on it
- Long-lived flows: a cart open for eight hours then submitted; a price that changed between "add to
  cart" and "pay"; a menu item that went unavailable mid-checkout
- Orphans: an order referencing a deleted dish; a shift referencing a deleted staff member
- Two actors transitioning at once (Family 3)

**The question:** is the state machine enforced in the *data layer* —
`trg_enforce_order_status_transition` and `trg_prevent_delete_orders` — or only by the UI not showing
the button? The trigger is the answer; anything the UI enforces alone is a finding.

---

## Family 6 — Scale and volume

*It works with a demo menu. A year of service is 50,000 orders.*

- Order history with 50,000 rows: does it paginate, or load them all into memory?
- A day with 800 orders on the analytics screen
- The KDS with 200 open tickets
- A menu with 500 dishes and 500 images on a phone over cellular
- `getTodayStats()` over a full year of data — is it a scan?
- The Dexie cache after a year: how large, and does it still open quickly?
- A single customer with 2,000 orders
- N+1 patterns: count the Supabase round trips per screen, do not eyeball it
- The static export size, and the menu snapshot at 500 dishes
- A migration on a production-scale `orders` table — timed, with the lock duration measured

**The question:** what is the actual production volume, and has this been run at that volume?

---

## Family 7 — Money, counting, and correctness

*Wrong numbers are worse than crashes. A crash gets noticed.*

- **Floating-point money anywhere → Blocker**, no discussion. Grep for it.
- **Arithmetic on `string | number`** — `"12" + 1` is `"121"`. Any place a total is built from a
  field that TypeScript types as `string | number` is a finding until proven otherwise.
- Rounding applied once, not compounded per line item
- Sum of the parts vs. the whole: line items vs. order total; split payments vs. the bill
- Tax, discount, and service-charge **ordering** — different orders give different totals; which is
  correct is a product decision that must be written down
- Negative quantities, zero-value orders, 100% discounts, change greater than the tender
- Idempotency on every payment write
- Recompute the day's takings from the order rows and compare to the reported total — write that
  recomputation as a test
- Counters: a stock level that disagrees with the recipe deductions that produced it
- Currency formatting: `Intl.NumberFormat('en-IN')` everywhere, lakh grouping, never a hand-rolled
  thousands separator

**The question:** if the owner recomputed the day from the raw order rows, would they get the same
number the dashboard showed?

---

## Family 8 — Data integrity and durability

*What survives, and what silently doesn't.*

- Unicode round-trip: dish name → Dexie → Supabase → receipt → printer → CSV export
- Truncation: `menu_items.image_url` is `varchar(500)` — a data URL silently blows it up. Which
  other columns have a length the client does not know about?
- Timezone: an order placed at 00:30 — which day's takings does it land in, on the device, in
  Postgres, and on the report?
- Soft delete: does a deleted dish still appear in a count, an old order, an export, an analytics
  total?
- Cascade: deleting a category — what happens to its dishes, and was that intended?
- **The Dexie schema version bump**: old tab open on v9 while a new tab upgrades to v10
- Backup and restore: take a Supabase backup, restore to a different project, verify the orders
- Migration data loss: does it drop a column that still has meaning?
- Audit trail: is `activity_log` actually written on every path, and can every role write it?

---

## Family 9 — Security surface

Run `/security-review` in addition to this list.

- Injection: SQL through any raw query, and the PostgREST filter parameters
- **XSS**: every place the app builds HTML from data. This codebase composes views as HTML strings,
  so *every interpolation of user or menu data must go through `escapeHtml`*. Grep the diff for
  `innerHTML` and check each interpolation individually — this is the single highest-yield probe in
  this repository.
- `safeImageUrl` / `menuItemImageSource`: an `imageData` of `javascript:`, `data:text/html`, or
  `data:image/svg+xml` must not reach an `src`
- SSRF: any URL the app fetches on a user's behalf
- Secrets: in the client bundle, in logs, in error toasts, in git history. The anon key is public by
  design; the service-role key must never appear in `src/`.
- Dependencies: `npm audit` clean, no install scripts from unknown packages
- Transport: HTTPS, CSP, `X-Frame-Options`, cookie flags — `harden-static-export.js` is the
  enforcement point; verify its output, do not assume it
- Rate limiting on the public order endpoint
- Uploads: content type verified, served from Storage, never executable

---

## Family 10 — The human path

*What a real person does that no test suite does.*

- Double-tap every button that submits — especially "Place order" and "Pay"
- Back, forward, and refresh at every step of checkout
- Open the storefront in two tabs and order in both
- Lock the phone mid-checkout, come back in ten minutes
- Paste a phone number with spaces and a `+`; paste a name from WhatsApp with smart quotes
- Deny the notification permission and continue
- Private browsing (IndexedDB behaves differently); an ad blocker; third-party cookies blocked
- Slow 3G; a network that drops for ten seconds mid-order
- 200% browser zoom; a 320px screen; a screen reader; one hand on a 6.7" phone
- Do the steps in the wrong order on purpose
- Give up halfway and start over — is the partial cart cleaned up, or does it block the retry?
- **The cashier's real environment**: greasy fingers, a glove, a cracked screen, sunlight

---

## Family 11 — Operability

*Can the owner understand and fix this at 9pm without the person who built it?*

- Every error a user can see: does it say what happened **and what to do next**? "An error
  occurred" is a finding. So is a toast that names a Postgres error code and nothing else.
- Every error the system logs: enough context to identify the device, the staff member, and the
  order — without leaking personal data
- **Can the owner tell whether a write is stuck?** `lastSyncError` and the pending-photo banner
  exist for this. Is every queued write surfaced somewhere a human looks?
- Is there a way to answer "did this specific order reach the kitchen?" without a database console?
- Alerts for *silent* failures: the push queue stops draining, the realtime channel stays down, a
  day with zero orders during opening hours
- Can you tell the difference between "no orders" and "the storefront is broken"?
- Runbook: could the owner execute the rollback?

---

## Family 12 — Assumption archaeology

*The findings nobody else gets, because they require reading what the author believed.*

Go through the diff and list every place someone assumed something. Then attack the assumption:

- Every `@ts-nocheck` → **what is it hiding?** Strip it and read the errors. In this repository that
  single probe has surfaced a wrong-arity call, arithmetic on `string | number` in the analytics
  path, and an undeclared build-time global.
- Every comment that says "should never happen" → make it happen
- Every `catch {}` that swallows → what error is it hiding, and what happens afterwards?
- Every `?.` and `|| ''` chain covering a value that should always exist → what if it doesn't?
- Every default value → what if the real value is legitimately different?
- Every "this list will be small" → make it 10,000
- Every "this only runs once" → run it twice
- Every "the client always sends X" → do not send X
- Every hardcoded constant, limit, or timeout → what happens at the limit, and who chose it?
- Every ordering assumption → reverse it
- Every place a test was skipped, mocked out, or marked TODO → why, and what is it hiding?

**This family finds the bugs no checklist can, because it targets what this specific author
believed.** It is the highest-yield family on this codebase.

---

## The hardening report

At the end of P5, produce:

```
HARDENING REPORT — <scope>

COVERAGE      families run: 12/12 | probes: <n> | targets: <list>
BLOCKERS      <n> — each with repro, blast radius, and fix status
MAJORS        <n> — each with disposition (fixed + test | founder-accepted)
MINORS        <n> — logged
NOT PROBED    what you could not test and why  ← mandatory, and the most important section
RE-RUN        raw output of the full suite AFTER all fixes were applied
```

**`NOT PROBED` is mandatory.** A report that implies full coverage while quietly omitting "we could
not test the printer because there is no hardware here" is worse than no report — it converts a known
unknown into an unknown unknown, and unknown unknowns are what take products down.
