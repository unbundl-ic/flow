import { NextRequest, NextResponse } from 'next/server';
import { FileStore } from '@/lib/filestore';

export async function GET() {
  try {
    const jobs = await FileStore.listJobs();
    return NextResponse.json(jobs);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
