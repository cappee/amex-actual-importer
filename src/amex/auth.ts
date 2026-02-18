import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { chromium, type Browser, type BrowserContext, type Page } from 'patchright';

import { config } from '../config.js';
import { log } from '../logger.js';
import { detectRecaptcha } from '../services/captcha.js';

import { waitForAmexVerificationCode } from './imap-otp.js';

// ── Constants ────────────────────────────────────────────────────────
const AMEX_LOGIN_URL = 'https://www.americanexpress.com/it-it/account/login';
const AMEX_DASHBOARD_URL = 'https://global.americanexpress.com/dashboard';
const LOGIN_TIMEOUT_MS = 60_000;

// ── Errors ───────────────────────────────────────────────────────────
export class AuthFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthFailedError';
  }
}

// ── Types ────────────────────────────────────────────────────────────
export interface AmexBrowser {
  page: Page;
  context: BrowserContext;
  browser: Browser;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Wait for one of several possible login outcomes.
 */
async function waitForLoginOutcome(
  page: Page,
  timeout: number,
): Promise<'2fa' | 'dashboard' | 'myca' | 'activity' | 'error'> {
  const result = await Promise.race([
    page
      .waitForSelector('[data-testid="challenge-options-list"]', { timeout })
      .then(() => '2fa' as const),
    page
      .waitForURL('**/dashboard**', { timeout })
      .then(() => 'dashboard' as const),
    page
      .waitForURL('**/myca/**', { timeout })
      .then(() => 'myca' as const),
    page
      .waitForURL('**/activity**', { timeout })
      .then(() => 'activity' as const),
    page
      .waitForSelector('h1:has-text("Verifica la tua identità")', { timeout })
      .then(() => '2fa' as const),
    page
      .waitForSelector('[data-testid="login-message-container"]', { timeout })
      .then(() => 'error' as const),
  ]);

  if (result === 'error') {
    const el = await page.$('[data-testid="login-message-container"]');
    const text = el ? await el.textContent() : 'Unknown login error';
    throw new AuthFailedError(text?.trim() || 'Invalid username or password');
  }

  return result;
}

function saveStorageState(context: BrowserContext, authJsonPath: string): void {
  context.storageState({ path: authJsonPath }).then(() => {
    log.debug('Saved storageState');
  }).catch(() => {
    log.debug('Could not save storageState');
  });
}

// ── Login ────────────────────────────────────────────────────────────

/**
 * Open a browser, log into Amex, and return the live page/context/browser.
 * The caller is responsible for closing the browser via closeAmexSession().
 */
export async function openAmexSession(): Promise<AmexBrowser> {
  const { username, password } = config.amex;
  const authJsonPath = resolve(config.authJsonPath);
  log.info('Starting Amex login flow...');

  const launchOptions: Parameters<typeof chromium.launch>[0] = {
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  };
  if (config.proxyUrl) {
    log.info('Using proxy: %s', config.proxyUrl);
    launchOptions.proxy = { server: config.proxyUrl };
  }

  const browser = await chromium.launch(launchOptions);

  try {
    const contextOptions: Parameters<typeof browser.newContext>[0] = {
      viewport: { width: 1280, height: 720 },
      screen: { width: 1920, height: 1080 },
      locale: 'it-IT',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    };
    if (existsSync(authJsonPath)) {
      log.info('Loading storageState from %s...', authJsonPath);
      contextOptions.storageState = authJsonPath;
    }

    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();

    // Navigate to login
    log.info('Navigating to login page...');
    await page.goto(AMEX_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // Cookie banner
    try {
      const btn = await page.waitForSelector(
        '#user-consent-management-granular-banner-accept-all-button',
        { timeout: 5000 },
      );
      if (btn) {
        await btn.click();
        await page.waitForTimeout(1000);
        log.debug('Accepted cookie banner');
      }
    } catch {
      // no banner
    }

    // Wait for login form
    await page.waitForSelector('#eliloUserID', { timeout: 30_000 });
    await page.waitForTimeout(5000);

    // Check for CAPTCHA (detect only — throw if found)
    const preCaptcha = await detectRecaptcha(page);
    if (preCaptcha) {
      throw new AuthFailedError(
        'CAPTCHA detected on login page. Use a residential proxy to avoid CAPTCHAs.',
      );
    }

    // Fill credentials
    log.info('Entering credentials...');
    await page.fill('#eliloUserID', username);
    await page.fill('#eliloPassword', password);

    // Submit
    log.info('Clicking login button...');
    await page.click('#loginSubmit');
    await page.waitForTimeout(5000);

    // Check for CAPTCHA after submit
    const postCaptcha = await detectRecaptcha(page);
    if (postCaptcha) {
      throw new AuthFailedError(
        'CAPTCHA appeared after login. Use a residential proxy to avoid CAPTCHAs.',
      );
    }

    // Wait for login result
    log.info('Waiting for login result...');
    let is2FAPage = false;

    try {
      const result = await waitForLoginOutcome(page, LOGIN_TIMEOUT_MS);
      log.info('Login result: %s', result);
      is2FAPage = result === '2fa';
    } catch (e) {
      if (e instanceof AuthFailedError) throw e;
      // Timeout — check if it's a 2FA page by URL
      const url = page.url();
      if (url.includes('verification') || url.includes('challenge') || url.includes('authenticate')) {
        is2FAPage = true;
      } else {
        throw new AuthFailedError('Login timed out. URL: ' + url);
      }
    }

    let currentUrl = page.url();
    if (
      !is2FAPage &&
      (currentUrl.includes('verification') ||
        currentUrl.includes('challenge') ||
        currentUrl.includes('authenticate'))
    ) {
      is2FAPage = true;
    }

    // ── 2FA flow ─────────────────────────────────────────────────────
    if (is2FAPage) {
      log.info('2FA verification required, selecting email...');

      const codeRequestTime = new Date();

      // Select email option
      const emailOption = await page.$(
        'button[data-testid="option-button"]:has-text("e-mail")',
      );
      if (!emailOption) throw new AuthFailedError('Could not find email verification option');
      await emailOption.click();
      await page.waitForTimeout(2000);

      // Wait for OTP via IMAP
      log.info('Waiting for OTP email...');
      const otp = await waitForAmexVerificationCode(codeRequestTime, 120_000);
      if (!otp) throw new AuthFailedError('Timeout waiting for verification email');

      log.info('Got OTP, entering code...');

      // Fill OTP
      const otpSelectors = [
        'input[data-testid="question-value"]',
        'input[autocomplete="one-time-code"]',
        'input#question-value',
        'input[type="tel"]',
        'input[type="text"][maxlength="6"]',
        'input[name*="otp"]',
        'input[name*="code"]',
      ];

      let filled = false;
      for (const sel of otpSelectors) {
        const el = await page.$(sel);
        if (el) {
          await el.fill(otp);
          filled = true;
          break;
        }
      }

      if (!filled) {
        const digits = await page.$$('input[type="tel"][maxlength="1"]');
        if (digits.length === 6) {
          for (let i = 0; i < 6; i++) await digits[i].fill(otp[i]);
        } else {
          throw new AuthFailedError('Could not find OTP input field');
        }
      }

      // Submit OTP
      for (const sel of [
        'button[data-testid="continue-button"]',
        'button[type="submit"]',
        'button:has-text("Verifica")',
        'button:has-text("Continua")',
      ]) {
        const btn = await page.$(sel);
        if (btn) {
          await btn.click();
          break;
        }
      }

      await page.waitForTimeout(3000);

      // Check for OTP error
      const otpError = await page.$('[data-testid="error-message"], .error-message, [role="alert"]');
      if (otpError) {
        const errorText = await otpError.textContent();
        throw new AuthFailedError(`OTP verification failed: ${errorText?.trim()}`);
      }

      // Try to trust this device (avoids 2FA next time)
      log.info('OTP verified, checking for trust device page...');
      try {
        await Promise.race([
          page.waitForURL('**/dashboard**', { timeout: 10_000 }),
          page.waitForURL('**/myca/**', { timeout: 10_000 }),
          page.waitForURL('**/activity**', { timeout: 10_000 }),
          (async () => {
            for (const sel of [
              'button[data-testid="trust-this-device"]',
              'button:has-text("Ricorda questo dispositivo")',
              'button:has-text("Trust this device")',
              'button:has-text("Sì, ricorda")',
              'button:has-text("Continua")',
            ]) {
              const btn = await page.$(sel);
              if (btn) {
                log.info('Found trust device button, clicking...');
                await btn.click();
                await page.waitForTimeout(3000);
                return;
              }
            }
            await new Promise(r => setTimeout(r, 10_000));
          })(),
        ]);
      } catch {
        log.debug('Trust device step timed out, navigating to dashboard...');
      }

      // Ensure we land on dashboard
      currentUrl = page.url();
      if (!currentUrl.includes('dashboard') && !currentUrl.includes('myca') && !currentUrl.includes('activity')) {
        try {
          await page.goto(AMEX_DASHBOARD_URL, {
            waitUntil: 'networkidle',
            timeout: LOGIN_TIMEOUT_MS,
          });
        } catch {
          log.debug('Dashboard navigation after 2FA timed out');
        }
        await page.waitForTimeout(3000);
        currentUrl = page.url();
      }
    }

    // ── Verify login success ─────────────────────────────────────────
    const parsedUrl = new URL(currentUrl);
    const pathName = parsedUrl.pathname;
    const isLoggedIn =
      (pathName.includes('/dashboard') ||
        pathName.includes('/myca') ||
        pathName.includes('/activity')) &&
      !pathName.includes('/login');

    if (!isLoggedIn) {
      if (pathName.includes('/login')) {
        throw new AuthFailedError(
          'Login failed — still on login page after auth flow. URL: ' + currentUrl,
        );
      }
      throw new AuthFailedError('Login failed — unexpected redirect to ' + currentUrl);
    }

    log.info('Login successful!');

    // Save storageState (async, non-blocking)
    saveStorageState(context, authJsonPath);

    // Navigate to dashboard if not already there
    if (!currentUrl.includes('dashboard')) {
      try {
        await page.goto(AMEX_DASHBOARD_URL, {
          waitUntil: 'networkidle',
          timeout: LOGIN_TIMEOUT_MS,
        });
      } catch {
        log.debug('Dashboard navigation timed out');
      }
    }

    return { page, context, browser };
  } catch (err) {
    await browser.close();
    throw err;
  }
}

/**
 * Save storageState and close the browser.
 */
export async function closeAmexSession(session: AmexBrowser): Promise<void> {
  const authJsonPath = resolve(config.authJsonPath);
  try {
    await session.context.storageState({ path: authJsonPath });
    log.debug('Saved storageState on close');
  } catch {
    log.debug('Could not save storageState on close');
  }
  await session.browser.close();
  log.info('Browser closed');
}
