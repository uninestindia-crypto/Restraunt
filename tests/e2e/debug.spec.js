import { test } from '@playwright/test';

test('debug storefront overflow', async ({ page }) => {
  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE] [${msg.type()}] ${msg.text()}`);
  });

  await page.goto('/#/self-order');
  await page.waitForTimeout(2000);

  const viewport = page.viewportSize();
  const width = viewport ? viewport.width : 1280;

  const elements = await page.evaluate((w) => {
    const list = [];
    const walk = (el) => {
      const rect = el.getBoundingClientRect();
      if (rect.right > w) {
        list.push({
          tagName: el.tagName,
          className: el.className,
          id: el.id,
          right: rect.right,
          width: rect.width
        });
      }
      for (let i = 0; i < el.children.length; i++) {
        walk(el.children[i]);
      }
    };
    walk(document.body);
    return list;
  }, width);

  console.log(`Overflowing elements on ${width}px viewport:`, JSON.stringify(elements, null, 2));
});

