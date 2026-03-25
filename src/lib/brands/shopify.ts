import { Page } from 'playwright';
import { BaseBrandStrategy, AutomationResult } from '../automation/types';
import { ShopifyEngine } from '../automation/shopify-engine';

/** Fetch all product URLs from Shopify collection JSON endpoint with pagination. */
async function fetchCollectionProductUrls(collectionPageUrl: string): Promise<string[]> {
  try {
    const parsed = new URL(collectionPageUrl);
    const pathname = parsed.pathname.replace(/\/$/, '');
    const match = pathname.match(/\/collections\/([^/]+)/);
    if (!match) return [];
    const handle = match[1];
    const allUrls: string[] = [];
    const limit = 250;
    let page = 1;

    while (true) {
      const jsonUrl = `${parsed.origin}/collections/${handle}/products.json?limit=${limit}&page=${page}`;
      const res = await fetch(jsonUrl, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) break;
      const data = await res.json() as { products?: Array<{ handle?: string }> };
      const products = data?.products;
      if (!Array.isArray(products) || products.length === 0) break;
      const urls = products
        .map((p) => (p && typeof p.handle === 'string' ? p.handle : null))
        .filter((h): h is string => h != null)
        .map((h) => `${parsed.origin}/products/${h}`);
      allUrls.push(...urls);
      if (products.length < limit) break;
      page++;
    }

    return Array.from(new Set(allUrls));
  } catch {
    return [];
  }
}

const LOAD_MORE_KEYWORDS = ['load more', 'show more', 'view more', 'see more', 'load more products', 'show more products', 'view all'];
const PAGINATION_SELECTORS = ['a[rel="next"]', 'a.next', '.pagination a.next', '[aria-label="Next"]', 'a:has-text("Next")', 'a:has-text("›")', 'a:has-text("»")'];

/** Normalize product URL to canonical form (origin/products/handle) for deduplication. */
function normalizeProductUrl(url: string): string {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/\/products\/([^/?]+)/);
    if (match) return `${u.origin}/products/${match[1]}`;
  } catch {
    // ignore
  }
  return url;
}

/** Extract product URLs from current DOM. Keeps links with /products/ (including collection context). */
async function collectProductUrlsFromDom(page: Page): Promise<string[]> {
  const urls = await page.$$eval('a[href*="/products/"]', (links) =>
    links.map((a) => (a as HTMLAnchorElement).href)
  );
  return Array.from(new Set(urls.map(normalizeProductUrl)));
}

/** Try to trigger load more / infinite scroll / pagination and collect all product URLs. */
async function loadMoreAndCollectUrls(page: Page, baseUrl: string, maxIterations = 50): Promise<string[]> {
  const seen = new Set<string>();
  let iterations = 0;
  let noGrowthCount = 0;

  while (iterations < maxIterations) {
    iterations++;
    const urls = await collectProductUrlsFromDom(page);
    urls.forEach((u) => seen.add(u));
    const prevCount = seen.size;

    // Scroll to bottom to trigger infinite scroll
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);

    // Try "Load more" / "Show more" buttons
    for (const keyword of LOAD_MORE_KEYWORDS) {
      const btn = page.locator(`button, a, [role="button"]`).filter({ hasText: new RegExp(keyword, 'i') }).first();
      if ((await btn.count()) > 0 && (await btn.isVisible())) {
        try {
          await btn.click({ force: true });
          await page.waitForTimeout(2000);
          break;
        } catch {
          // ignore
        }
      }
    }

    // Try pagination "Next"
    for (const sel of PAGINATION_SELECTORS) {
      try {
        const next = page.locator(sel).first();
        if ((await next.count()) > 0 && (await next.isVisible())) {
          const href = await next.getAttribute('href');
          if (href) {
            const nextUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;
            await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(2000);
            break;
          }
        }
      } catch {
        // ignore
      }
    }

    const urlsAfter = await collectProductUrlsFromDom(page);
    urlsAfter.forEach((u) => seen.add(u));

    if (seen.size === prevCount) {
      noGrowthCount++;
      if (noGrowthCount >= 2) break;
    } else {
      noGrowthCount = 0;
    }
  }

  return Array.from(seen);
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

    // Wait for product grid to render
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
      return [];
    }

    await page.waitForTimeout(2500);

    const productUrls = await loadMoreAndCollectUrls(page, url);

    if (productUrls.length > 0) {
      console.log(`[Shopify-Engine] Found ${productUrls.length} product links from DOM (with load more/pagination).`);
      return productUrls;
    }

    console.log('[Shopify-Engine] DOM returned 0 links after load more; trying collection JSON.');
    const jsonUrls = await fetchCollectionProductUrls(url);
    if (jsonUrls.length > 0) {
      console.log(`[Shopify-Engine] Using collection JSON fallback; found ${jsonUrls.length} product URLs.`);
      return jsonUrls;
    }
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
    const swatchElements = await ShopifyEngine.normalizeInputLabels(info);
    const clusters = ShopifyEngine.clusterElements(swatchElements);
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
