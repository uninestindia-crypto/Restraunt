# The Taste production launch guide

This repository builds two static web portals from the same codebase:

- `NEXT_PUBLIC_APP_PORTAL=customer` — public ordering storefront.
- `NEXT_PUBLIC_APP_PORTAL=pos` — authenticated staff POS, KDS, and administration.

Use separate hosting projects and domains for the two portals. Keep the staff domain behind an identity-aware access layer or an IP/device allowlist in addition to the application's Supabase authentication.

## 1. Required public environment

Set these in each web hosting project. They are safe client identifiers, not server secrets.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
NEXT_PUBLIC_APP_PORTAL=customer
```

Use `NEXT_PUBLIC_APP_PORTAL=pos` in the staff project. Never put the service-role key, staff passwords, AI provider keys, or OAuth client secrets in a `NEXT_PUBLIC_*` variable.

## 2. Supabase production deployment

Run from a trusted administrator workstation:

```powershell
npx supabase login
npx supabase link --project-ref PROJECT_REF
npx supabase db push
npx supabase functions deploy public-order
npx supabase functions deploy staff-admin
npx supabase functions deploy ai-chat
npx supabase functions deploy ingest-document
```

Set Edge Function secrets in the Supabase secret manager. Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to deployed functions; do not copy them into the frontend.

```powershell
npx supabase secrets set STORE_ID=the-taste GST_PERCENT=5 DELIVERY_FEE=0 ORDER_PREFIX=TT
npx supabase secrets set PUBLIC_ORDER_RATE_LIMIT_MAX=12 PUBLIC_ORDER_RATE_LIMIT_MINUTES=10 PUBLIC_ORDER_RATE_LIMIT_SALT=REPLACE_WITH_RANDOM_SECRET
```

Optional paid AI features require `GROQ_API_KEY` and/or `LIGHTNING_API_KEY` plus `LIGHTNING_ENDPOINT`. They remain Edge-only. If no provider is configured, core ordering and POS continue to work.

Create or repair the first cloud owner using `.env.admin.local` based on `.env.admin.example`, then run:

```powershell
npm run cloud:admin
```

Delete the local admin password from the workstation after provisioning or move it into an approved secret manager. Confirm the owner has an active `staff_memberships` row for `the-taste`.

## 3. Restaurant and provider configuration

Before accepting real orders, set and verify in the staff Settings screen:

- Restaurant name, address, support phone, email, hours, GST/FSSAI details as applicable.
- GST percentage, delivery fee, order prefix, currency, and receipt fields.
- A valid UPI VPA and payee name, followed by a real small-value payment test.
- Menu availability, prices, tax treatment, inventory recipes, tables, and printer width.
- Google Drive OAuth client ID only if backups are enabled. Restrict its authorized JavaScript origins to the exact staff HTTPS domain; no client secret belongs in the browser.

Guest checkout deliberately uses manual street-address entry. Device GPS coordinates stay in the order flow and are not sent from the browser to public Nominatim or a browser-exposed Google Geocoding key.

## 4. Release verification

Run the complete code and browser gate from a clean dependency install:

```powershell
npm ci
npx playwright install chromium firefox webkit
npm run launch:verify
git diff --check
```

`launch:verify` validates SQL parsing, TypeScript, unit/security tests, the full dependency audit, a hardened static production build, and the Playwright device/browser matrix.

Then deploy both hosting projects. Verify these response headers on the public domains: Content Security Policy, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, strict referrer policy, and the declared permissions policy. Confirm HTTPS redirects and certificate renewal.

## 5. Production smoke test

Use non-production test identities and a clearly marked test order:

1. Customer storefront loads on mobile and desktop without console errors or horizontal overflow.
2. Add/remove items, change quantities, and verify server-calculated totals and tax.
3. Delivery checkout rejects blank/invalid name, phone, and address.
4. Submit one cash test order and confirm it appears on KDS/POS with the same total.
5. Repeat the order submission to confirm idempotency prevents duplicates.
6. Confirm an unauthenticated visitor cannot open POS, KDS, Admin, staff, or analytics routes.
7. Confirm cashier/kitchen accounts cannot cancel an order or alter privileged settings.
8. Confirm manager/owner cancellation is audited and paid orders require refund first.
9. Verify UPI on a real device and reconcile the transaction manually before marking it paid.
10. Test printer output, offline recovery, reconnect synchronization, logout, session expiry, and a second device.
11. Verify database backups and restore a backup into a separate staging project.
12. Review Supabase Auth, Edge Function, database, and hosting logs for rejected requests and unexpected errors.

Do not run destructive smoke orders against live reporting without labelling and later reconciling them.

## 6. Android release

The release build refuses debug signing. Set all four signing variables, then run the builder:

```powershell
$env:THE_TASTE_KEYSTORE='C:\secure\the-taste-release.jks'
$env:THE_TASTE_KEYSTORE_PASSWORD='FROM_SECRET_MANAGER'
$env:THE_TASTE_KEY_ALIAS='the-taste'
$env:THE_TASTE_KEY_PASSWORD='FROM_SECRET_MANAGER'
.\build-apk.ps1
```

Signed artifacts and SHA-256 checksums are written under `artifacts/android/`. Store the keystore and recovery material offline; losing them prevents trusted upgrades. Perform an install/upgrade test on supported physical Android devices before distribution.

## 7. Go/no-go and rollback

Go live only when database migrations and all four Edge Functions are deployed, production domains and OAuth origins are verified, a real UPI test reconciles, backup restore succeeds, Android signing passes if distributing the APK, and `npm run launch:verify` is green against the final commit.

For a web rollback, redeploy the last known-good immutable hosting build. Database migrations are forward-only: take a backup before `db push` and use a reviewed corrective migration instead of deleting migration history or forcing schema rollback in production.

## Common launch questions

**Can the frontend contain the Supabase publishable key?** Yes. It identifies the project and is protected by grants and RLS; it is not a privileged secret. The service-role key must remain server-side.

**Can staff use a local PIN if the internet fails?** No. Production staff authorization requires a valid Supabase Auth session and active database membership. Cached data can support continuity, but cached browser flags never grant staff access.

**Does a UPI deep link prove payment?** No. It starts a payment app. Staff must verify settlement through the payment provider or bank before confirming paid status.

**Can public Nominatim power global autocomplete?** No. The public service disallows client-side autocomplete and is capacity-limited. Use a contracted provider behind an authenticated, rate-limited server boundary before enabling autocomplete.

**Are local passing tests enough to launch?** No. Local gates verify the artifact. Production Supabase deployment, domain/TLS headers, OAuth origins, payment reconciliation, backups, signing, and post-deploy smoke tests must also be verified in their real environments.
