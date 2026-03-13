import { NextRequest, NextResponse } from 'next/server';
import { engine } from '@/lib/automation/engine';

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = engine.get(jobId);

  if (!job) {
    return NextResponse.json({ error: 'Session not active' }, { status: 404 });
  }

  try {
    const { type, x, y, text, key } = await req.json();

    if (type === 'click') {
      await job.page.mouse.click(x, y);
    } else if (type === 'type') {
      await job.page.keyboard.type(text);
    } else if (type === 'press') {
      await job.page.keyboard.press(key);
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
