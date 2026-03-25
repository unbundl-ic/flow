import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { engine } from '@/lib/automation/engine';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { action } = await req.json();
    const { jobId } = await params;

    if (action === 'stop' || action === 'discard') {
      console.log(`[API] Stopping job: ${jobId}`);

      const base = process.env.WORKER_URL?.replace(/\/$/, '');
      const secret = process.env.WORKER_SECRET;

      if (base && secret) {
        const r = await fetch(`${base}/control/${jobId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${secret}`,
          },
          body: JSON.stringify({ action }),
          signal: AbortSignal.timeout(30_000),
        });
        const data = await r.json().catch(() => ({}));
        return NextResponse.json(data, { status: r.status });
      }

      await engine.stop(jobId);

      const store = getStore();
      await store.updateJob(jobId, { status: 'failed' });
      await store.addLog(jobId, 'Job was manually discarded by user.');

      return NextResponse.json({ success: true, message: 'Job stopped' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
