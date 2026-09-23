import { test, expect } from '@playwright/test';
import { ensureUserLoggedIn, setupApiInterception } from './test-helpers';

test('Check OpenWorkShell DOM and actions on /openwork', async ({ page }) => {
  await ensureUserLoggedIn(page, { theme: 'light' });
  await setupApiInterception(page);
  await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  const html = await page.evaluate(() => {
    const mainEl = document.querySelector('main');
    const shellEl = document.querySelector('.openwork-shell, [data-testid="openwork-shell"]');
    const allButtons = Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim());
    return {
      hasMain: !!mainEl,
      hasShell: !!shellEl,
      bodyClasses: document.body.className,
      buttonSample: allButtons.slice(0, 10),
      actionCount: window.__openworkControl?.listActions().length,
      actionList: window.__openworkControl?.listActions().map(a => a.id),
    };
  });

  console.log('MOUNT INFO:', JSON.stringify(html, null, 2));
});
