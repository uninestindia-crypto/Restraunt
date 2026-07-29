// @ts-nocheck
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
  STATIC_ROUTES,
  STOREFRONT_DEFAULTS,
  STOREFRONT_SETTING_KEYS,
  resolveStorefrontCopy
} from '../src/content/storefront';

const read = (path: string) => readFileSync(path, 'utf8');

/**
 * The storefront is a statically exported SPA. Until these guards existed the
 * HTML a crawler received contained a loading spinner and nothing else: no
 * dish names, no prices, no per-page titles. Everything here protects the
 * pre-rendered content path, which cannot be verified by rendering the app.
 */

test('the root page is server-rendered, not a client-only SPA mount', () => {
  const source = read('src/app/page.tsx');

  assert.doesNotMatch(
    source.split('\n')[0],
    /use client/,
    'making the root page a client component empties the exported HTML again'
  );
  assert.match(source, /<StorefrontSeoShell \/>/);
  assert.match(source, /<StorefrontJsonLd page="home" \/>/);

  // The bundle still has to boot; it just does so from a leaf component.
  assert.match(source, /<SpaBoot \/>/);
  assert.match(read('src/app/_components/SpaBoot.tsx').split('\n')[0], /use client/);
});

test('the pre-rendered menu is removed once the SPA owns the page', () => {
  const source = read('src/main.ts');
  assert.match(source, /getElementById\('storefront-seo-shell'\)\?\.remove\(\)/);
});

test('no-JS visitors are shown the menu instead of a stuck loading screen', () => {
  const source = read('src/app/page.tsx');
  assert.match(source, /<noscript>/);
  assert.match(source, /#loading-screen \{ display: none !important; \}/);
});

test('the build bakes a real catalogue into the export', () => {
  assert.ok(existsSync('src/data/menu-snapshot.json'), 'run scripts/build-menu-snapshot.js');
  const snapshot = JSON.parse(read('src/data/menu-snapshot.json'));

  assert.ok(Array.isArray(snapshot.categories) && snapshot.categories.length > 0);
  const items = snapshot.categories.flatMap(category => category.items);
  assert.ok(items.length > 0, 'the snapshot must carry orderable dishes');
  for (const item of items.slice(0, 25)) {
    assert.ok(item.name, 'every snapshot dish needs a name for the crawler');
    assert.equal(typeof item.price, 'number');
  }

  // package.json must actually run the generator, or the snapshot goes stale.
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts.build, /build-menu-snapshot\.js/);
});

test('every marketing route is statically exported with its own metadata', () => {
  const routes = [
    ['src/app/menu/page.tsx', '/menu'],
    ['src/app/offers/page.tsx', '/offers'],
    ['src/app/about/page.tsx', '/about'],
    ['src/app/catering/page.tsx', '/catering'],
    ['src/app/support/page.tsx', '/support']
  ];

  for (const [file, canonical] of routes) {
    const source = read(file);
    assert.match(source, /export const metadata: Metadata/, `${file} needs its own metadata`);
    assert.match(source, /title:/, `${file} needs a title`);
    assert.match(source, /description:/, `${file} needs a description`);
    assert.match(
      source,
      new RegExp(`canonical: '${canonical}'`),
      `${file} needs a canonical URL`
    );
    assert.doesNotMatch(source.split('\n')[0], /use client/, `${file} must stay server-rendered`);
  }
});

test('the sitemap generator and the app agree on the route list', () => {
  const script = read('scripts/build-menu-snapshot.js');
  for (const route of STATIC_ROUTES) {
    assert.match(
      script,
      new RegExp(`path: '${route.path.replace('/', '\\/')}'`),
      `${route.path} is missing from the sitemap generator`
    );
  }
  assert.match(read('public/robots.txt'), /Sitemap: https:\/\/thetaste\.in\/sitemap\.xml/);
});

test('structured data ships as build output, not runtime injection', () => {
  const source = read('src/app/_components/StorefrontJsonLd.tsx');
  assert.match(source, /application\/ld\+json/);
  assert.match(source, /'@type': 'Restaurant'/);
  assert.match(source, /'@type': 'MenuItem'/);
  assert.match(source, /'@type': 'FAQPage'/);
});

test('the export hardener still blocks executable inline scripts', () => {
  const source = read('scripts/harden-static-export.js');

  // Data blocks (ld+json) are not executed and are exempt from script-src,
  // but anything executable must still be externalized.
  assert.match(source, /function isExecutable/);
  assert.match(source, /EXECUTABLE_TYPES = \['text\/javascript', 'application\/javascript', 'module'\]/);
  assert.match(source, /Executable inline script remains in/);
});

test('storefront wording is owner-editable rather than hardcoded', () => {
  const source = read('src/views/customer/components/CustomerApp.tsx');

  assert.doesNotMatch(source, /Bold Indo-Chinese flavours, wok-tossed fresh/);
  assert.doesNotMatch(source, /The dishes Patna keeps coming back for/);
  assert.doesNotMatch(source, /<dt>30 min<\/dt>/);
  assert.match(source, /storefrontCopy\.heroCopy/);
  assert.match(source, /storefrontCopy\.proofPoints\.map/);

  const admin = read('src/views/admin/BrandingView.tsx');
  assert.match(admin, /STOREFRONT_SETTING_KEYS\.heroCopy/);
  assert.match(admin, /STOREFRONT_SETTING_KEYS\.proofPoints/);
  assert.match(admin, /STOREFRONT_SETTING_KEYS\.featuredItemIds/);
});

