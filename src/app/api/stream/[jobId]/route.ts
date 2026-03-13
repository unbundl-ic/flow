import { NextRequest, NextResponse } from 'next/server';
import { engine } from '@/lib/automation/engine';

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
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
