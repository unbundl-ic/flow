import { NextRequest, NextResponse } from 'next/server';
import CronExpressionParser from 'cron-parser';
import { getCronExpression } from '@/lib/automation/cron-expression';
import { getStore } from '@/lib/store';
import { triggerFlowRun } from '@/lib/server/trigger-flow-run';

function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

/**
 * Vercel Cron invokes this route on the configured schedule.
 * Secured with CRON_SECRET (set the same value in Vercel env and cron auth if required).
 */
export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const store = getStore();
  const flows = await store.getFlows();
  const now = new Date();
  const triggered: string[] = [];

  for (const flow of flows) {
    if (!flow.schedule?.active || flow.schedule.type === 'manual') continue;

    let expr: string;
    try {
      expr = getCronExpression(flow.schedule);
      const interval = CronExpressionParser.parse(expr, { currentDate: now });
      const prevFire = interval.prev().toDate();
      const lastRun = flow.schedule.lastRun ? new Date(flow.schedule.lastRun) : null;
      if (lastRun && lastRun >= prevFire) continue;
    } catch {
      continue;
    }

    const r = await triggerFlowRun({
      flowId: flow.id,
      brandId: flow.brandId,
      type: flow.type,
      url: flow.url,
      formData: flow.formData,
    });

    if (r.ok) {
      triggered.push(flow.id);
      await store.saveFlow({
        ...flow,
        schedule: {
          ...flow.schedule,
          lastRun: new Date().toISOString(),
        },
      });
    }
  }

  return NextResponse.json({ ok: true, triggered: triggered.length, flowIds: triggered });
}
