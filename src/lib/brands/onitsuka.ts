import { Page } from 'playwright';
import { BaseBrandStrategy, AutomationResult } from '../automation/types';

export class OnitsukaTigerBrandStrategy extends BaseBrandStrategy {
  brandId = 'onitsuka-tiger';
  name = 'Onitsuka Tiger';

  async scrapeCollection(page: Page, url: string): Promise<string[]> {
    console.log(`[Onitsuka] Navigating to collection: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(10000);

    // Wait for the grid to render
    await page.waitForSelector('.product-item-info, .product-item-link', { timeout: 15000 }).catch(() => {
        console.warn('[Onitsuka] Collection grid not found within timeout.');
    });

    // Extract all product links
    const productUrls = await page.$$eval('a.product-item-link', (links) => 
      links.map((a) => (a as HTMLAnchorElement).href)
    );
    
    const uniqueUrls = Array.from(new Set(productUrls)).filter(link => link.includes('.html'));
    console.log(`[Onitsuka] Found ${uniqueUrls.length} products.`);
    return uniqueUrls;
  }

  async scrapeProduct(page: Page, url: string): Promise<{
    name: string;
    variants: Array<{ name: string; available: boolean; price?: string }>;
  }> {
    console.log(`[Onitsuka] Scraping product: ${url}`);
    
    // 1. Navigate and wait for content
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(10000);

    // 2. Wait for the main product info container
    const infoSelector = '.product-info-main';
    await page.waitForSelector(infoSelector, { timeout: 15000 }).catch(() => {
        console.warn('[Onitsuka] Product info container not found within timeout.');
    });

    // 3. WAIT FOR VARIANTS TO SETTLE (Classes like 'out-of-stock' or 'disabled' added via JS)
    console.log('[Onitsuka] Waiting for variants to settle...');
    const swatchSelector = '.swatch-attribute.footwear_size .swatch-option, .ot-size-swatches .swatch-option';
    
    try {
      // Wait until at least one swatch has a status class OR wait for 5s max
      await page.waitForFunction((selector) => {
        const swatches = document.querySelectorAll(selector);
        if (swatches.length === 0) return false;
        
        // Return true if at least one swatch is disabled/out-of-stock (indicating JS has run)
        // OR if a reasonable time has passed (we handle that with timeout)
        return Array.from(swatches).some(s => 
          s.classList.contains('out-of-stock') || 
          s.classList.contains('disabled') || 
          s.getAttribute('aria-disabled') === 'true'
        );
      }, swatchSelector, { timeout: 10000 });
    } catch (e) {
      console.log('[Onitsuka] Swatches did not show "out-of-stock" within timeout, assuming all might be available or JS is slow.');
    }

    // 4. Get the product title
    const name = await page.$eval('h1.page-title', (h) => h.textContent?.trim() || 'Unknown Product').catch(() => 'Unknown Product');
    
    // 5. Extract variants
    const variants = await page.$$eval(swatchSelector, (options) => 
      options.map((opt) => {
        const el = opt as HTMLElement;
        const label = el.getAttribute('data-option-label') || el.textContent?.trim() || '';
        const price = el.getAttribute('data-final-child-product-price') || '';
        
        // Availability check based on multiple possible indicators:
        const hasOutOfStockClass = el.classList.contains('out-of-stock');
        const hasDisabledClass = el.classList.contains('disabled');
        const isAriaDisabled = el.getAttribute('aria-disabled') === 'true';
        
        const isUnavailable = hasOutOfStockClass || hasDisabledClass || isAriaDisabled;
        
        return {
          name: label,
          available: !isUnavailable,
          price: price
        };
      })
    );

    console.log(`[Onitsuka] Product: ${name} | Variants found: ${variants.length} | Available: ${variants.filter(v => v.available).length}`);
    return { name, variants };
  }

  async submitForm(): Promise<AutomationResult> {
    return { success: false, message: 'Form submission not implemented for Onitsuka Tiger.' };
  }
}
