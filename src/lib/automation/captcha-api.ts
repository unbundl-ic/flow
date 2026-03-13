/**
 * External captcha solving API client (e.g. 2Captcha).
 * Used as fallback when in-house OCR returns empty or low confidence.
 * Set CAPTCHA_API_KEY (or TWOCAPTCHA_API_KEY) in env to enable.
 */

const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY ?? process.env.TWOCAPTCHA_API_KEY;
const CAPTCHA_API_ENABLED = process.env.CAPTCHA_API_ENABLED !== '0';
const POLLING_INTERVAL_MS = 5000;

/**
 * Solve image captcha via external API. Returns null if API key is not set,
 * or on error/timeout (caller can fall back to OCR failure).
 * @param apiKeyOverride - When provided, used instead of env CAPTCHA_API_KEY / TWOCAPTCHA_API_KEY.
 */
export async function solveImageCaptchaWithApi(
  imageBuffer: Buffer,
  apiKeyOverride?: string | null
): Promise<string | null> {
  const apiKey = apiKeyOverride?.trim() || CAPTCHA_API_KEY?.trim();
  if (!apiKey) {
    console.log('[Captcha-API] No API key set; skipping external solver.');
    return null;
  }
  if (!apiKeyOverride && !CAPTCHA_API_ENABLED) {
    console.log('[Captcha-API] Disabled via CAPTCHA_API_ENABLED=0.');
    return null;
  }

  try {
    const { Solver } = await import('@2captcha/captcha-solver');
    const solver = new Solver(apiKey, POLLING_INTERVAL_MS);
    const body = imageBuffer.toString('base64');

    const res = await solver.imageCaptcha({
      body,
      numeric: 1, // 1 = digits only
      min_len: 3,
      max_len: 8,
    });

    const text = typeof res === 'string' ? res : (res && typeof (res as { data?: string }).data === 'string' ? (res as { data: string }).data : null);
    if (text && text.trim().length > 0) {
      const code = text.replace(/\D/g, '').trim();
      console.log('[Captcha-API] Solved:', code.length, 'digits');
      return code;
    }
    return null;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Captcha-API] Solve failed:', msg);
    return null;
  }
}

export function isCaptchaApiConfigured(): boolean {
  return Boolean(CAPTCHA_API_KEY?.trim() && CAPTCHA_API_ENABLED);
}
