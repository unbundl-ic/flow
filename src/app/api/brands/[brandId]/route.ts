import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { SchedulerService } from '@/lib/automation/scheduler';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;
  if (!brandId?.trim()) {
    return NextResponse.json({ error: 'Brand id is required.' }, { status: 400 });
  }

  const store = getStore();
  const ok = await store.deleteBrand(brandId);
  if (!ok) {
    return NextResponse.json({ error: 'Brand not found.' }, { status: 404 });
  }

  try {
    const scheduler = SchedulerService.getInstance();
    if (typeof scheduler.refresh === 'function') await scheduler.refresh();
  } catch {
    // best-effort
  }

  return NextResponse.json({ success: true });
}
