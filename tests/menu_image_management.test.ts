// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { menuItemImageSource, safeImageUrl } from '../src/utils/helpers';

const read = (path: string) => readFileSync(path, 'utf8');

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

/**
 * Regression cover for "the dish image cannot be changed".
 *
 * Two separate defects produced that symptom: the cloud pull dropped
 * `image_url` and wrote the mapped rows straight over the local menu (so any
 * saved picture reverted at the next hydration), and the only upload path
 * demanded a Supabase Storage write that RLS refuses without a cloud manager
 * session.
 */

test('cloud hydration carries the dish image back into the local menu', () => {
  const source = read('src/services/cloudDb.ts');

  const mapper = source.match(/function mapItemToLocal\(row: any\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(mapper, 'cloudDb must still define mapItemToLocal');
  assert.match(
    mapper,
    /imageUrl: row\.image_url/,
    'dropping image_url here blanks every dish photo on each full pull'
  );

  // The cloud has no column for a device-local image, so a pull must not eat it.
  assert.match(source, /async function preserveLocalItemImages/);
  assert.match(
    source,
    /preserveLocalItemImages\(\s*\w+\.map\(mapItemToLocal\)\s*\)/,
    'the menu_items pull must map through preserveLocalItemImages before hydrating'
  );
});

test('realtime menu updates keep a device-local dish image', () => {
  const source = read('src/services/sync.ts');
  assert.match(source, /if \(existing\?\.imageData\) localData\.imageData = existing\.imageData;/);
});

test('menu sync never publishes an image value the cloud column cannot hold', () => {
  const source = read('src/services/sync.ts');

  // menu_items.image_url is a varchar(500): an inlined data URL would make the
  // entire menu upsert fail, not just that one row.
  assert.match(source, /const MAX_REMOTE_IMAGE_URL_LENGTH = 500;/);
  assert.match(source, /image_url: toRemoteImageUrl\(item\.imageUrl\)/);

  const sanitizer = source.match(/function toRemoteImageUrl\(value: any\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(sanitizer, 'sync must still define toRemoteImageUrl');
  assert.match(sanitizer, /url\.length > MAX_REMOTE_IMAGE_URL_LENGTH/);
  assert.match(sanitizer, /\^data:/);

  const schema = read('supabase/migrations/20260628000000_initial_schema.sql');
  assert.match(
    schema,
    /image_url varchar\(500\)/,
    'if this column grows, revisit the 500-character guard in sync.ts'
  );
});

test('admin image picker optimises instead of rejecting large photos', () => {
  const source = read('src/views/admin/MenuManager.tsx');

  assert.doesNotMatch(
    source,
    /file\.size > 2 \* 1024 \* 1024/,
    'a camera photo must be downscaled, not refused'
  );
  assert.match(source, /compressImage\(file, \{ maxDimension: 1280, maxBytes: 400 \* 1024 \}\)/);

  // A refused cloud upload still has to leave the operator with a changed image.
  assert.match(source, /imageData: optimised\.dataUrl/);
  assert.match(source, /Sign in with your cloud manager account/);

  // Storage RLS only accepts writes under items/.
  assert.match(source, /`items\/\$\{Date\.now\(\)\}/);
});

test('branding uploads no longer enforce a hard file-size limit', () => {
  const source = read('src/views/admin/BrandingView.tsx');

  assert.doesNotMatch(source, /file\.size > 1024 \* 1024/);
  assert.doesNotMatch(source, /file\.size > 2 \* 1024 \* 1024/);
  assert.match(source, /compressImage\(file, limits\)/);
});

test('menuItemImageSource prefers a device-local image over the cloud link', () => {
  assert.equal(
    menuItemImageSource({ imageUrl: 'https://cdn.example/dish.jpg', imageData: PNG_DATA_URL }),
    PNG_DATA_URL
  );
  assert.equal(
    menuItemImageSource({ imageUrl: 'https://cdn.example/dish.jpg' }),
    'https://cdn.example/dish.jpg'
  );
  assert.equal(menuItemImageSource({}), '');
  assert.equal(menuItemImageSource(null), '');
});

test('menuItemImageSource rejects local values that are not real image data', () => {
  const hostile = [
    'javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'data:image/svg+xml;base64,PHN2Zz4='
  ];

  for (const value of hostile) {
    // Falls through to imageUrl rather than passing the payload on.
    assert.equal(menuItemImageSource({ imageData: value, imageUrl: '/assets/dish-momos.jpg' }), '/assets/dish-momos.jpg');
  }

  // The allow-list must stay in step with the sanitizer used at render time.
  assert.equal(safeImageUrl(PNG_DATA_URL), PNG_DATA_URL);
});
