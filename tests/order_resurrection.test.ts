import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * Reproduces "I cancel the order, it disappears, and a few seconds later it is
 * back on the board".
 *
 * `syncUpOrder` upserts the whole order row, and `pushUnsynced` replays every
 * queued order on reconnect. Neither looked at what the cloud already held, so
 * any device still carrying the order as active — another till, or this one
 * replaying a queued write — pushed that copy straight over the cancellation.
 * The next read then pulled the resurrected order back onto the board, which
 * is why it returned on its own after a few seconds.
 */

const source = readFileSync('src/services/sync.ts', 'utf8');

test('a push compares the cloud copy before overwriting it', () => {
  assert.match(source, /async serverOrderIsNewer\(order\)/);

  const body = source.slice(source.indexOf('async serverOrderIsNewer'), source.indexOf('async adoptServerOrder'));
  assert.match(body, /\.eq\('client_order_id', order\.clientOrderId\)/);
  assert.match(body, /Date\.parse\(data\.updated_at/);
  assert.match(body, /serverAt > localAt/);
});

test('a terminal cloud status is never overwritten by an active local one', () => {
  const body = source.slice(source.indexOf('async serverOrderIsNewer'), source.indexOf('async adoptServerOrder'));

  // Cancelled and completed are final — the database trigger says so too.
  assert.match(body, /const terminal = \['cancelled', 'completed'\]/);
  assert.match(body, /if \(serverTerminal && !localTerminal\) return \{ serverWins: true/);
});

test('a comparison that fails does not block the write', () => {
  const body = source.slice(source.indexOf('async serverOrderIsNewer'), source.indexOf('async adoptServerOrder'));
  assert.match(body, /catch \(e\) \{[\s\S]*?return \{ serverWins: false, row: null \}/,
    'losing a write is worse than risking one');
});

test('the losing device adopts the cloud copy instead of retrying forever', () => {
  const body = source.slice(source.indexOf('async adoptServerOrder'), source.indexOf('async syncUpOrder'));
  assert.match(body, /mapOrderToLocal\(row\)/);
  assert.match(body, /local\.id = order\.id/, 'the local key must survive so open views keep their handle');
  assert.match(body, /this\.isSyncingFromServer = true/, 'adopting must not re-trigger a push');
});

test('both push paths are guarded — the single write and the reconnect replay', () => {
  const single = source.slice(source.indexOf('async syncUpOrder'), source.indexOf('async syncUpItem'));
  assert.match(single, /const comparison = await this\.serverOrderIsNewer\(order\);/);
  assert.match(single, /if \(comparison\.serverWins\)/);

  const bulk = source.slice(source.indexOf('const candidateOrders'), source.indexOf('const remoteOrders = staffOrders.map'));
  assert.match(bulk, /await this\.serverOrderIsNewer\(order\)/);
  assert.match(bulk, /continue;/, 'a stale queued order must be dropped from the batch, not pushed');
});
