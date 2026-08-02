import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

/**
 * Regression cover for a silent production data-loss bug.
 *
 * `fullPull` used to rebuild the local menu cache with `clear()` + `bulkPut()`.
 * `clear()` fires Dexie's 'deleting' hook once per row, and the sync layer
 * replicates those deletions as cloud DELETEs. Every hydration therefore raced
 * a full teardown of `menu_categories` / `menu_items` against the re-insert,
 * and rows that lost the race were destroyed in Supabase permanently. The
 * production menu had decayed from 11 categories / 80 items down to 3 / 3.
 */

test('cloud hydration never clears local stores wholesale', () => {
  const source = read('src/services/cloudDb.ts');

  // `clear()` fires a 'deleting' hook per row, which replicates as a cloud DELETE.
  assert.doesNotMatch(source, /\.clear\(\)/);

  // Stale rows are pruned by explicit id diff instead — and only those the
  // cloud is authoritative for, never a row still waiting to be pushed.
  assert.match(source, /async function replaceLocalStore/);
  assert.match(source, /const staleIds = /);
  assert.match(source, /bulkDelete\(prunableIds\)/);
  assert.match(source, /prunableIds = staleIds\.filter\([\s\S]*?hasUnpushedLocalEdit/);
});

test('every local write performed by fullPull is wrapped in the hydration guard', () => {
  const source = read('src/services/cloudDb.ts');

  assert.match(source, /import \{ runWithHydrationGuard \} from '\.\/hydrationGuard'/);

  // hydrateTx is the only sanctioned way to open a write transaction here, so a
  // raw db.transaction would be an unguarded hydration path.
  const rawTransactions = source.match(/await db\.transaction\(/g) || [];
  assert.equal(
    rawTransactions.length,
    0,
    'fullPull must route local writes through hydrateTx so sync hooks stay suppressed'
  );
  assert.match(source, /function hydrateTx/);
  assert.match(source, /runWithHydrationGuard\(\(\) => db\.transaction\('rw', stores, body\)\)/);
});

test('sync hooks evaluate the replication guard synchronously, not inside setTimeout', () => {
  const source = read('src/services/sync.ts');
  const lines = source.split(/\r?\n/);

  assert.match(source, /import \{ isHydrating \} from '\.\/hydrationGuard'/);

  const hookLines = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /\.hook\('(creating|updating|deleting)'/.test(line));

  assert.ok(hookLines.length > 0, 'expected sync.ts to register Dexie hooks');

  for (const { line, index } of hookLines) {
    const guard = lines[index + 1]?.trim();
    const deferral = lines[index + 2]?.trim();

    // The guard must run before the deferral. Both isHydrating() and
    // isSyncingFromServer are only true for the duration of the write that
    // triggered the hook, so a check inside setTimeout reads a stale `false`.
    assert.equal(
      guard,
      'if (isHydrating() || this.isSyncingFromServer) return;',
      `hook at line ${index + 1} must check the guard synchronously: ${line.trim()}`
    );
    assert.ok(
      deferral?.startsWith('setTimeout('),
      `hook at line ${index + 1} must defer only after guarding: ${line.trim()}`
    );
  }
});

test('hydration guard survives overlapping hydrations', async () => {
  const { isHydrating, runWithHydrationGuard } = await import('../src/services/hydrationGuard');

  assert.equal(isHydrating(), false);

  // Depth counting, not a boolean: the inner completion must not clear the
  // guard while the outer hydration is still writing.
  await runWithHydrationGuard(async () => {
    assert.equal(isHydrating(), true);
    await runWithHydrationGuard(async () => {
      assert.equal(isHydrating(), true);
    });
    assert.equal(isHydrating(), true);
  });

  assert.equal(isHydrating(), false);
});

test('hydration guard is released when a hydration throws', async () => {
  const { isHydrating, runWithHydrationGuard } = await import('../src/services/hydrationGuard');

  await assert.rejects(() => runWithHydrationGuard(async () => {
    throw new Error('pull failed');
  }));

  assert.equal(isHydrating(), false, 'a failed hydration must not wedge the guard on');
});
