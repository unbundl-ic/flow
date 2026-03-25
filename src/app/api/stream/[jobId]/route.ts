import { NextRequest, NextResponse } from 'next/server';
import { engine } from '@/lib/automation/engine';

async function screenshotFromWorker(jobId: string): Promise<Response | null> {
  const base = process.env.WORKER_URL?.replace(/\/$/, '');
  const secret = process.env.WORKER_SECRET;
  if (!base || !secret) return null;
  const r = await fetch(`${base}/screenshot/${jobId}`, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) return null;
  const buf = await r.arrayBuffer();
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;

  const proxied = await screenshotFromWorker(jobId);
  if (proxied) return proxied;

  const job = engine.get(jobId);

  if (!job) {
    return NextResponse.json({ error: 'Session not active' }, { status: 404 });
  }

  try {
    const buffer = await job.page.screenshot({ type: 'jpeg', quality: 80 });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
