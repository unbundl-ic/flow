import { v4 as uuidv4 } from 'uuid';
import type { JobData } from '@/lib/filestore';
import { getStore } from '@/lib/store';
import { resolveBrandStrategy } from '@/lib/automation/run-job';

export type TriggerRunBody = {
  flowId: string;
  brandId?: string;
  type?: string;
  url?: string;
  formData?: unknown;
};

export type TriggerRunResult =
  | { ok: true; jobId: string; delegated: boolean }
  | { ok: false; jobId?: string; error: string; status: number };

async function callWorkerExecute(jobId: string): Promise<{ ok: boolean; status: number; message?: string }> {
  const base = process.env.WORKER_URL?.replace(/\/$/, '');
  const secret = process.env.WORKER_SECRET;
  if (!base || !secret) {
    return { ok: false, status: 500, message: 'WORKER_URL or WORKER_SECRET not configured' };
  }
  const res = await fetch(`${base}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ jobId }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.ok || res.status === 202) {
    return { ok: true, status: res.status };
  }
  const text = await res.text().catch(() => '');
  return { ok: false, status: res.status, message: text || res.statusText };
}

/**
 * Creates a job row and either delegates to WORKER_URL or runs Playwright in-process.
 */
export async function triggerFlowRun(body: TriggerRunBody): Promise<TriggerRunResult> {
  const store = getStore();
  const { brandId, type, url, formData, flowId } = body;

  if (!flowId || typeof flowId !== 'string') {
    return { ok: false, error: 'flowId is required', status: 400 };
  }

  const onVercel = process.env.VERCEL === '1';
  const workerUrlConfigured = Boolean(process.env.WORKER_URL?.trim());
  if (onVercel && !workerUrlConfigured) {
    return {
      ok: false,
      error:
        'Playwright cannot run on Vercel. Set WORKER_URL (and WORKER_SECRET) and deploy the Docker worker. See DEPLOY.md.',
      status: 503,
    };
  }

  const jobId = uuidv4();
  const now = new Date().toISOString();
  const job: JobData = {
    _id: jobId,
    flowId,
    brandId: brandId ?? '',
    type: type ?? 'collection-scrape',
    status: 'running',
    logs: [`Started ${type ?? 'run'} for ${brandId ?? 'unknown'}`],
    requestPayload: { url, formData },
    createdAt: now,
    updatedAt: now,
  };

  try {
    await store.saveJob(job);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to save job';
    return { ok: false, error: msg, status: 500 };
  }

  const flowData = await store.getFlow(flowId);
  if (!flowData) {
    await store.updateJob(jobId, { status: 'failed' });
    await store.addLog(jobId, 'Flow not found');
    return { ok: false, jobId, error: 'Flow not found', status: 404 };
  }

  const strategy = resolveBrandStrategy(flowData);

  const workerUrl = process.env.WORKER_URL?.trim();
  if (workerUrl) {
    const w = await callWorkerExecute(jobId);
    if (!w.ok) {
      const detail = w.message || 'Worker request failed';
      await store.updateJob(jobId, { status: 'failed' });
      await store.addLog(jobId, `Worker error (${w.status}): ${detail}`);
      return { ok: false, jobId, error: detail, status: 503 };
    }
    return { ok: true, jobId, delegated: true };
  }

  const { engine } = await import('@/lib/automation/engine');
  const { runAutomationJob } = await import('@/lib/automation/run-job');
  const nextEnginePort = {
    startWsServer: () => engine.startWsServer(),
    register: (jobId: string, page: import('playwright').Page, context: import('playwright').BrowserContext) =>
      engine.register(jobId, page, context),
    get: (jobId: string) => engine.get(jobId),
    stop: (jobId: string) => engine.stop(jobId),
  };

  const runType = type ?? flowData.type;
  const runUrl = url ?? flowData.url ?? '';
  const runForm = formData ?? flowData.formData;
  runAutomationJob(store, nextEnginePort, jobId, strategy, runType, runUrl, runForm).catch(async (e: unknown) => {
    console.error('Unhandled runJob error:', e);
    const msg = e instanceof Error ? e.message : 'Unknown error';
    await store.updateJob(jobId, { status: 'failed' });
    await store.addLog(jobId, `Fatal Error: ${msg}`);
  });

  return { ok: true, jobId, delegated: false };
}
