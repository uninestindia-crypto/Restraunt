// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_MENU_ITEMS,
  buildDefaultMenuRows
} from '../scripts/provision-admin';

test('cloud menu recovery builds a complete default menu payload', () => {
  const categoryIds = new Map(DEFAULT_CATEGORIES.map((category, index) => [category.name, index + 10]));
  const rows = buildDefaultMenuRows(categoryIds, 'the-taste');

  assert.equal(rows.length, DEFAULT_MENU_ITEMS.length);
  assert.equal(rows[0].store_id, 'the-taste');
  assert.equal(rows.every(row => row.category_id && row.is_available === true), true);
});

test('admin recovery script does not embed admin credentials', () => {
  const source = fs.readFileSync(new URL('../scripts/provision-admin.js', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /const\s+ADMIN_(EMAIL|PASSWORD)\s*=/);
  assert.doesNotMatch(source, /const\s+(adminEmail|adminPassword|adminPin)\s*=\s*['"`]/i);
  assert.doesNotMatch(source, /['"`][^'"`\n]+@[^'"`\n]+\.[^'"`\n]+['"`]/);
  assert.doesNotMatch(source, /ADMIN_PIN|pinHash|pin_hash/i);
});
