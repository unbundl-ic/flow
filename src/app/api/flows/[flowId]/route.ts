import { NextRequest, NextResponse } from 'next/server';
import { FileStore } from '@/lib/filestore';
import { SchedulerService } from '@/lib/automation/scheduler';

export async function GET(req: NextRequest, { params }: { params: Promise<{ flowId: string }> }) {
  const { flowId } = await params;
  const flow = await FileStore.getFlow(flowId);
  if (!flow) return NextResponse.json({ error: 'Flow not found' }, { status: 404 });
  return NextResponse.json(flow);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ flowId: string }> }) {
  const { flowId } = await params;
  const body = await req.json();
  const flow = await FileStore.getFlow(flowId);
  if (!flow) return NextResponse.json({ error: 'Flow not found' }, { status: 404 });

  const updatedFlow = {
    ...flow,
    ...body,
    updatedAt: new Date().toISOString()
  };

  await FileStore.saveFlow(updatedFlow);
  try {
    const scheduler = SchedulerService.getInstance();
    if (typeof scheduler.refresh === 'function') await scheduler.refresh();
  } catch {
    // Scheduler sync best-effort; don't fail the update
  }
  return NextResponse.json(updatedFlow);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ flowId: string }> }) {
  const { flowId } = await params;
  const success = await FileStore.deleteFlow(flowId);
  if (success) {
    try {
      const scheduler = SchedulerService.getInstance();
      if (typeof scheduler.refresh === 'function') await scheduler.refresh();
    } catch {
      // Scheduler sync best-effort; don't fail the delete
    }
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
}
