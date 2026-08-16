// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * The paste-ready copy of `public-order`, and the one property that makes it safe to keep.
 *
 * The Supabase dashboard scopes a function to its own folder, so the real entrypoint's
 * `../_shared/cors.ts` import cannot resolve there. `.codex/launch/public-order.dashboard.ts` is
 * that entrypoint with the two helpers inlined, for deploying by hand from the dashboard.
 *
 * A second copy of a money-handling function is a liability the moment it stops matching the first.
 * These tests make the drift loud: if the entrypoint changes and the copy is not regenerated, the
 * build fails rather than someone pasting last week's pricing into production.
 *
 * Regenerate with the snippet in the copy's own header comment, or delete both the copy and this
 * test once the deploy is scripted and nobody is pasting anything.
 */

const real = readFileSync('supabase/functions/public-order/index.ts', 'utf8');
const copy = readFileSync('.codex/launch/public-order.dashboard.ts', 'utf8');

/** The entrypoint minus its import line; the copy minus its header and inlined helpers. */
function body(source: string) {
  return source
    .slice(source.indexOf('const STORE_ID'))
    .replace(/\s+/g, ' ')
    .trim();
}

test('the dashboard copy is the same function, not a fork', () => {
  assert.equal(
    body(copy),
    body(real),
    'the paste-ready copy has drifted from supabase/functions/public-order/index.ts — regenerate it'
  );
});

test('the copy resolves without the shared module', () => {
  // This is the only reason the copy exists; if it still imports the shared file it is useless.
  assert.doesNotMatch(copy, /^\s*import .*_shared/m);
  assert.match(copy, /const corsHeaders = \{/);
  assert.match(copy, /function jsonResponse\(/);

  // Everything else it imports must be a remote URL the dashboard can fetch.
  for (const [, spec] of copy.matchAll(/^\s*import .* from "([^"]+)"/gm)) {
    assert.match(spec, /^https:\/\//, `the dashboard cannot resolve a relative import: ${spec}`);
  }
});

test('both carry the two fixes that make deploying urgent', () => {
  for (const [name, source] of [['entrypoint', real], ['dashboard copy', copy]]) {
    assert.match(source, /action === "status"/, `${name} is missing the guest tracking endpoint`);
    assert.match(source, /store_security_settings/, `${name} is missing the store rate read`);
    assert.doesNotMatch(source, /Deno\.env\.get\("GST_PERCENT"\)/, `${name} still prices from an env var`);
  }
});
