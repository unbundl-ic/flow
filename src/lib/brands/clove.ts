import { Page } from 'playwright';
import { BaseBrandStrategy, AutomationResult } from '../automation/types';
import { solveCaptcha } from '../automation/ocr';

export interface CloveFormData {
  name?: string;
  phone?: string;
  formUrl?: string;
}

export class CloveBrandStrategy extends BaseBrandStrategy {
  brandId = 'clove-dental';
  name = 'Clove Dental';

  async scrapeCollection(): Promise<string[]> { return []; }
  async scrapeProduct(): Promise<{ name: string; variants: Array<{ name: string; available: boolean; price?: string }> }> { 
    return { name: '', variants: [] }; 
  }

  async submitForm(page: Page, formData: CloveFormData): Promise<AutomationResult> {
    const url = formData.formUrl || 'https://clovedental.in/promotion/general-dentistry-local-north.php';
    const MAX_RETRIES = 5;
    let attempts = 0;

    while (attempts < MAX_RETRIES) {
      attempts++;
      console.log(`[Clove] STARTING ATTEMPT ${attempts}/${MAX_RETRIES}`);

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await new Promise(r => setTimeout(r, 2000));

        // 1. Fill Fields
        console.log('[Clove] Filling Name & Phone...');
        await this.fillField(page, '#name', formData.name || 'Abhishek');
        await this.fillField(page, '#phone', formData.phone || '9898989898');
        
        const disclaimer = '#disclaimer-2';
        if (await page.locator(disclaimer).isVisible()) {
           await page.locator(disclaimer).check();
        }

        // 2. Resolve Captcha
        console.log('[Clove] Locating and solving captcha...');
        const captchaImgSelector = '#captcha_code1';
        const captchaLocator = page.locator(captchaImgSelector);
        
        await captchaLocator.waitFor({ state: 'visible', timeout: 10000 });
        const imageBuffer = await captchaLocator.screenshot({ type: 'png' });
        
        const { code, confidence } = await solveCaptcha(imageBuffer);
        console.log(`[Clove] Parsed Captcha: "${code}" (Confidence: ${confidence}%)`);

        if (!code || code.length < 3) {
          console.warn('[Clove] Invalid OCR result. Refreshing captcha...');
          await captchaLocator.click();
          await new Promise(r => setTimeout(r, 2000));
          continue; 
        }

        // 3. Fill Captcha
        console.log(`[Clove] Injecting code: ${code}`);
        const inputSelector = '#captcha_code';
        if (await page.locator(inputSelector).isVisible()) {
          await page.fill(inputSelector, code);
          // Force events
          await page.evaluate(({ sel, val }) => {
            const el = document.querySelector(sel) as HTMLInputElement;
            if (el) {
              el.value = val;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, { sel: inputSelector, val: code });
        }

        await new Promise(r => setTimeout(r, 1000));

        // 4. Submit
        console.log('[Clove] Clicking submission button...');
        await this.clickSubmit(page, '#callme_button');

        // 5. STRICT VERIFICATION
        // We look for specific ID that only exists on the real thank you page
        // or a URL containing 'thank' that is DIFFERENT from the initial URL.
        console.log('[Clove] Verifying lead submission...');
        const isSuccess = await this.waitForSuccess(
          page, 
          /thank/i, 
          ['.thankyou-page', '#success-message', '.thankyou-msg']
        );

        if (isSuccess) {
          console.log('[Clove] Success! Reached final confirmation page.');
          return { success: true, message: 'Lead Generation Verified!' };
        }

        console.warn(`[Clove] Attempt ${attempts} failed verification. URL is still: ${page.url()}`);
        
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[Clove] Flow Error:`, msg);
      }
      
      await new Promise(r => setTimeout(r, 3000));
    }

    return { success: false, message: `Exhausted ${MAX_RETRIES} attempts without verification.` };
  }
}
