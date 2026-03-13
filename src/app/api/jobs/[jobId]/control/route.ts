import { NextRequest, NextResponse } from 'next/server';
import { FileStore } from '@/lib/filestore';
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
      
      // 1. Stop the browser session
      await engine.stop(jobId);
      
      // 2. Update job status
      await FileStore.updateJob(jobId, { status: 'failed' });
      await FileStore.addLog(jobId, 'Job was manually discarded by user.');
      
      return NextResponse.json({ success: true, message: 'Job stopped' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
