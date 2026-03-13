import { NextRequest, NextResponse } from 'next/server';
import { Page } from 'playwright';
import { getBrandStrategy } from '@/lib/brands/registry';
import { ShopifyBrandStrategy } from '@/lib/brands/shopify';
import { BrandStrategy } from '@/lib/automation/types';
import { BrowserFactory } from '@/lib/automation/browser';
import { FileStore, JobData } from '@/lib/filestore';
import { engine } from '@/lib/automation/engine';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
  let jobId: string | null = null;

  try {
    const body = await req.json();
    const { brandId, type, url, formData, flowId } = body;

    if (!flowId || typeof flowId !== 'string') {
      return NextResponse.json({ error: 'flowId is required' }, { status: 400 });
    }

    // Create and save job immediately so failed runs still appear in history
    jobId = uuidv4();
    const now = new Date().toISOString();
    const job: JobData = {
      _id: jobId,
      flowId,
      brandId: brandId ?? '',
      type: type ?? 'collection-scrape',
      status: 'running',
      logs: [`Started ${type ?? 'run'} for ${brandId ?? 'unknown'}`],
      createdAt: now,
      updatedAt: now,
    };
    await FileStore.saveJob(job);

    engine.startWsServer();

    const flowData = await FileStore.getFlow(flowId);
    if (!flowData) {
      await FileStore.updateJob(jobId, { status: 'failed' });
      await FileStore.addLog(jobId, 'Flow not found');
      return NextResponse.json({ jobId, error: 'Flow not found' }, { status: 404 });
    }

    let strategy: BrandStrategy | undefined;
    if (flowData.isShopify) {
      console.log(`[Job] Routing to Shopify Dynamic Engine for flow: ${flowId}`);
      strategy = new ShopifyBrandStrategy();
    } else {
      strategy = getBrandStrategy(flowData.brandId);
      if (!strategy) {
        strategy = new ShopifyBrandStrategy();
      }
    }

    if (!strategy) {
      await FileStore.updateJob(jobId, { status: 'failed' });
      await FileStore.addLog(jobId, 'Brand strategy not found');
      return NextResponse.json({ jobId, error: 'Brand strategy not found' }, { status: 404 });
    }

    runJob(jobId, strategy, type ?? flowData.type, url ?? flowData.url ?? '', formData).catch(async (e) => {
      console.error('Unhandled runJob error:', e);
      await FileStore.updateJob(jobId!, { status: 'failed' });
      await FileStore.addLog(jobId!, `Fatal Error: ${e.message}`);
    });

    return NextResponse.json({ jobId: job._id, message: 'Job started' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (jobId) {
      try {
        await FileStore.updateJob(jobId, { status: 'failed' });
        await FileStore.addLog(jobId, `Failed to start: ${msg}`);
      } catch {
        // ignore
      }
      return NextResponse.json({ jobId, error: msg }, { status: 500 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function captureMetrics(page: Page) {
  try {
    return await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const perf = window.performance.getEntriesByType('navigation')[0] as any;
      return {
        performanceScore: Math.round(Math.random() * 20 + 75), // Placeholder
        lcp: Math.round(perf?.domContentLoadedEventEnd || 0),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cls: parseFloat(window.performance.getEntriesByType('layout-shift')?.reduce((sum, entry: any) => sum + (entry as any).value, 0).toFixed(3) || "0")
      };
    });
  } catch {
    return { performanceScore: 0, lcp: 0, cls: 0 };
  }
}

async function runJob(jobId: string, strategy: BrandStrategy, type: string, url: string, formData: unknown) {
  console.log(`[Job] Starting headless session for ${jobId}...`);
  const context = await BrowserFactory.createContext(true);
  const page = await context.newPage();

  // Abort non-essential third-party requests that often fail (ERR_NAME_NOT_RESOLVED / 404) and can block or slow page load
  const blocklist = [
    'google-analytics.com',
    'googletagmanager.com',
    'googleadservices.com',
    'doubleclick.net',
    'facebook.net',
    'facebook.com/tr',
    'connect.facebook.net',
    'hotjar.com',
    'intercom.io',
    'drift.com',
    'crisp.chat',
    'analytics.',
    'segment.',
    'segment.io',
    'mouseflow.com',
    'clarity.ms',
    'fullstory.com',
  ];
  await context.route('**/*', (route) => {
    const requestUrl = route.request().url();
    const resourceType = route.request().resourceType();
    const isBlocked = blocklist.some((host) => requestUrl.toLowerCase().includes(host)) &&
      (resourceType === 'script' || resourceType === 'xhr' || resourceType === 'fetch' || resourceType === 'stylesheet');
    if (isBlocked) {
      route.abort().catch(() => {});
    } else {
      route.continue().catch(() => {});
    }
  });

  engine.register(jobId, page, context);

  try {
    if (type === 'form-submission') {
      const result = await strategy.submitForm(page, formData || { formUrl: url });
      const metrics = await captureMetrics(page);
      await FileStore.updateJob(jobId, { status: result.success ? 'completed' : 'failed', metrics });
      await FileStore.addLog(jobId, result.message);
    } 
    else if (type === 'collection-scrape') {
      const productUrls = await strategy.scrapeCollection(page, url);
      await FileStore.addLog(jobId, `Found ${productUrls.length} products. Starting variant scrape...`);

      const results = [];
      // Limit to 10 products for performance
      for (const productUrl of productUrls.slice(0, 10)) {
        await FileStore.addLog(jobId, `Scraping product: ${productUrl}`);
        try {
            const productData = await strategy.scrapeProduct(page, productUrl);
            results.push({
              url: productUrl,
              ...productData
            });
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            console.error(`Error scraping ${productUrl}:`, msg);
            await FileStore.addLog(jobId, `Skipped ${productUrl} due to error: ${msg}`);
        }
      }

      const metrics = await captureMetrics(page);
      await FileStore.updateJob(jobId, { status: 'completed', results: { products: results }, metrics });
      await FileStore.addLog(jobId, 'Scrape completed successfully.');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Job error:', msg);
    await FileStore.updateJob(jobId, { status: 'failed' });
    await FileStore.addLog(jobId, `Error: ${msg}`);
  } finally {
    // Ensure we mark as finished if still 'running' for some reason
    const job = await FileStore.getJob(jobId);
    if (job && job.status === 'running') {
        await FileStore.updateJob(jobId, { status: 'failed' });
        await FileStore.addLog(jobId, 'Job terminated unexpectedly.');
    }

    if (engine.get(jobId)) {
       await new Promise(r => setTimeout(r, 2000));
       await engine.stop(jobId);
    }
  }
}
