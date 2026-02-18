/// <reference lib="dom" />
import type { Page } from 'patchright';

import { log } from '../logger.js';

/**
 * Detect reCAPTCHA (v2, v3, invisible) on the page.
 * Returns sitekey + type if found, null otherwise.
 */
export async function detectRecaptcha(
  page: Page,
): Promise<{ sitekey: string; type: 'v2' | 'v3' | 'invisible' } | null> {
  log.debug('Checking for CAPTCHA on page: %s', page.url());

  // Check for reCAPTCHA / hCaptcha / Arkose iframe
  const captchaFrame = await page.$(
    'iframe[src*="recaptcha"], iframe[title*="reCAPTCHA"], iframe[src*="hcaptcha"], iframe[src*="arkoselabs"], iframe[src*="funcaptcha"]',
  );

  if (captchaFrame) {
    log.debug('Found CAPTCHA iframe');

    let sitekey: string | null = null;
    try {
      sitekey = await page.evaluate(() => {
        const div = document.querySelector('.g-recaptcha[data-sitekey]');
        if (div) return div.getAttribute('data-sitekey');

        for (const script of document.querySelectorAll('script')) {
          const m = script.textContent?.match(
            /grecaptcha\.render\([^,]+,\s*\{[^}]*sitekey:\s*['"]([^'"]+)['"]/,
          );
          if (m) return m[1];
        }

        const iframe = document.querySelector('iframe[src*="recaptcha"]') as HTMLIFrameElement;
        if (iframe?.src) {
          return new URL(iframe.src).searchParams.get('k');
        }

        return null;
      });
    } catch {
      log.debug('Could not evaluate page for sitekey (CSP may block eval)');
    }

    if (sitekey) {
      const isInvisible = !!(await page.$('.g-recaptcha[data-size="invisible"]'));
      const type = isInvisible ? 'invisible' as const : 'v2' as const;
      log.info('Detected reCAPTCHA %s (sitekey: %s...)', type, sitekey.slice(0, 12));
      return { sitekey, type };
    }
  }

  // Check for reCAPTCHA v3 (usually in inline scripts)
  try {
    const v3Sitekey = await page.evaluate(() => {
      for (const script of document.querySelectorAll('script')) {
        const m = script.textContent?.match(/grecaptcha\.execute\(['"]([^'"]+)['"]/);
        if (m) return m[1];
      }
      return null;
    });

    if (v3Sitekey) {
      log.info('Detected reCAPTCHA v3 (sitekey: %s...)', v3Sitekey.slice(0, 12));
      return { sitekey: v3Sitekey, type: 'v3' };
    }
  } catch {
    log.debug('Could not evaluate page for v3 sitekey');
  }

  log.debug('No reCAPTCHA detected');
  return null;
}
