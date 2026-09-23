#!/usr/bin/env node
/**
 * challenger-m2-playwright-live.mjs
 *
 * Live browser empirical verification of Milestone 2 deliverables on http://127.0.0.1:3000
 */

import { chromium } from 'playwright';
import assert from 'node:assert/strict';

console.log('================================================================');
console.log('🌐 CHALLENGER 1 (M2): LIVE PLAYWRIGHT EMPIRICAL VERIFICATION');
console.log('================================================================\n');

async function runLiveVerification() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push(err.message);
  });

  try {
    console.log('1. Navigating to http://127.0.0.1:3000...');
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
        return route.abort();
      }
      return route.continue();
    });

    const response = await page.goto('http://127.0.0.1:3000', {
      waitUntil: 'commit',
      timeout: 10000,
    });
    assert.equal(response.status(), 200, 'Page status must be 200');

    await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Filter non-critical resource errors if any (e.g. missing favicon, aborted external fonts)
    const severeErrors = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('404') && !e.includes('connect ECONNREFUSED') && !e.includes('ERR_FAILED') && !e.includes('fonts')
    );
    console.log(`Console error count: ${severeErrors.length}`);
    assert.equal(severeErrors.length, 0, `Page must not produce severe errors: ${severeErrors.join('; ')}`);

    // Verify root is populated
    const rootHtml = await page.$eval('#root', (el) => el.innerHTML);
    assert.ok(rootHtml && rootHtml.length > 50, 'Root element must be populated with app UI');
    console.log('✅ UI successfully hydrated and rendered in live browser');

    // Verify key CSS tokens are loaded into document
    const cssEvaluated = await page.evaluate(() => {
      let foundLegalRules = 0;
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const rules = sheet.cssRules || sheet.rules;
          if (!rules) continue;
          for (const rule of Array.from(rules)) {
            if (rule.selectorText && (
              rule.selectorText.includes('legal-think') ||
              rule.selectorText.includes('legal-law') ||
              rule.selectorText.includes('legal-ask') ||
              rule.selectorText.includes('legal-cite')
            )) {
              foundLegalRules++;
            }
          }
        } catch {
          // Cross-origin stylesheet security restrictions
        }
      }
      return { foundLegalRules };
    });

    console.log(`✅ Loaded legal CSS rules count: ${cssEvaluated.foundLegalRules}`);
    assert.ok(cssEvaluated.foundLegalRules > 0, 'openwork-legal.css rules must be actively present in browser DOM');

    console.log('✅ Live browser empirical verification PASSED flawlessly.');
  } finally {
    await browser.close();
  }
}

runLiveVerification().catch((err) => {
  console.error('❌ Live Playwright verification failed:', err);
  process.exit(1);
});
