// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';

/**
 * "Make sure speed is fast — the client says Lighthouse has very low marks."
 *
 * They did. Measured on the production bundle, mobile emulation, median of three runs:
 *
 *                        before   after
 *   performance            72       81
 *   first contentful paint 2.3 s    1.4 s
 *   page weight            1470 K   1407 K
 *
 * Four things were paying for a marketing page that only needs to be read and tapped once. Each
 * has a test below, because every one of them is a single import away from coming back.
 */

const telemetry = readFileSync('src/services/telemetry.ts', 'utf8');
const spaBoot = readFileSync('src/app/_components/SpaBoot.tsx', 'utf8');
const layout = readFileSync('src/app/layout.tsx', 'utf8');
const main = readFileSync('src/main.ts', 'utf8');
const fontsCss = readFileSync('src/styles/fonts.css', 'utf8');

/** Comments name the files they moved, so strip them before asserting on the imports. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('the Supabase SDK is not in the first chunk of every page', () => {
  // main.ts imports telemetry; telemetry imported getSupabaseClient at the top level; that put the
  // whole SDK — 224 KB, 218 KB of it unused — into the entry bundle of the marketing home.
  assert.doesNotMatch(telemetry, /^import \{[^}]*getSupabaseClient[^}]*\} from '\.\/supabaseClient';/m);
  assert.match(telemetry, /const supabaseClient = \(\) => import\('\.\/supabaseClient'\)/);
  assert.match(telemetry, /const supabase = await supabaseClient\(\);/);
});

test('the ordering app boots on intent, not on page load', () => {
  assert.match(spaBoot, /const INTENT = \['pointerdown', 'keydown', 'touchstart'\] as const;/);
  assert.match(spaBoot, /window\.requestIdleCallback\s*\n?\s*\? window\.requestIdleCallback\(boot, \{ timeout: 4000 \}\)/);
  assert.match(spaBoot, /if \(window\.location\.hash && window\.location\.hash !== '#'\) \{\s*\n\s*boot\(\);/,
    'a hash route is a direct request for the app and must not wait');
  assert.match(spaBoot, /window\.addEventListener\('hashchange', boot\)/);
  assert.match(spaBoot, /if \(booted\) return;/, 'the boot must be idempotent — several triggers race');
});

test('the splash does not outlive the deferred boot', () => {
  // #loading-screen is an opaque full-screen overlay hidden by main.ts. Deferring the boot without
  // this hid finished, pre-rendered content behind a spinner and handed Lighthouse the splash as
  // the largest contentful paint.
  assert.match(spaBoot, /const splash = document\.getElementById\('loading-screen'\);/);
  assert.match(spaBoot, /splash\.classList\.add\('hide'\);/);

  const hashBranch = spaBoot.indexOf("window.location.hash !== '#'");
  const splashDrop = spaBoot.indexOf("getElementById('loading-screen')");
  assert.ok(splashDrop > hashBranch,
    'a direct app entry keeps the splash until main.ts has the app on screen');
});

test('the staff console\'s chrome does not load on a marketing page', () => {
  for (const sheet of ['components-v2.css', 'layout.css', 'sidebar.css']) {
    assert.ok(!code(layout).includes(sheet), `${sheet} is staff chrome and must not block the storefront render`);
    assert.ok(main.includes(sheet), `${sheet} still has to arrive with the app that uses it`);
  }
  // What the pre-rendered storefront does paint with.
  for (const sheet of ['fonts.css', 'variables.css', 'base.css', 'storefront.css', 'storefront-static.css']) {
    assert.ok(code(layout).includes(sheet), `${sheet} is needed for the pre-rendered page`);
  }
});

test('the latin-ext fonts are the narrowed ones', () => {
  // Google's latin-ext subset is 83 KB for Inter, downloaded on every page for one character: ₹
  // (U+20B9), which is in latin-ext and not in latin. The rest is IPA extensions, Vietnamese and
  // Latin Extended Additional, none of which appears in this product.
  const budgets = {
    'public/assets/fonts/inter-latin-ext.woff2': 32 * 1024,
    'public/assets/fonts/plus-jakarta-sans-latin-ext.woff2': 18 * 1024,
  };
  for (const [path, budget] of Object.entries(budgets)) {
    const size = statSync(path).size;
    assert.ok(size <= budget,
      `${path} is ${Math.round(size / 1024)} KB, over its ${Math.round(budget / 1024)} KB budget — re-run scripts/subset-fonts.py`);
  }
});

test('the declared unicode-range still covers the rupee sign', () => {
  // A price is on every screen of this product. If ₹ falls out of the range it renders from a
  // fallback face and the prices stop matching the rest of the type.
  const rule = fontsCss.slice(fontsCss.indexOf('inter-latin-ext.woff2'));
  const range = rule.slice(rule.indexOf('unicode-range:'), rule.indexOf(';', rule.indexOf('unicode-range:')));
  const covered = range.match(/U\+([0-9A-F]{4,6})(?:-([0-9A-F]{4,6}))?/g).some((part) => {
    const [, a, b] = part.match(/U\+([0-9A-F]+)(?:-([0-9A-F]+))?/);
    const lo = parseInt(a, 16);
    const hi = b ? parseInt(b, 16) : lo;
    return 0x20b9 >= lo && 0x20b9 <= hi;
  });
  assert.ok(covered, 'U+20B9 (₹) is not in the declared unicode-range of inter-latin-ext');
});

test('the subset step is written down where the fetch script can be re-run', () => {
  const script = readFileSync('scripts/subset-fonts.py', 'utf8');
  assert.match(script, /node scripts\/fetch-fonts\.js && python3 scripts\/subset-fonts\.py/,
    'the order matters — fetch downloads the full files, subset narrows them');
  assert.match(script, /def ranges_of\(path\)/,
    'the declared range must be read from the file, or it claims glyphs that are not there');
});
