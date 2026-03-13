import { NextResponse } from 'next/server';
import { SchedulerService } from '@/lib/automation/scheduler';

export async function POST() {
  try {
    const scheduler = SchedulerService.getInstance();
    if (typeof scheduler.refresh === 'function') {
      await scheduler.refresh();
      return NextResponse.json({ message: 'Scheduler synced' });
    }
    return NextResponse.json({ message: 'Scheduler not available' }, { status: 503 });
  } catch (err) {
    console.error('[API scheduler] refresh failed:', err);
    return NextResponse.json({ error: 'Scheduler sync failed' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'active' });
}
