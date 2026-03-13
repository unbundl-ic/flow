import { Page } from 'playwright';
import { BaseBrandStrategy, AutomationResult } from '../automation/types';
import { ShopifyEngine } from '../automation/shopify-engine';

/** Try to get product URLs from Shopify collection JSON endpoint when DOM returns 0. */
async function fetchCollectionProductUrls(collectionPageUrl: string): Promise<string[]> {
  try {
    const parsed = new URL(collectionPageUrl);
    const pathname = parsed.pathname.replace(/\/$/, '');
    const match = pathname.match(/\/collections\/([^/]+)/);
    if (!match) return [];
    const handle = match[1];
    const jsonUrl = `${parsed.origin}/collections/${handle}/products.json`;
    const res = await fetch(jsonUrl, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json() as { products?: Array<{ handle?: string }> };
    const products = data?.products;
    if (!Array.isArray(products) || products.length === 0) return [];
    const urls = products
      .map((p) => (p && typeof p.handle === 'string' ? p.handle : null))
      .filter((h): h is string => h != null)
      .map((h) => `${parsed.origin}/products/${h}`);
    return Array.from(new Set(urls));
  } catch {
    return [];
  }
}

export class ShopifyBrandStrategy extends BaseBrandStrategy {
  brandId = 'shopify-dynamic';
  name = 'Shopify Dynamic Engine';

  async scrapeCollection(page: Page, url: string): Promise<string[]> {
    const minProductLinks = 3;
    const maxWaitMs = 25000;
    const pollIntervalMs = 500;

    console.log(`[Shopify-Engine] Navigating to collection: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for product grid to render: poll until at least N product links exist (e.g. Saral Home injects grid after "fetching data to inject")
    const start = Date.now();
    let count = 0;
    while (Date.now() - start < maxWaitMs) {
      count = await page.$$eval('a[href*="/products/"]', (els) => els.length);
      if (count >= minProductLinks) break;
      await page.waitForTimeout(pollIntervalMs);
    }

    if (count === 0) {
      console.log('[Shopify-Engine] DOM returned 0 links; trying collection JSON.');
      const jsonUrls = await fetchCollectionProductUrls(url);
      if (jsonUrls.length > 0) {
        console.log(`[Shopify-Engine] Collection JSON returned ${jsonUrls.length} product URLs.`);
        return jsonUrls;
      }
      console.log('[Shopify-Engine] Collection JSON failed or empty.');
      console.log('[Shopify-Engine] No product URLs from DOM or collection JSON.');
      return [];
    }

    // Longer settle for lazy-loaded or late-injected product cards (e.g. 2.5s)
    await page.waitForTimeout(2500);

    const productUrls = await page.$$eval('a[href*="/products/"]', (links) =>
      links.map((a) => (a as HTMLAnchorElement).href)
    );

    const unique = Array.from(new Set(productUrls)).filter(link => !link.includes('collections'));

    if (unique.length > 0) {
      console.log(`[Shopify-Engine] Found ${unique.length} product links from DOM.`);
      return unique;
    }

    // DOM had links in poll but none after filter; try JSON fallback
    console.log('[Shopify-Engine] DOM returned 0 links after filter; trying collection JSON.');
    const jsonUrls = await fetchCollectionProductUrls(url);
    if (jsonUrls.length > 0) {
      console.log(`[Shopify-Engine] Using collection JSON fallback; found ${jsonUrls.length} product URLs.`);
      return jsonUrls;
    }
    console.log('[Shopify-Engine] Collection JSON failed or empty.');
    console.log('[Shopify-Engine] No product URLs from DOM or collection JSON.');
    return [];
  }

  async scrapeProduct(page: Page, url: string): Promise<{
    name: string;
    variants: Array<{ name: string; available: boolean; price?: string }>;
  }> {
    console.log(`[Shopify-Engine] Analyzing: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    const name = await page.$eval('h1', el => el.textContent?.trim() || 'Unknown Product').catch(() => 'Unknown Product');

    // Use the ported clustering logic
    const elements = await ShopifyEngine.collectViewportElements(page);
    const info = await ShopifyEngine.extractElementInfo(elements);
    const clusters = ShopifyEngine.clusterElements(info);
    const variantGroups = ShopifyEngine.extractVariantGroups(clusters);
    const combinations = ShopifyEngine.generateCombinations(variantGroups);

    console.log(`[Shopify-Engine] Found ${variantGroups.length} variant groups and ${combinations.length} total combinations.`);

    const results: Array<{ name: string; available: boolean; price?: string }> = [];

    // If no combinations found, just check the base page
    if (combinations.length === 0) {
      const status = await ShopifyEngine.checkStockState(page);
      return { name, variants: [{ name: 'Default', available: status === 'inStock' }] };
    }

    // Limit combinations to prevent long runs in prototype
    for (const combo of combinations.slice(0, 20)) {
      try {
        const comboName = combo.map(o => o.text).join(' / ');
        
        // Click each variant option in the combination
        for (const option of combo) {
          await option.elementHandle.click({ force: true });
          await page.waitForTimeout(500);
        }

        await page.waitForTimeout(1000);
        const status = await ShopifyEngine.checkStockState(page);
        
        results.push({
          name: comboName,
          available: status === 'inStock'
        });
      } catch (err) {
        console.warn(`[Shopify-Engine] Combo failed:`, err);
      }
    }

    return { name, variants: results };
  }

  async submitForm(): Promise<AutomationResult> {
    return { success: false, message: 'Form submission not supported by Shopify Dynamic Engine.' };
  }
}
