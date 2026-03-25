import { NextRequest, NextResponse } from 'next/server';
import { triggerFlowRun } from '@/lib/server/trigger-flow-run';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { brandId, type, url, formData, flowId } = body;

    const result = await triggerFlowRun({
      flowId,
      brandId,
      type,
      url,
      formData,
    });

    if (!result.ok) {
      return NextResponse.json(
        { jobId: result.jobId, error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({ jobId: result.jobId, message: 'Job started' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
