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

test('staff PIN endpoint rate limits and never returns the reusable verifier', () => {
  const source = read('supabase/functions/staff-admin/index.ts');
  assert.match(source, /rpc\("consume_staff_pin_attempt"/);
  assert.match(source, /const pinHash = await hashPin\(pin\)/);
  assert.doesNotMatch(source, /payload as any\)\.pinHash/);
  const responseBlock = source.slice(source.indexOf('return jsonResponse({\n        ok: true'));
  assert.doesNotMatch(responseBlock.split('// All other actions')[0], /pinHash:/);
});

test('security migration restricts storage and privileged RPC execution', () => {
  const migration = read('supabase/migrations/202606300900_security_scan_remediation.sql');
  assert.match(migration, /staff_memberships/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.emulate_stripe_webhook/);
  assert.match(migration, /pg_advisory_xact_lock/);
});

test('customer identity resolution no longer links by display name', () => {
  const source = read('src/services/auth.ts');
  const resolver = source.slice(source.indexOf('async _resolveCustomer'), source.indexOf('async _resolveCloudAccount'));
  assert.doesNotMatch(resolver, /toLowerCase\(\) === name\.toLowerCase\(\)/);
  assert.doesNotMatch(source, /Session restored.*saved PIN hash/);
});
