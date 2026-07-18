// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, parseOrderItems, safeCurrencySymbol, safeImageUrl } from '../src/utils/helpers';

test('escapeHtml escapes user-controlled markup', () => {
  assert.equal(
    escapeHtml('<img src=x onerror=alert(1)>"\'&'),
    '&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;'
  );
});

test('parseOrderItems accepts arrays and JSON strings', () => {
  const items = [{ itemName: 'Momos', quantity: 2 }];
  assert.deepEqual(parseOrderItems(items), items);
  assert.deepEqual(parseOrderItems(JSON.stringify(items)), items);
});

test('parseOrderItems returns empty array for invalid data', () => {
  assert.deepEqual(parseOrderItems('not-json'), []);
  assert.deepEqual(parseOrderItems(null), []);
  assert.deepEqual(parseOrderItems({ itemName: 'Loose object' }), []);
});

test('safeImageUrl blocks script and insecure remote URL schemes', () => {
  assert.equal(safeImageUrl('javascript:alert(1)', '/fallback.png'), '/fallback.png');
  assert.equal(safeImageUrl('http://example.com/a.png', '/fallback.png'), '/fallback.png');
  assert.equal(safeImageUrl('https://example.com/a.png'), 'https://example.com/a.png');
  assert.equal(safeImageUrl('/assets/dish.png'), '/assets/dish.png');
});

test('safeCurrencySymbol strips markup and control characters', () => {
  assert.equal(safeCurrencySymbol('<img src=x>', '₹'), 'img src=');
  assert.equal(safeCurrencySymbol('\u0000\u001f', '₹'), '₹');
  assert.equal(safeCurrencySymbol('$'.repeat(20), '₹'), '$'.repeat(8));
});
