import { Page } from 'playwright';
import { BaseBrandStrategy, AutomationResult } from '../automation/types';

export class SampleBrandStrategy extends BaseBrandStrategy {
  brandId = 'sample-brand';
  name = 'Sample Brand';

  async scrapeCollection(page: Page, url: string): Promise<string[]> {
    console.log(`[SampleBrand] Scraping collection: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    
    const productUrls = await page.$$eval('a[href*="/products/"]', (links) => 
      links.map((a) => (a as HTMLAnchorElement).href)
    );
    
    return Array.from(new Set(productUrls));
  }

  async scrapeProduct(page: Page, url: string): Promise<{
    name: string;
    variants: Array<{ name: string; available: boolean; price?: string }>;
  }> {
    console.log(`[SampleBrand] Scraping product: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    
    const name = await page.$eval('h1', (h) => h.textContent?.trim() || 'Unknown Product');
    
    const variants = await page.$$eval('.variant-option', (options) => 
      options.map((opt) => ({
        name: (opt as HTMLElement).textContent?.trim() || 'Default',
        available: !(opt as HTMLButtonElement).disabled && !opt.classList.contains('sold-out'),
        price: (opt as HTMLElement).dataset.price
      }))
    );

    if (variants.length === 0) {
      return {
        name,
        variants: [{ name: 'Default', available: true }]
      };
    }

    return { name, variants };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async submitForm(page: Page, formData: any): Promise<AutomationResult> {
    console.log(`[SampleBrand] Submitting form with data:`, formData);
    await page.goto(formData.formUrl || 'https://example.com/contact', { waitUntil: 'domcontentloaded' });
    
    await this.fillField(page, 'input[name="name"]', formData.name || 'Test User');
    await this.fillField(page, 'input[name="email"]', formData.email || 'test@example.com');
    await this.fillField(page, 'textarea[name="message"]', formData.message || 'Automated message.');
    
    await this.clickSubmit(page);

    const isSuccess = await this.waitForSuccess(page, /thank/i, ['.thank-you-message']);

    if (isSuccess) {
      return { success: true, message: 'Form submitted successfully!' };
    } else {
      return { success: false, message: 'Form submitted but success not verified.' };
    }
  }
}
