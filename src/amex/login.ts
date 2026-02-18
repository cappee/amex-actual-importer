import { resolve } from 'node:path';

import { chromium } from 'patchright';

import { config } from '../config.js';

/**
 * Opens a headed browser for the user to log in manually.
 * Saves cookies to amex.json for headless sessions.
 */
export async function runLogin(): Promise<void> {
  const authJsonPath = resolve(config.authJsonPath);

  console.log('');
  console.log('=== Amex Manual Login ===');
  console.log('');
  console.log('A browser window will open to the Amex login page.');
  console.log('Please log in manually (including 2FA if prompted).');
  console.log('Once you reach the dashboard, the cookies will be saved automatically.');
  console.log('');

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    screen: { width: 1920, height: 1080 },
    locale: 'it-IT',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  await page.goto('https://www.americanexpress.com/it-it/account/login');

  console.log('Waiting for you to complete login (timeout: 5 minutes)...');
  console.log('');

  // Wait for user to reach dashboard/myca/activity (5 min timeout)
  try {
    await Promise.race([
      page.waitForURL('**/dashboard**', { timeout: 300_000 }),
      page.waitForURL('**/myca/**', { timeout: 300_000 }),
      page.waitForURL('**/activity**', { timeout: 300_000 }),
    ]);
  } catch {
    console.error('Timeout: login was not completed within 5 minutes.');
    await browser.close();
    process.exit(1);
  }

  // Give time for all cookies to settle
  await page.waitForTimeout(3000);

  // Save storageState
  await context.storageState({ path: authJsonPath });

  await browser.close();

  console.log('');
  console.log(`amex.json saved to: ${authJsonPath}`);
  console.log('');
}
