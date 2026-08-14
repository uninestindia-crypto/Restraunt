import { test, expect } from '@playwright/test';

/**
 * A dish with no photograph.
 *
 * The storefront used to show one of nine stock photos picked by category, momos as the catch-all.
 * On a menu a picture reads as a description of the food, so an unrelated plate above a dish name
 * is a claim that is not true — and it masked the real problem, that the operator's upload had
 * never reached Storage. The replacement has to look deliberate, hold the same box, and stay
 * legible.
 */
test('a dish with no photo shows a deliberate panel, not a stock photo', async ({ page }) => {
  await page.goto('/#/self-order');
  await page.waitForTimeout(1500);

  // Measured against what the real menu renders, not an injected fixture — the seeded
  // catalogue has no photographs, so every card is a placeholder.
  const panels = page.locator('.dish-placeholder--card');
  expect(await panels.count()).toBeGreaterThan(0);
  const panel = panels.first();
  await expect(panel).toBeVisible();

  const measured = await panel.evaluate((el) => {
    const initial = el.querySelector('.dish-placeholder-initial') as HTMLElement;
    const box = el.getBoundingClientRect();
    return {
      ratio: box.width / box.height,
      width: box.width,
      height: box.height,
      bg: getComputedStyle(el).backgroundColor,
      ink: getComputedStyle(initial).color,
      fontPx: parseFloat(getComputedStyle(initial).fontSize),
      initialVisible: initial.getBoundingClientRect().width > 0,
      // The card is vertical on a wide screen (panel is the top slot, sized by its ratio)
      // and horizontal on a phone (panel is a column, sized by the card's height).
      cardBox: (el.parentElement as HTMLElement).getBoundingClientRect().toJSON()
    };
  });

  // The invariant is "fill the slot you are in". Asserting a fixed ratio would be asserting a
  // CSS value rather than a property: the card is vertical on a desktop, horizontal on a phone,
  // and the featured tile is a third shape again. What must hold everywhere is that the panel
  // occupies its whole slot, so no dead space appears where a photograph would have been.
  expect(measured.width).toBeGreaterThanOrEqual(measured.cardBox.width - 2);
  expect(measured.height).toBeGreaterThan(40);

  expect(measured.initialVisible).toBe(true);
  expect(measured.fontPx).toBeGreaterThanOrEqual(32);

  // The initial must clear 3:1 against its own panel — it is large text.
  const contrast = await page.evaluate(({ bg, ink }) => {
    const parse = (c: string) => (c.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
    const lum = (rgb: number[]) => {
      const [r, g, b] = rgb.map(v => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const a = lum(parse(bg)), b = lum(parse(ink));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }, measured);

  expect(contrast, `initial contrast ${contrast.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
});

test('no stock dish photo is referenced by the storefront any more', async ({ page }) => {
  await page.goto('/menu');
  const html = await page.content();
  expect(html).not.toMatch(/assets\/dish-(momos|starters|noodles|rice|main|burgers|sides|beverages|desserts)\.jpg/);
});
