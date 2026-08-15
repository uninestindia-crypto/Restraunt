// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * The connection strip told every customer the cloud was unreachable while their menu was on
 * screen, loaded from that cloud moments earlier.
 *
 * The cause was a signal borrowed from the wrong question. `isCloudDataFresh` answers "may I skip
 * the network?" and its window is READ_FRESHNESS_MS — three seconds, sized to collapse one
 * screen's cascade of reads into one query per table. Reachability runs on a different clock: the
 * storefront re-pulls every five minutes. So for 4m57s out of every 5m the dedupe window was shut
 * and the strip announced an outage that was not happening.
 *
 * The whole suite passed while this was live on the storefront, because every test asserted the
 * copy rules and none asserted the signal underneath them. These do.
 */

const banner = readFileSync('src/components/ConnectionBanner.ts', 'utf8');
const cloudDb = readFileSync('src/services/cloudDb.ts', 'utf8');

function constant(source: string, name: string) {
  const m = source.match(new RegExp(`const ${name}\\s*=\\s*([^;]+);`));
  assert.ok(m, `${name} not found`);
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}

test('reachability is judged on the last answered read, not the dedupe window', () => {
  assert.match(
    banner,
    /const \{ getLastCloudContactAt \} = await import\('\.\.\/services\/cloudDb'\)/,
    'the strip must ask when the cloud last answered'
  );
  assert.doesNotMatch(
    banner,
    /isCloudDataFresh/,
    'isCloudDataFresh is a read-dedupe window; it cannot answer whether the cloud is reachable'
  );
});

test('the grace window is longer than the gap between reads on a healthy device', () => {
  const grace = constant(banner, 'CLOUD_CONTACT_GRACE_MS');
  const refresh = constant(readFileSync('src/services/publicMenuSync.ts', 'utf8'), 'REFRESH_INTERVAL_MS');
  const dedupe = constant(cloudDb, 'READ_FRESHNESS_MS');

  // This is the inequality the bug violated. A grace window at or below the refresh cadence
  // guarantees a false outage warning on a working connection, every single cycle.
  assert.ok(
    grace > refresh,
    `grace window ${grace}ms must exceed the ${refresh}ms storefront refresh, or an idle-but-healthy ` +
      'storefront is accused between pulls'
  );
  assert.ok(
    grace > dedupe * 10,
    'a grace window anywhere near the read-dedupe window is the original bug in new clothes'
  );
});

test('a successful read records contact even when the table came back empty', () => {
  // An empty result is still the server answering. Recording contact only on non-empty payloads
  // would put a store with an empty table permanently into the warning state.
  const pull = cloudDb.slice(cloudDb.indexOf('async function pullResource'));
  const body = pull.slice(0, pull.indexOf('\n}\n'));

  const contactAt = body.indexOf('lastCloudContactAt = Date.now()');
  const emptyBranch = body.indexOf('if (rows.length === 0)');

  assert.ok(contactAt > -1, 'pullResource must record when the server answered');
  assert.ok(
    contactAt < emptyBranch,
    'contact must be recorded before the empty-payload branch returns, so an empty table still counts'
  );
  assert.ok(
    contactAt > body.indexOf('await resource.fetch'),
    'contact must be recorded after the fetch resolves, never before it is known to have succeeded'
  );
});

test('a read that throws does not count as contact', () => {
  const pull = cloudDb.slice(cloudDb.indexOf('async function pullResource'));
  const body = pull.slice(0, pull.indexOf('\n}\n'));
  const cat = body.indexOf('} catch (error: any) {');
  assert.equal(
    body.slice(cat).includes('lastCloudContactAt'),
    false,
    'the failure path must never stamp contact — that would make an outage invisible'
  );
});

test('a cold load says nothing until the first pull has had a chance', () => {
  // "No contact yet" is not "contact failed". Warning during startup means every visitor is told
  // the cloud is unreachable for the seconds the catalogue takes to arrive, then told otherwise.
  assert.match(banner, /const STARTUP_GRACE_MS = \d+/);
  assert.match(
    banner,
    /const starting = lastPull === 0 && Date\.now\(\) - mountedAt < STARTUP_GRACE_MS;/
  );
  assert.match(banner, /const stale = !offline && !reachable && !starting;/);

  // The clock has to start when the strip mounts and reset when it unmounts, or a second mount
  // inherits an expired grace period and warns instantly.
  assert.match(banner, /if \(!mountedAt\) mountedAt = Date\.now\(\);/);
  assert.match(banner, /lastRendered = '';\s*\n\s*mountedAt = 0;/);
});
