// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, parseOrderItems } from '../src/utils/helpers';

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
