// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * Signing in worked. Landing anywhere did not.
 *
 * `showLogin()` mounted a React root directly on `#app`. On success the root's callback ran
 * `App.onLoginSuccess`, which synchronously rebuilt `#app` into the application shell, and then —
 * back in the React handler — `destroy()` unmounted the root from that same `#app`. React removed
 * the nodes it still believed it owned, taking the freshly built shell with them. By the time the
 * awaited `import('./components/Sidebar')` resolved, `#app-sidebar` was null:
 *
 *     TypeError: Cannot set properties of null (setting 'innerHTML')
 *     → "Failed to load staff console"
 *
 * Deterministic, on every staff and owner login, on the deployed build and a clean local one. The
 * whole suite was green throughout, because nothing exercised what happens after a login succeeds.
 *
 * These tests pin the two rules that keep it fixed. They are structural, not behavioural — the
 * behavioural version needs a signed-in browser, which is noted as a coverage gap rather than
 * pretended away.
 */

const login = readFileSync('src/components/LoginScreen.tsx', 'utf8');
const main = readFileSync('src/main.ts', 'utf8');

test('React never owns the container the app rebuilds', () => {
  // A root mounted on `#app` cannot be unmounted safely once `renderShell()` has replaced its
  // contents. The root gets a child element of its own instead.
  assert.match(login, /const host = document\.createElement\('div'\);/);
  assert.match(login, /container\.appendChild\(host\);/);
  assert.match(login, /this\.root = createRoot\(host\);/);
  assert.doesNotMatch(
    login,
    /createRoot\(container\)/,
    'mounting on the caller-supplied container is the bug: that container is #app'
  );
});

test('the login UI is torn down after the callback, and off the current task', () => {
  const cb = login.slice(login.indexOf('onLoginSuccess={(staff) =>'), login.indexOf('destroy() {'));

  const handoff = cb.indexOf('this.root = null;');
  const callOut = cb.indexOf('this.onLoginSuccess?.(staff);');
  const teardown = cb.indexOf('queueMicrotask(');

  assert.ok(handoff > -1 && callOut > -1 && teardown > -1, 'callback shape changed');
  assert.ok(handoff < callOut, 'the root must be handed over before the app callback can race it');
  assert.ok(
    callOut < teardown,
    'unmounting before the callback destroys the login UI the callback may still be reading'
  );
  assert.match(
    cb,
    /queueMicrotask\(\(\) => \{/,
    'a synchronous unmount inside a React event handler tears down a root mid-render'
  );
});

test('the shell the callback builds is the one the sidebar looks for', () => {
  // The failure surfaced as a null `#app-sidebar`. If either name drifts, this breaks again in a
  // way no type checker would notice — renderShell writes a string, the lookup reads a string.
  assert.match(main, /<aside class="sidebar" id="app-sidebar"><\/aside>/);
  assert.match(main, /this\.sidebar\.render\(document\.getElementById\('app-sidebar'\)\)/);
});

test('a failed console load still tells the user, and offers a way out', () => {
  // The fallback is what made this diagnosable at all. Keep it.
  assert.match(main, /Failed to load staff console/);
  assert.match(main, /id="staff-console-retry"/);
});
