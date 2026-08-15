// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * ₹160.00 on the checkout screen, ₹168.00 on the bill.
 *
 * The storefront had one variable named `total`, computed as the sum of the line prices, and it
 * was rendered under the words "Total payable" next to the Place Order button. GST was added
 * afterwards — by the submit handler for the local record, and independently by the `public-order`
 * Edge Function for the authoritative one. A customer ordering two portions of fries agreed to
 * ₹160.00 and was charged ₹168.00, with no tax line anywhere in the cart or the checkout.
 *
 * Nothing was wrong with the arithmetic. The wrong number was on the screen.
 */

const app = readFileSync('src/views/customer/components/CustomerApp.tsx', 'utf8');
const cart = readFileSync('src/views/customer/components/CartDrawer.tsx', 'utf8');

test('the storefront separates the line-price sum from what is payable', () => {
  assert.match(app, /const subtotal = cart\.reduce\(/, 'the sum of line prices is the subtotal');
  assert.match(app, /const taxAmount = Number\(\(subtotal \* \(gstPercent \/ 100\)\)\.toFixed\(2\)\)/);
  assert.match(app, /const total = Number\(\(subtotal \+ taxAmount\)\.toFixed\(2\)\)/,
    '`total` must include tax — it is what the button charges');

  // The old shape: reduce() assigned straight to `total`. That is the bug.
  assert.doesNotMatch(app, /const total = cart\.reduce\(/);
  assert.doesNotMatch(cart, /const total = cart\.reduce\(/);
});

test('both money screens show the tax that will be charged', () => {
  for (const [name, source] of [['checkout', app], ['cart', cart]]) {
    assert.match(source, /className="store-checkout-breakdown"/, `${name} must show a breakdown`);
    assert.match(source, /<span>Subtotal<\/span>/, `${name} must show the subtotal`);
    assert.match(source, /GST \(\{gstPercent\}%\)/, `${name} must name the rate it is applying`);
  }
});

test('the cart step is given the rate rather than assuming one', () => {
  // A default of 0 in the drawer would silently under-report if the prop were ever dropped, so
  // the call site has to pass it explicitly.
  assert.match(cart, /export function CartDrawer\(\{ cart, onBack, onCheckout, gstPercent = 0 \}\)/);
  assert.match(app, /<CartDrawer\s*\n\s*cart=\{cart\}\s*\n\s*gstPercent=\{gstPercent\}/);
});

test('the order is built from the same numbers the footer displayed', () => {
  const handler = app.slice(app.indexOf('const handleValidateAndPlaceOrder'));
  const body = handler.slice(0, handler.indexOf('const { submitPublicOrder }'));

  // Re-deriving the rate inside the handler is exactly how the screen and the order drifted apart.
  assert.doesNotMatch(body, /getSetting\('gstPercent'\)/,
    'the handler must reuse the rate in state, not fetch its own');
  assert.match(body, /const tax = taxAmount;/);
  assert.match(app, /taxPercent: gstPercent,/);
});

test('the rate is resolved once, at load, into state', () => {
  assert.match(app, /const \[gstPercent, setGstPercent\] = useState\(0\)/);
  assert.match(app, /setGstPercent\(parseFloat\(gst \|\| '5'\) \|\| 0\)/);
});
