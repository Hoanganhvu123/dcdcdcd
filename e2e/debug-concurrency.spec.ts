import { test, expect } from '@playwright/test';
import { ensureUserLoggedIn, setupApiInterception } from './test-helpers';

test('Debug Concurrency and Splitter Selectors', async ({ page }) => {
  await ensureUserLoggedIn(page, { theme: 'light' });
  await setupApiInterception(page);
  await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__openworkControl !== 'undefined');

  const result = await page.evaluate(async () => {
    const ctrl = window.__openworkControl!;
    const initialContext = ctrl.context();
    const baseRevision = initialContext.revision;

    const promises: Promise<any>[] = [];
    for (let i = 0; i < 5; i++) {
      const expectedRevision = (i === 0) ? baseRevision : baseRevision + 99;
      promises.push(
        ctrl.command({
          id: 'openwork.toggle_sidebar',
          expectedRevision,
          actor: `challenger-agent-${i}`,
        })
      );
    }

    const raw = await Promise.all(promises);
    return {
      baseRevision,
      raw,
    };
  });

  console.log('CONCURRENCY DEBUG RESULT:', JSON.stringify(result, null, 2));
});
