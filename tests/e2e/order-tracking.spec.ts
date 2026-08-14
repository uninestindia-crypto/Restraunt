import { test, expect } from '@playwright/test';

/**
 * The six order-tracking steps, on a phone.
 *
 * A screenshot from a 360px Android showed "Received", "Accepted" and "Cooking" printed on top of
 * one another, and "On the way" broken across three lines. Six equal columns at that width leave
 * roughly 52px per step, which no label fits in.
 *
 * The grid items themselves never overlap — the grid guarantees that — so measuring their
 * rectangles proves nothing. What overlapped was the *text*, overflowing a box too narrow to hold
 * it. This measures that: content must fit inside its own step.
 */
test('order tracking labels fit inside their step', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/#/self-order');
  await page.waitForTimeout(1200);

  await page.evaluate(() => {
    const steps = ['Received', 'Accepted', 'Cooking', 'Ready', 'On the way', 'Completed'];
    const host = document.createElement('div');
    host.className = 'storefront-shell';
    host.innerHTML = `<div class="customer-tracking-timeline">${steps
      .map(s => `<div class="customer-tracking-step"><span>x</span>${s}</div>`)
      .join('')}</div>`;
    document.body.appendChild(host);
  });

  const overflowing = await page.locator('.customer-tracking-step').evaluateAll(els =>
    els
      .filter(e => e.scrollWidth > e.clientWidth + 1)
      .map(e => `${e.textContent?.trim()} (needs ${e.scrollWidth}px, has ${e.clientWidth}px)`)
  );
  expect(overflowing, `labels overflow their step: ${overflowing.join(', ')}`).toEqual([]);

  // Every step also needs a usable width, or the label wraps to one character per line.
  const widths = await page.locator('.customer-tracking-step').evaluateAll(els =>
    els.map(e => e.getBoundingClientRect().width)
  );
  expect(widths.length).toBe(6);
  expect(Math.min(...widths)).toBeGreaterThanOrEqual(90);

  const scrolls = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(scrolls, 'the tracking row must not push the page sideways').toBe(false);
});
