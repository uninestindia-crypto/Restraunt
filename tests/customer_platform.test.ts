// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCustomerFavoritesFromOrders, FALLBACK_OFFERS, getOrderTrackingState, RETENTION_PREFERENCES } from '../src/services/customerPlatform';

test('order tracking maps kitchen and delivery states to a customer timeline', () => {
  assert.equal(getOrderTrackingState({ status: 'confirmed' }).activeKey, 'accepted');
  assert.equal(getOrderTrackingState({ status: 'preparing' }).activeKey, 'cooking');
  assert.equal(getOrderTrackingState({ status: 'ready' }).activeKey, 'ready');
  assert.equal(getOrderTrackingState({ type: 'delivery', deliveryStatus: 'out_for_delivery' }).activeKey, 'delivery');
  assert.equal(getOrderTrackingState({ status: 'completed' }).canReview, true);
});

test('customer favourites are derived safely from historical order item shapes', () => {
  const favorites = buildCustomerFavoritesFromOrders([
    { items: JSON.stringify([{ itemId: 1, itemName: 'Momos', quantity: 2 }]) },
    { items: [{ itemId: 1, itemName: 'Momos', quantity: 1 }, { itemName: 'Noodles', quantity: 1 }] },
  ]);
  assert.equal(favorites[0].itemName, 'Momos');
  assert.equal(favorites[0].count, 3);
  assert.equal(favorites[1].itemName, 'Noodles');
});

test('fallback offers are display-only and preserve server-authority language', () => {
  assert.ok(FALLBACK_OFFERS.length >= 3);
  assert.ok(FALLBACK_OFFERS.every(offer => offer.code && offer.source === 'local'));
  assert.ok(FALLBACK_OFFERS.some(offer => /server/i.test(offer.displayValue)));
});

test('retention preferences define consent surfaces without sending automation', () => {
  const keys = RETENTION_PREFERENCES.map(pref => pref.key);
  assert.ok(keys.includes('whatsapp_updates'));
  assert.ok(keys.includes('abandoned_cart'));
  assert.ok(RETENTION_PREFERENCES.every(pref => pref.channel));
});
