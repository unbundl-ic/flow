import { Page } from 'playwright';

export interface AutomationResult {
  success: boolean;
  message: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

export interface BrandStrategy {
  brandId: string;
  name: string;
  scrapeCollection(page: Page, url: string): Promise<string[]>;
  scrapeProduct(page: Page, url: string): Promise<{
    name: string;
    variants: Array<{ name: string; available: boolean; price?: string }>;
  }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  submitForm(page: Page, formData: any): Promise<AutomationResult>;
}

export abstract class BaseBrandStrategy implements BrandStrategy {
  abstract brandId: string;
  abstract name: string;

  abstract scrapeCollection(page: Page, url: string): Promise<string[]>;
  abstract scrapeProduct(page: Page, url: string): Promise<{
    name: string;
    variants: Array<{ name: string; available: boolean; price?: string }>;
  }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  abstract submitForm(page: Page, formData: any): Promise<AutomationResult>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected async fillField(page: Page, selector: string, value: any): Promise<boolean> {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      const element = await page.$(selector);
      if (!element) return false;

      const tagName = await element.evaluate(el => el.tagName);
      const type = await element.evaluate(el => (el as HTMLInputElement).type);

      if (tagName === 'SELECT') {
        await page.selectOption(selector, String(value));
      } else if (type === 'checkbox' || type === 'radio') {
        if (value) await page.check(selector);
        else await page.uncheck(selector);
      } else {
        await page.fill(selector, String(value));
      }
      return true;
    } catch {
      return false;
    }
  }

  protected async clickSubmit(page: Page, customSelector?: string): Promise<boolean> {
    const locators = [];
    if (customSelector) locators.push(page.locator(customSelector));
    locators.push(page.getByRole('button', { name: /submit|book|appointment|send|apply|confirm|save/i }));
    locators.push(page.locator('button[type="submit"], input[type="submit"]'));

    for (const locator of locators) {
      try {
        const isVisible = await locator.isVisible();
        if (isVisible) {
          await locator.click();
          return true;
        }
      } catch { /* ignore */ }
    }
    return false;
  }

  protected async waitForSuccess(page: Page, urlRegex: RegExp, successSelectors: string[], timeout: number = 60000): Promise<boolean> {
    const startTime = Date.now();
    const initialUrl = page.url();
    console.log(`[BaseStrategy] Monitoring for success. Initial URL: ${initialUrl}`);

    while (Date.now() - startTime < timeout) {
      const currentUrl = page.url();
      
      // 1. Strict URL Change Check
      // Success if URL changed AND matches the success pattern
      if (currentUrl !== initialUrl && urlRegex.test(currentUrl)) {
        console.log(`[Success] URL change verified: ${currentUrl}`);
        return true;
      }

      // 2. Element Check
      for (const selector of successSelectors) {
        try {
          const locator = page.locator(selector);
          // Check if element is visible AND likely new (not just static text in footer)
          if (await locator.isVisible({ timeout: 500 })) {
            // For generic 'text=' selectors, we only trust them if the URL also changed or they are prominent
            console.log(`[Success] Completion element detected: ${selector}`);
            return true;
          }
        } catch { /* ignore */ }
      }

      await new Promise(r => setTimeout(r, 2000));
    }
    
    console.warn(`[BaseStrategy] Verification timed out after ${timeout}ms. Current URL: ${page.url()}`);
    return false;
  }
}
