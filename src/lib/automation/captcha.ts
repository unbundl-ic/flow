import { Page } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { solveImageCaptchaWithApi, isCaptchaApiConfigured } from './captcha-api';
import { solveCaptcha } from './ocr';

export type CaptchaTextConfig = {
  type: 'text';
  codeSelector: string;
  inputSelector: string;
};

export type CaptchaImageConfig = {
  type: 'image';
  /** CSS selector for captcha image. Empty = auto-detect. */
  imageSelector: string;
  /** CSS selector for captcha input. Empty = auto-detect. */
  inputSelector: string;
  /** Optional: CSS selector for refresh captcha button; clicked before capture. */
  captchaRefreshSelector?: string;
  /** Wait (ms) after clicking refresh. Default 800. */
  captchaRefreshWaitMs?: number;
  /** Wait (ms) for img to load (naturalWidth > 0). Default 5000. */
  imageLoadTimeoutMs?: number;
  /** Delay (ms) before capturing image buffer. Default 300. */
  captureDelayMs?: number;
  /** Solver: 'ocr' (default) or '2captcha'. When '2captcha', apiKey required. */
  provider?: 'ocr' | '2captcha';
  /** 2Captcha API key when provider is '2captcha'. Overrides env. */
  apiKey?: string;
};

export type CaptchaConfig = CaptchaTextConfig | CaptchaImageConfig;

const MIN_CAPTCHA_LENGTH = 3;
const MIN_CONFIDENCE = Number(process.env.CAPTCHA_MIN_CONFIDENCE) || 60;
const DEBUG_SAVE_RAW = process.env.DEBUG_CAPTCHA_RAW === '1';

/**
 * Normalize captcha solution: trim, collapse spaces, remove pipe-like chars.
 */
export function normalizeCaptchaSolution(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\u00A6|¦]/g, '')
    .trim();
}

const IMAGE_CANDIDATES = [
  'img[src*="captcha"]',
  'img[id*="captcha"]',
  'img[alt*="captcha"]',
  '.captcha img',
  '.captch_view img',
  '[class*="captcha"] img',
  'div[id*="captcha"] img',
];
const INPUT_CANDIDATES = [
  'input[name*="captcha"]',
  'input[id*="captcha"]',
  'input[placeholder*="captcha"]',
  '.captcha input[type="text"]',
  '.input_box.captcha input[type="text"]',
];

/**
 * Auto-detect captcha image and input selectors. Prefers #id when element has id.
 */
export async function detectCaptchaSelectors(
  page: Page
): Promise<{ imageSelector: string | null; inputSelector: string | null }> {
  const toSelector = (el: Element): string => {
    const id = el.id?.trim();
    if (id) return '#' + CSS.escape(id);
    return '';
  };
  let imageSelector: string | null = null;
  for (const sel of IMAGE_CANDIDATES) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.isVisible({ timeout: 500 })) {
        const el = await loc.elementHandle();
        if (el) {
          const preferred = await el.evaluate(toSelector);
          await el.dispose();
          imageSelector = preferred || sel;
          break;
        }
      }
    } catch {
      // continue
    }
  }
  let inputSelector: string | null = null;
  for (const sel of INPUT_CANDIDATES) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.isVisible({ timeout: 500 })) {
        const el = await loc.elementHandle();
        if (el) {
          const preferred = await el.evaluate(toSelector);
          await el.dispose();
          inputSelector = preferred || sel;
          break;
        }
      }
    } catch {
      // continue
    }
  }
  return { imageSelector, inputSelector };
}

const FILL_VISIBLE_TIMEOUT_MS = 8000;

/**
 * Fill captcha input: resolve nested input if needed, fill, dispatch events, retry with pressSequentially if value does not stick.
 */
export async function fillCaptchaInput(
  page: Page,
  inputSelector: string,
  solution: string
): Promise<boolean> {
  const trimmed = solution.trim();
  if (!trimmed) return false;

  const effectiveSelector = await page.evaluate(
    (selector: string): string | null => {
      const el = document.querySelector(selector);
      if (!el) return null;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return selector;
      const nested = el.querySelector('input:not([type="hidden"]), textarea');
      if (nested) {
        const id = nested.id;
        if (id) return '#' + id;
        const name = (nested as HTMLInputElement).name;
        if (name && nested.tagName === 'INPUT') return `input[name="${name}"]`;
        return selector + ' input, ' + selector + ' textarea';
      }
      return selector;
    },
    inputSelector
  );
  if (!effectiveSelector) return false;

  try {
    const locator = page.locator(effectiveSelector).first();
    await locator.waitFor({ state: 'visible', timeout: FILL_VISIBLE_TIMEOUT_MS });
    await locator.click();
    await locator.fill(trimmed);
    await locator.evaluate((el: HTMLInputElement | HTMLTextAreaElement) => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    });
    const readBack = await locator.inputValue();
    if (readBack.trim() !== trimmed) {
      await locator.clear();
      await locator.pressSequentially(trimmed);
      await locator.evaluate((el: HTMLInputElement | HTMLTextAreaElement) => {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      });
    }
    return true;
  } catch {
    return false;
  }
}

export type ResolveCaptchaImageResult = { code: string; inputSelector: string };

/**
 * Resolve captcha code from the page using config.
 * - Text: returns solution string.
 * - Image: returns { code, inputSelector } so caller can fill (inputSelector is resolved or auto-detected).
 */
export async function resolveCaptcha(
  page: Page,
  config: CaptchaConfig
): Promise<string | ResolveCaptchaImageResult> {
  if (config.type === 'text') {
    console.log('[Captcha] Resolving text captcha: codeSelector=%s', config.codeSelector);
    return resolveTextCaptcha(page, config);
  }
  console.log('[Captcha] Resolving image captcha: imageSelector=%s', config.imageSelector || '(auto-detect)');
  return resolveImageCaptcha(page, config);
}

