import { NextRequest, NextResponse } from 'next/server';
import { FileStore, type FlowData } from '@/lib/filestore';
import { v4 as uuidv4 } from 'uuid';
import { SchedulerService } from '@/lib/automation/scheduler';

export async function GET() {
  const flows = await FileStore.getFlows();
  return NextResponse.json(flows);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const flowId = uuidv4();
    const now = new Date().toISOString();

    const newFlow: FlowData = {
      id: flowId,
      brandId: body.brandId ?? '',
      type: body.type ?? 'form-submission',
      name: body.name ?? 'New Flow',
      url: body.url ?? '',
      formData: body.formData ?? { name: '', phone: '' },
      schedule: body.schedule ?? { type: 'manual', active: false },
      createdAt: now,
      updatedAt: now,
      ...body
    };
    newFlow.id = flowId;
    newFlow.createdAt = now;
    newFlow.updatedAt = now;

    await FileStore.saveFlow(newFlow);
    try {
      const scheduler = SchedulerService.getInstance();
      await scheduler.refresh();
    } catch (schedulerError) {
      console.error('[API flows] Scheduler refresh failed (flow was saved):', schedulerError);
      // Flow was saved; don't fail the request
    }

    return NextResponse.json(newFlow);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
