// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

(globalThis as any).window = { addEventListener: () => {}, removeEventListener: () => {} };
// Node exposes navigator as a getter-only property, so it has to be redefined rather than assigned.
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const { __test__ } = await import('../src/components/ConnectionBanner');
const { copyFor, agoLabel } = __test__;

/**
 * The strip that says what the app knows and how long ago it knew it.
 *
 * The data layer queued writes correctly and served stale rows correctly, and the screen said
 * nothing about either — so a cashier could not tell a working till from a diverging one, and a
 * guest could not tell a live menu from a remembered one. `03-components.md` §10 makes this
 * component mandatory for this product; these are its rules.
 */

test('an ordinary connected session shows nothing at all', () => {
  assert.equal(copyFor('hidden', 0, 0, Date.now()), null);
});

test('offline says what still works, not just that it is offline', () => {
  const copy = copyFor('offline', 0, 0, Date.now() - 8 * 60000);
  assert.match(copy.text, /offline/i);
  assert.match(copy.text, /orders still work/i, 'the user needs to know they can keep going');
  assert.match(copy.text, /8 min ago/, 'stale data must carry its age');
});

test('queued work is counted, and counted in words a person uses', () => {
  assert.match(copyFor('offline', 1, 0, 0).text, /1 change is waiting/);
  assert.match(copyFor('offline', 4, 0, 0).text, /4 changes are waiting/);
});

test('a refusal is a different message from a queue, because it needs a person', () => {
  const queued = copyFor('pending', 3, 0, Date.now());
  const refused = copyFor('blocked', 3, 2, Date.now());

  assert.equal(queued.tone, 'info', 'a draining queue is informational');
  assert.equal(refused.tone, 'error');
  assert.match(refused.text, /won't send on their own/, 'a refusal never drains by waiting');
  assert.match(refused.text, /Settings/, 'a dead end is a design failure — say where to look');
});

test('the age reads the way someone would say it', () => {
  assert.equal(agoLabel(0), '');
  assert.equal(agoLabel(Date.now() - 20 * 1000), 'just now');
  assert.equal(agoLabel(Date.now() - 60 * 1000), '1 min ago');
  assert.equal(agoLabel(Date.now() - 42 * 60000), '42 min ago');
  assert.equal(agoLabel(Date.now() - 60 * 60000), '1 hr ago');
  assert.equal(agoLabel(Date.now() - 5 * 60 * 60000), '5 hr ago');
});

test('no message ends in an exclamation, and none is a dead end', () => {
  for (const mode of ['offline', 'stale', 'pending', 'blocked']) {
    const copy = copyFor(mode, 2, mode === 'blocked' ? 2 : 0, Date.now() - 60000);
    assert.doesNotMatch(copy.text, /!/, `${mode} must not shout`);
    assert.ok(copy.text.length > 12, `${mode} must say something specific`);
  }
});

test('it is a state, not an event — persistent, polite, and self-removing', () => {
  const source = readFileSync('src/components/ConnectionBanner.ts', 'utf8');

  assert.match(source, /role="status" aria-live="polite"/, 'announced, but never interrupting');
  assert.doesNotMatch(source, /showToast/, 'a toast describes an event; this describes a state');

  // Returning null is what makes it disappear by itself when the condition clears.
  assert.match(source, /if \(!copy\) \{/);
  assert.match(source, /host\.hidden = true/);

  // Mounting twice must not stack two strips.
  assert.match(source, /getElementById\('connection-banner-host'\)/);
});

test('both surfaces mount it', () => {
  assert.match(readFileSync('src/main.ts', 'utf8'), /mountConnectionBanner/);
  assert.match(
    readFileSync('src/views/customer/components/CustomerApp.tsx', 'utf8'),
    /mountConnectionBanner/,
    'a guest on cellular is the normal case, not the edge case'
  );
});
