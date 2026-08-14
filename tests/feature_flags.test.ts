// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/**
 * The Developer Console's feature flags, and whether anything reads them.
 *
 * A toggle is a promise: flipping it changes what the product does. Seven of the nine flags in the
 * console are written to the settings table and then read by nothing at all — `maintenanceMode`,
 * labelled "blocks all staff", blocks nobody. That is the same defect as a staff role that grants
 * no permissions: a control that reports success and has no effect.
 *
 * These tests do not fix that. They stop it growing, and they keep the debt written down somewhere
 * that fails when it changes rather than in a comment nobody rereads.
 */

function sourceFiles(dir = 'src', acc: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, acc);
    else if (/\.(ts|tsx)$/.test(entry)) acc.push(path);
  }
  return acc;
}

const CONSOLE_PATH = 'src/views/developer/DevConsoleView.tsx';
const consoleSource = readFileSync(CONSOLE_PATH, 'utf8');

/** The flags the console draws, with the default it draws them at. */
const declared = [
  ...consoleSource
    .slice(consoleSource.indexOf('const FEATURE_FLAGS = ['))
    .slice(0, consoleSource.slice(consoleSource.indexOf('const FEATURE_FLAGS = [')).indexOf('];'))
    .matchAll(/\{\s*key:\s*'([\w]+)'[^}]*default:\s*'(true|false)'/g)
].map(m => ({ key: m[1], default: m[2] }));

/** Every read of the flag outside the console that declares it. */
const readers = sourceFiles()
  .filter(f => f !== CONSOLE_PATH)
  .map(f => [f, readFileSync(f, 'utf8')] as const);

function readersOf(key: string) {
  return readers.filter(([, source]) => source.includes(key)).map(([file]) => file);
}

/**
 * Flags nothing honours yet. Shrinking this list is the fix; growing it is a regression. The test
 * asserts equality in both directions so neither happens silently.
 */
const KNOWN_UNWIRED = [
  'enableBLEPrinter',
  'enableCloudSync',
  'enableDelivery',
  'enableLoyaltyProgram',
  'enablePublicOrdering',
  'enableWhatsAppSharing',
  'maintenanceMode'
];

test('the console declares the flags this test thinks it does', () => {
  assert.ok(declared.length >= 9, `parsed only ${declared.length} flags from ${CONSOLE_PATH}`);
});

test('no new switch is added that nothing reads', () => {
  const unwired = declared.map(f => f.key).filter(k => readersOf(k).length === 0).sort();

  assert.deepEqual(
    unwired,
    KNOWN_UNWIRED,
    'the set of do-nothing toggles changed. Wiring one? Remove it from KNOWN_UNWIRED. ' +
      'Adding one? Wire it before shipping the switch.'
  );
});

test('a wired flag behaves the way the console draws it', () => {
  // `getSetting` returns null until someone touches the toggle, so the comparison decides what an
  // untouched flag means. `!== 'false'` means on; `=== 'true'` means off. It has to match the
  // default the console renders, or the switch shows one state and the code takes the other.
  const ai = readFileSync('src/services/ai.ts', 'utf8');

  const chat = declared.find(f => f.key === 'enableAIChat');
  assert.equal(chat.default, 'true', 'AI chat is on by default');
  assert.match(ai, /const aiEnabled = await getSetting\('enableAIChat'\);\s*\n\s*if \(aiEnabled !== 'false'\)/);

  const analytics = declared.find(f => f.key === 'enableAIAnalytics');
  assert.equal(analytics.default, 'false', 'AI analytics is off by default');
  assert.match(
    ai,
    /const analyticsEnabled = await getSetting\('enableAIAnalytics'\);\s*\n\s*if \(analyticsEnabled === 'true'\)/,
    "an off-by-default flag must require an explicit 'true'; `!== 'false'` makes unset mean on"
  );
});