test('featured dishes survive a rename', () => {
  const source = read('src/views/customer/components/CustomerApp.tsx');

  // The old inline name list silently emptied the row when a dish was renamed.
  assert.doesNotMatch(source, /const names = \['Steamed Veg Momos'/);
  assert.match(source, /storefrontCopy\.featuredItemIds/);
  assert.match(source, /STOREFRONT_DEFAULTS\.featuredItemNames/);
});

test('catalogue scans are memoized instead of recomputed during render', () => {
  const source = read('src/views/customer/components/CustomerApp.tsx');

  assert.match(source, /const filteredItems = useMemo\(/);
  assert.match(source, /const featuredItems = useMemo\(/);
  assert.doesNotMatch(source, /getFilteredItems\(\)/);
  assert.doesNotMatch(source, /getFeaturedItems\(\)/);
});

test('a render failure degrades to a recoverable page, not a white screen', () => {
  const view = read('src/views/customer/CustomerView.tsx');
  assert.match(view, /<StorefrontErrorBoundary>/);

  const boundary = read('src/components/StorefrontErrorBoundary.tsx');
  assert.match(boundary, /static getDerivedStateFromError/);
  assert.match(boundary, /role="alert"/);
});

test('view changes without navigation are announced and take focus', () => {
  const source = read('src/views/customer/components/CustomerApp.tsx');

  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /heading\.focus\(\{ preventScroll: true \}\)/);
});

test('resolveStorefrontCopy falls back to shipped defaults per field', () => {
  const empty = resolveStorefrontCopy({});
  assert.equal(empty.heroCopy, STOREFRONT_DEFAULTS.heroCopy);
  assert.deepEqual(empty.proofPoints, STOREFRONT_DEFAULTS.proofPoints);
  assert.deepEqual(empty.featuredItemIds, []);

  const partial = resolveStorefrontCopy({
    [STOREFRONT_SETTING_KEYS.heroCopy]: '  Our own words  ',
    [STOREFRONT_SETTING_KEYS.menuHeadline]: '   '
  });
  assert.equal(partial.heroCopy, 'Our own words');
  assert.equal(
    partial.menuHeadline,
    STOREFRONT_DEFAULTS.menuHeadline,
    'a blank field must not render an empty heading'
  );
});

test('resolveStorefrontCopy rejects malformed stored values', () => {
  const resolved = resolveStorefrontCopy({
    [STOREFRONT_SETTING_KEYS.proofPoints]: [
      { value: '20 min', label: 'Delivery' },
      { value: '', label: 'Dropped' },
      'nonsense'
    ],
    [STOREFRONT_SETTING_KEYS.featuredItemIds]: [7, 'x', null, 9]
  });

  assert.deepEqual(resolved.proofPoints, [{ value: '20 min', label: 'Delivery' }]);
  assert.deepEqual(resolved.featuredItemIds, [7, 9]);

  // A non-array is ignored rather than crashing the hero.
  const broken = resolveStorefrontCopy({ [STOREFRONT_SETTING_KEYS.proofPoints]: 'oops' });
  assert.deepEqual(broken.proofPoints, STOREFRONT_DEFAULTS.proofPoints);
});

test('checkout submission is driven by state, not by writing into the DOM', () => {
  const source = read('src/views/customer/components/CustomerApp.tsx');

  // Poking innerHTML/disabled on the live button raced React's own renders and
  // could strand the control on "Placing Order...".
  assert.doesNotMatch(source, /submitBtn\.innerHTML/);
  assert.doesNotMatch(source, /getElementById\('btn-submit-self-order'\)/);
  assert.match(source, /disabled=\{placingOrder\}/);
  assert.match(source, /aria-busy=\{placingOrder\}/);
  assert.match(source, /setPlacingOrder\(false\);/);
});

test('customer inputs use React onChange rather than the DOM onInput event', () => {
  const files = [
    'src/views/customer/components/CustomerApp.tsx',
    'src/views/customer/components/CartDrawer.tsx',
    'src/views/customer/components/CategorySlider.tsx',
    'src/views/customer/components/ItemDetailDrawer.tsx',
    'src/views/customer/components/LoyaltyDrawer.tsx',
    'src/views/customer/components/OrderSuccessTele.tsx'
  ];

  for (const file of files) {
    assert.doesNotMatch(read(file), /onInput=\{/, `${file} still binds the raw onInput event`);
  }
});

test('the boot splash is a styled opaque overlay', () => {
  const css = read('src/styles/storefront-static.css');

  // Unstyled, it stacked above the pre-rendered menu and composited its text
  // against whatever showed through.
  assert.match(css, /#loading-screen \{[\s\S]*?position: fixed;/);
  assert.match(css, /#loading-screen \{[\s\S]*?background: #040406;/);
  assert.match(css, /#loading-screen\.hide/);
  assert.doesNotMatch(read('src/app/page.tsx'), /rgba\(148,163,184,0\.4\)/);
});

test('the SPA and the static pages share one copy source', () => {
  const spa = read('src/views/customer/components/CustomerPages.tsx');
  assert.match(spa, /import \{ STOREFRONT_PAGES \}/);

  // Divergence used to be inevitable: the same sentences were typed twice.
  assert.doesNotMatch(spa, /Comfort food, cooked with character/);
  assert.doesNotMatch(spa, /Big-table food without the fuss/);
});
