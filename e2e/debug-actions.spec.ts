import { test, expect } from '@playwright/test';
import { ensureUserLoggedIn, setupApiInterception } from './test-helpers';

test('List registered actions on /openwork', async ({ page }) => {
  await ensureUserLoggedIn(page, { theme: 'light' });
  await setupApiInterception(page);
  await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__openworkControl !== 'undefined');
  await page.waitForTimeout(500);

  const info = await page.evaluate(() => {
    const ctrl = window.__openworkControl!;
    const actions = ctrl.listActions();
    const snapshot = ctrl.snapshot();
    const context = ctrl.context();
    return {
      route: snapshot.route,
      actionIds: actions.map(a => a.id),
      actionsCount: actions.length,
    };
  });

  console.log('REGISTERED ACTIONS INFO:', JSON.stringify(info, null, 2));
});
