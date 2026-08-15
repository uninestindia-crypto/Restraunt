// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

/**
 * The audit trail that never reached the cloud.
 *
 * `authenticated` is granted select and insert on `activity_log` and deliberately not update — an
 * audit trail staff can rewrite is not an audit trail. The client pushed with a plain `.upsert()`,
 * which PostgREST compiles to ON CONFLICT DO UPDATE and which therefore asks for exactly the
 * privilege being withheld. Every push failed 42501, retried three times, and gave up. Silently,
 * as far as the screen was concerned:
 *
 *     permission denied for table activity_log
 *     hint: Grant the required privileges … GRANT UPDATE ON public.activity_log TO authenticated;
 *
 * The hint names the wrong fix. Granting UPDATE would make the error stop and the audit log
 * forgeable. The client is what was wrong.
 */

const sync = readFileSync('src/services/sync.ts', 'utf8');

test('activity_log is written append-only, never with a conflicting update', () => {
  const writes = [...sync.matchAll(/\.from\('activity_log'\)\s*\n?\s*\.upsert\(([^;]+?)\);/gs)];
  assert.ok(writes.length >= 2, `expected the two push sites, found ${writes.length}`);

  for (const [, args] of writes) {
    assert.match(
      args,
      /ignoreDuplicates:\s*true/,
      'a bare upsert on activity_log needs UPDATE, which authenticated does not have and must not get'
    );
  }
});

test('no update or delete is ever issued against the audit trail', () => {
  assert.doesNotMatch(sync, /\.from\('activity_log'\)\s*\n?\s*\.update\(/);
  assert.doesNotMatch(sync, /\.from\('activity_log'\)\s*\n?\s*\.delete\(/);
});

test('the schema withholds update on the audit trail, and keeps withholding it', () => {
  // If a future migration grants UPDATE to make the error go away, this fails — which is the
  // point. The privilege is absent on purpose.
  const dir = 'supabase/migrations';
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(`${dir}/${f}`, 'utf8'))
    .join('\n')
    .toLowerCase();

  const grants = [...sql.matchAll(/grant ([^;]*?) on (?:table )?([^;]*?activity_log[^;]*?) to ([^;]+);/g)];
  assert.ok(grants.length > 0, 'activity_log should have an explicit grant');

  for (const [stmt, privileges, , grantee] of grants) {
    if (!/authenticated|anon/.test(grantee)) continue;
    assert.doesNotMatch(
      privileges,
      /\bupdate\b|\ball\b/,
      `audit rows must not be rewritable by ${grantee.trim()}: ${stmt.trim().slice(0, 120)}`
    );
    assert.doesNotMatch(privileges, /\bdelete\b/, 'audit rows must not be deletable');
  }
});
