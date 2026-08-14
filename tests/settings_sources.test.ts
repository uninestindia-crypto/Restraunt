// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/**
 * A setting read from a key nothing writes.
 *
 * The POS cart bar and three Express Panel render paths read the tax rate from
 * `localStorage.getItem('gstPercent')` and `localStorage.getItem('app_gst_percent')`. Neither key
 * is written anywhere in this codebase, so both reads always returned null and always fell back to
 * 5%. On a store with any other rate the operator was shown a total computed at 5% while the order
 * was created at the real rate — ₹105 on screen, ₹118 charged, on an 18% store.
 *
 * Nothing failed. There was no error to notice, because a fallback is indistinguishable from a
 * value. That is what makes this class worth a test rather than a fix alone.
 */

function sourceFiles(dir = 'src', acc: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, acc);
    else if (/\.(ts|tsx)$/.test(entry)) acc.push(path);
  }
  return acc;
}

/**
 * Comments are where the old key names live on, explaining why they were removed. A scan that
 * cannot tell code from prose reports the fix as the bug.
 */
function code(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const files = sourceFiles();
const sources = new Map(files.map(f => [f, code(readFileSync(f, 'utf8'))]));
const all = [...sources.values()].join('\n');

test('every localStorage key that is read is also written somewhere', () => {
  const read = new Set(
    [...all.matchAll(/localStorage\.getItem\(\s*['"]([\w.-]+)['"]/g)].map(m => m[1])
  );
  const written = new Set(
    [...all.matchAll(/localStorage\.(?:setItem|removeItem)\(\s*['"]([\w.-]+)['"]/g)].map(m => m[1])
  );

  // Keys another party owns: Supabase writes its own session, and the store id is provisioned
  // outside the app. Everything else must have a writer in this codebase.
  const externallyOwned = new Set(['store_id', 'supabase.auth.token']);

  const orphans = [...read].filter(k => !written.has(k) && !externallyOwned.has(k) && !k.startsWith('sb-'));

  assert.deepEqual(
    orphans,
    [],
    `these keys are read but never written, so they always fall back: ${orphans.join(', ')}`
  );
});

test('the tax rate comes from the store settings, never from a cache nobody fills', () => {
  for (const [file, source] of sources) {
    assert.doesNotMatch(
      source,
      /localStorage\.getItem\(\s*['"](gstPercent|app_gst_percent|taxPercent)['"]/,
      `${file} reads the tax rate from localStorage; use getSetting('gstPercent')`
    );
  }
});

test('what the operator is shown and what the order stores use the same rate', () => {
  // The Express Panel renders synchronously, so it caches the rate at mount rather than
  // guessing inline. The POS cart bar awaits the same setting the bill does.
  const express = readFileSync('src/views/express/ExpressView.tsx', 'utf8');
  assert.match(express, /this\.gstPercent = parseFloat\(await getSetting\('gstPercent'\)/);
  assert.equal(
    (express.match(/const gstPercent = this\.gstPercent;/g) || []).length,
    3,
    'all three Express display paths must read the cached rate'
  );

  const pos = readFileSync('src/views/pos/PosView.tsx', 'utf8');
  const bar = pos.slice(pos.indexOf('async updateMobileCartBar'), pos.indexOf('async updateMobileCartBar') + 1400);
  assert.match(bar, /await getSetting\('gstPercent'\)/, 'the cart bar must use the rate the bill uses');
});
