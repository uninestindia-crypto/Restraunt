import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * "After the order is completed the details go missing — they cannot see what
 * they ordered."
 *
 * A guest is identified only by the phone number they typed at checkout, and
 * that lived in React state alone. Reloading the page, or simply coming back
 * later, left the app with no number to match orders on. The account page then
 * hid order history behind sign-in anyway, so even with the orders sitting in
 * the local database there was nowhere to see them.
 */

const app = readFileSync('src/views/customer/components/CustomerApp.tsx', 'utf8');
const pages = readFileSync('src/views/customer/components/CustomerPages.tsx', 'utf8');

test('a guest is remembered on their own device', () => {
  assert.match(app, /const GUEST_CONTACT_KEY = 'taste_guest_contact'/);
  assert.match(app, /function rememberGuestContact/);
  assert.match(app, /function readGuestContact/);

  // Written when an order is actually placed with those details...
  assert.match(app, /await afterOrderCreated\(order\);\s*\n\s*rememberGuestContact\(customerName, customerPhone\);/);
  // ...restored before the first insights load...
  assert.match(app, /const remembered = readGuestContact\(\);/);
  // ...and dropped on sign-out.
  assert.match(app, /forgetGuestContact\(\);/);
});

test('a signed-in customer is never overwritten by a remembered guest', () => {
  const restore = app.slice(app.indexOf('Restore a guest'), app.indexOf('loadCustomerInsights();\n  }, [customerPhone'));
  assert.match(restore, /if \(loggedInCustomer\) return;/);
  // And it only fills a blank field, so a typed number always wins.
  assert.match(restore, /setCustomerPhone\(current => current \|\| remembered\.phone\)/);
});

test('a guest can see the orders they placed on this device', () => {
  assert.match(pages, /\{\(hasCustomer \|\| orders\.length > 0\) && \(/,
    'the orders section must open for a guest who has ordered');
  assert.match(pages, /Your orders on this device/);
});

test('what genuinely needs an account still needs one', () => {
  // Rewards, saved addresses, favourites and preferences stay behind sign-in.
  assert.match(pages, /\{hasCustomer && \(<>/);
  assert.match(pages, /'Sign in required'/);
});