async function resolveTextCaptcha(page: Page, config: CaptchaTextConfig): Promise<string> {
  await page.waitForSelector(config.codeSelector, { state: 'visible', timeout: 10000 });
  const raw = await page.textContent(config.codeSelector);
  const code = (raw ?? '').replace(/\D/g, '').trim();
  console.log('[Captcha] Text captcha read: length=%s', code.length);
  return code;
}

const DEFAULT_IMAGE_LOAD_TIMEOUT_MS = 5000;
const DEFAULT_CAPTURE_DELAY_MS = 300;
const DEFAULT_REFRESH_WAIT_MS = 800;

async function resolveImageCaptcha(page: Page, config: CaptchaImageConfig): Promise<ResolveCaptchaImageResult> {
  let imageSelector = config.imageSelector?.trim() ?? '';
  let inputSelector = config.inputSelector?.trim() ?? '';
  if (!imageSelector || !inputSelector) {
    const detected = await detectCaptchaSelectors(page);
    imageSelector = imageSelector || (detected.imageSelector ?? '');
    inputSelector = inputSelector || (detected.inputSelector ?? '');
  }
  if (!imageSelector || !inputSelector) {
    throw new Error('CAPTCHA image/input not found and could not be auto-detected');
  }

  const imageLoadTimeoutMs = config.imageLoadTimeoutMs ?? DEFAULT_IMAGE_LOAD_TIMEOUT_MS;
  const captureDelayMs = config.captureDelayMs ?? DEFAULT_CAPTURE_DELAY_MS;

  if (config.captchaRefreshSelector) {
    try {
      const refreshLocator = page.locator(config.captchaRefreshSelector);
      if (await refreshLocator.isVisible({ timeout: 2000 })) {
        await refreshLocator.click();
        const waitMs = config.captchaRefreshWaitMs ?? DEFAULT_REFRESH_WAIT_MS;
        await new Promise((r) => setTimeout(r, waitMs));
        console.log('[Captcha] Refreshed captcha, waited %s ms', waitMs);
      }
    } catch (e) {
      console.log('[Captcha] Refresh selector not found or click failed:', e);
    }
  }

  await page.waitForSelector(imageSelector, { state: 'visible', timeout: 10000 });

  const img = await page.$(imageSelector);
  if (!img) throw new Error('Captcha image element not found');

  try {
    const isImg = await img.evaluate((el) => el.tagName === 'IMG');
    if (isImg) {
      await page
        .waitForFunction(
          (selector: string) => {
            const el = document.querySelector(selector) as HTMLImageElement | null;
            return el != null && el.naturalWidth > 0;
          },
          imageSelector,
          { timeout: imageLoadTimeoutMs }
        )
        .catch(() => {
          console.log('[Captcha] Image load wait timed out, capturing anyway');
        });
    }
    await new Promise((r) => setTimeout(r, captureDelayMs));
  } catch (_) {
    // proceed to capture
  }

  let buffer: Buffer | null = null;

  try {
    const src = await img.evaluate((el) => (el as HTMLImageElement).src);
    if (src && !src.startsWith('data:') && (src.startsWith('http://') || src.startsWith('https://'))) {
      try {
        console.log('[Captcha] Fetching image from img.src...');
        const res = await fetch(src);
        if (res.ok) {
          const arr = new Uint8Array(await res.arrayBuffer());
          buffer = Buffer.from(arr);
          console.log('[Captcha] Fetched image buffer size = %s', buffer.length);
        }
      } catch (e) {
        console.log('[Captcha] Fetch failed, falling back to screenshot: %s', e);
        // fall through to screenshot
      }
    }
    if (!buffer || buffer.length === 0) {
      console.log('[Captcha] Using element screenshot for image buffer');
      buffer = await img.screenshot();
      console.log('[Captcha] Screenshot buffer size = %s', buffer?.length ?? 0);
    }
  } finally {
    await img.dispose();
  }

  if (!buffer || buffer.length === 0) throw new Error('Could not get captcha image buffer');

  if (DEBUG_SAVE_RAW) {
    const dataDir = path.join(process.cwd(), 'data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(path.join(dataDir, 'last_captcha_raw.png'), buffer);
    console.log('[Captcha] Debug: saved raw image to data/last_captcha_raw.png');
  }

  let rawSolution = '';
  const provider = config.provider ?? 'ocr';
  const apiKeyOverride = config.apiKey;

  if (provider === '2captcha' && apiKeyOverride?.trim()) {
    const apiCode = await solveImageCaptchaWithApi(buffer, apiKeyOverride);
    rawSolution = apiCode ? normalizeCaptchaSolution(apiCode) : '';
  } else {
    console.log('[Captcha] Running OCR on image buffer...');
    const { code, confidence } = await solveCaptcha(buffer);
    console.log('[Captcha] OCR result: code length = %s, confidence = %s%%', code?.length ?? 0, confidence);
    rawSolution = code ? normalizeCaptchaSolution(code) : '';
    const ocrValid = rawSolution.length >= MIN_CAPTCHA_LENGTH && confidence >= MIN_CONFIDENCE;
    if (ocrValid) return { code: rawSolution, inputSelector };
    if (isCaptchaApiConfigured() || apiKeyOverride?.trim()) {
      console.log('[Captcha] OCR insufficient, trying external API...');
      const apiCode = await solveImageCaptchaWithApi(buffer, apiKeyOverride ?? undefined);
      if (apiCode) rawSolution = normalizeCaptchaSolution(apiCode);
    }
  }

  if (rawSolution.length >= MIN_CAPTCHA_LENGTH) return { code: rawSolution, inputSelector };
  return { code: '', inputSelector };
}
