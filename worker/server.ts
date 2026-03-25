import 'dotenv/config';
import http from 'node:http';
import { connectMongo } from '@/lib/store/mongo-connect';
import { MongoStore } from '@/lib/store/mongo-store';
import { runAutomationJob, resolveBrandStrategy } from '@/lib/automation/run-job';
import { engine } from '@/lib/automation/engine';

const workerEnginePort = {
  register: (jobId: string, page: import('playwright').Page, context: import('playwright').BrowserContext) =>
    engine.register(jobId, page, context),
  get: (jobId: string) => engine.get(jobId),
  stop: (jobId: string) => engine.stop(jobId),
};

function unauthorized(res: http.ServerResponse) {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized' }));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function authOk(req: http.IncomingMessage): boolean {
  const secret = process.env.WORKER_SECRET;
  if (!secret) return false;
  const h = req.headers.authorization;
  return h === `Bearer ${secret}`;
}

async function executeJob(jobId: string) {
  await connectMongo();
  const store = MongoStore;
  const job = await store.getJob(jobId);
  if (!job) return;
  const flow = job.flowId ? await store.getFlow(job.flowId) : null;
  if (!flow) {
    await store.updateJob(jobId, { status: 'failed' });
    await store.addLog(jobId, 'Flow not found');
    return;
  }
  const strategy = resolveBrandStrategy(flow);
  const runUrl = (typeof job.requestPayload?.url === 'string' ? job.requestPayload.url : null) ?? flow.url ?? '';
  const runForm = job.requestPayload?.formData ?? flow.formData;
  try {
    await runAutomationJob(store, workerEnginePort, jobId, strategy, job.type, runUrl, runForm);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[Worker] Job failed:', msg);
    await store.updateJob(jobId, { status: 'failed' });
    await store.addLog(jobId, `Fatal Error: ${msg}`);
  }
}

const port = parseInt(process.env.PORT || '8787', 10);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (!authOk(req)) {
    unauthorized(res);
    return;
  }

  try {
    if (req.method === 'POST' && url.pathname === '/execute') {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const jobId = typeof body.jobId === 'string' ? body.jobId : '';
      if (!jobId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'jobId required' }));
        return;
      }

      await connectMongo();
      const store = MongoStore;
      const job = await store.getJob(jobId);
      if (!job) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Job not found' }));
        return;
      }
      const flow = job.flowId ? await store.getFlow(job.flowId) : null;
      if (!flow) {
        await store.updateJob(jobId, { status: 'failed' });
        await store.addLog(jobId, 'Flow not found');
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Flow not found' }));
        return;
      }

      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, jobId }));
      void executeJob(jobId);
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/screenshot/')) {
      const jobId = url.pathname.replace('/screenshot/', '').split('/')[0];
      await connectMongo();
      const j = engine.get(jobId);
      if (!j) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not active' }));
        return;
      }
      const buffer = await j.page.screenshot({ type: 'jpeg', quality: 80 });
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(Buffer.from(buffer));
      return;
    }

    if (req.method === 'POST' && url.pathname.startsWith('/interact/')) {
      const jobId = url.pathname.replace('/interact/', '').split('/')[0];
      await connectMongo();
      const j = engine.get(jobId);
      if (!j) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not active' }));
        return;
      }
      const raw = await readBody(req);
      const { type, x, y, text, key } = raw ? JSON.parse(raw) : {};
      if (type === 'click') await j.page.mouse.click(x, y);
      else if (type === 'type') await j.page.keyboard.type(text);
      else if (type === 'press') await j.page.keyboard.press(key);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (req.method === 'POST' && url.pathname.startsWith('/control/')) {
      const jobId = url.pathname.replace('/control/', '').split('/')[0];
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      if (body.action === 'stop' || body.action === 'discard') {
        await engine.stop(jobId);
        await connectMongo();
        const store = MongoStore;
        await store.updateJob(jobId, { status: 'failed' });
        await store.addLog(jobId, 'Job was manually discarded by user.');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      }
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid action' }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error';
    console.error('[Worker]', msg);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: msg }));
  }
});

server.listen(port, () => {
  console.log(`[Worker] Listening on ${port} (STORE_BACKEND=mongo, MONGODB_URI set)`);
});
