import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { escapeHtml } from '../src/utils/helpers';

const read = (path: string) => readFileSync(path, 'utf8');

test('escapeHtml neutralizes tag and attribute payloads', () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
  );
});

test('public order edge function uses secret-bound idempotency and atomic throttling', () => {
  const source = read('supabase/functions/public-order/index.ts');
  assert.match(source, /\.eq\("idempotency_key", idempotencyKey\)/);
  assert.match(source, /rpc\("consume_public_order_attempt"/);
  assert.doesNotMatch(source, /from\("public_order_rate_limits"\)\s*\.select/);
});

test('staff administration endpoint has no unauthenticated PIN-login bypass', () => {
  const source = read('supabase/functions/staff-admin/index.ts');
  assert.doesNotMatch(source, /login-by-pin/);
  assert.match(source, /requireOwner/);
});

test('security migration restricts storage and privileged RPC execution', () => {
  const migration = read('supabase/migrations/202606300900_security_scan_remediation.sql');
  assert.match(migration, /staff_memberships/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.emulate_stripe_webhook/);
  assert.match(migration, /pg_advisory_xact_lock/);
});

test('production migration remediation removes legacy authorization bypasses', () => {
  const base = read('supabase/migrations/20260628000000_initial_schema.sql');
  const remediation = read('supabase/migrations/20260727160620_launch_advisor_remediation.sql');

  assert.match(base, /operator\(public\.<=>\)/);
  assert.match(base, /set search_path = ''/);
  assert.match(remediation, /alter extension vector set schema extensions/);
  assert.match(remediation, /operator\(extensions\.<=>\)/);
  assert.match(remediation, /drop policy if exists "authenticated staff full access orders"/);
  assert.match(remediation, /drop policy if exists "Allow public read access to menu images"/);
  assert.match(remediation, /revoke all on function public\.audit_order_changes\(\) from public, anon, authenticated/);
  assert.match(remediation, /revoke all on function public\.rls_auto_enable\(\) from public, anon, authenticated/);
});

test('production migrations index every previously unindexed foreign key', () => {
  const migration = read('supabase/migrations/20260727161702_add_missing_foreign_key_indexes.sql');

  for (const indexName of [
    'idx_customer_reviews_user_id',
    'idx_customer_saved_addresses_user_id',
    'idx_recipes_menu_item_id',
    'idx_reservations_customer_id',
    'idx_reservations_table_id',
    'idx_shifts_staff_id',
    'idx_staff_memberships_staff_id'
  ]) {
    assert.match(migration, new RegExp(indexName));
  }
});

test('customer identity resolution no longer links by display name', () => {
  const source = read('src/services/auth.ts');
  const resolver = source.slice(source.indexOf('async _resolveCustomer'), source.indexOf('async _resolveCloudAccount'));
  assert.doesNotMatch(resolver, /toLowerCase\(\) === name\.toLowerCase\(\)/);
  assert.doesNotMatch(source, /Session restored.*saved PIN hash/);
});

test('AI provider secrets stay behind authenticated Edge Functions', () => {
  const client = read('src/services/ai.ts');
  const developerView = read('src/views/developer/DevConsoleView.tsx');
  const edgeFunction = read('supabase/functions/ai-chat/index.ts');

  assert.doesNotMatch(client, /api\.groq\.com|groqApiKey|lightningApiKey/);
  assert.doesNotMatch(developerView, /groqApiKey|lightningApiKey|ai-groq-key|ai-lightning-key/);
  assert.match(client, /functions\.invoke\('ai-chat'/);
  assert.match(edgeFunction, /Active staff membership required/);
  assert.match(edgeFunction, /rpc\(\s*"consume_staff_ai_attempt"/);
});

test('public support links do not ship placeholder phone numbers', () => {
  const pages = read('src/views/customer/components/CustomerPages.tsx');
  const success = read('src/views/customer/components/OrderSuccessTele.tsx');

  assert.doesNotMatch(`${pages}\n${success}`, /910000000000/);
  assert.match(pages, /supportPhoneLinks/);
});

test('guest location handling does not expose a maps key or call public Nominatim', () => {
  const geocoding = read('src/services/geocoding.ts');

  assert.doesNotMatch(geocoding, /googleMapsApiKey|maps\.googleapis\.com/);
  assert.doesNotMatch(geocoding, /nominatim\.openstreetmap\.org|fetch\s*\(/);
  assert.match(geocoding, /source: 'device'/);
});

test('dynamic invoice fields are sanitized before HTML rendering', () => {
  const invoice = read('src/services/invoiceGenerator.ts');

  assert.match(invoice, /safeCurrencySymbol/);
  assert.match(invoice, /safeImageUrl/);
  assert.match(invoice, /parseOrderItems/);
  assert.match(invoice, /invoicePrimaryColor/);
  assert.match(invoice, /\[0-9a-f\]\{6\}/i);
});

test('order cancellation is cloud-role gated in both UI and database', () => {
  const kitchen = read('src/views/kitchen/KitchenView.tsx');
  const express = read('src/views/express/ExpressView.tsx');
  const migration = read('supabase/migrations/20260718000000_enforce_order_status_transitions.sql');

  assert.doesNotMatch(`${kitchen}\n${express}`, /promptAdminPin|allowCashierVoid|auth-pin-overlay/);
  assert.match(`${kitchen}\n${express}`, /\['owner', 'developer', 'manager'\]/);
  assert.match(migration, /Paid orders must be refunded before cancellation/);
  assert.match(migration, /caller_role not in \('developer', 'owner', 'manager'\)/);
  assert.match(migration, /Terminal order status cannot be changed/);
});

test('production client accepts a Supabase publishable key without exposing server secrets', () => {
  const client = read('src/services/supabaseClient.ts');
  const envGuard = read('scripts/check-public-env.js');

  assert.match(client, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(client, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(envGuard, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('Vercel serves the hardened static export instead of the raw Next.js adapter output', () => {
  const config = JSON.parse(read('vercel.json'));
  const csp = config.headers
    .flatMap((entry: { headers?: Array<{ key?: string; value?: string }> }) => entry.headers || [])
    .find((header: { key?: string }) => header.key === 'Content-Security-Policy')?.value || '';

  assert.equal(config.framework, null);
  assert.equal(config.buildCommand, 'npm run build');
  assert.equal(config.outputDirectory, 'dist');
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
});

test('public storefront first paint does not wait for cloud catalog retries', () => {
  const seed = read('src/db/seed.ts');
  const customerApp = read('src/views/customer/components/CustomerApp.tsx');

  assert.match(seed, /!publicOnly && attempt <= MAX_HYDRATION_RETRIES/);
  assert.match(customerApp, /fullPull\(\{ publicOnly: true \}\)/);
  assert.match(customerApp, /after first paint/i);
});

test('staff sign-in renders before cloud session restoration and never seeds staff demo data', () => {
  const main = read('src/main.ts');
  const loginIndex = main.indexOf('await this.showLogin();');
  const restoreIndex = main.indexOf('await authService.restoreSession();');

  assert.ok(loginIndex > -1 && restoreIndex > loginIndex);
  assert.doesNotMatch(main, /seedDatabase\(\{ publicOnly: isPublicEntry \}\)/);
  assert.doesNotMatch(main, /Last-Resort Cloud Staff Pull/);
});
