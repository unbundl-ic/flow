import cron, { ScheduledTask } from 'node-cron';
import type { FlowData } from '@/lib/filestore';
import { getStore } from '@/lib/store';
import { getCronExpression } from '@/lib/automation/cron-expression';

const SCHEDULER_TOKEN = Symbol.for('automation.scheduler');

export class SchedulerService {
  private tasks: Map<string, ScheduledTask> = new Map();

  static getInstance(): SchedulerService {
    let instance = (global as any)[SCHEDULER_TOKEN];
    if (!instance || typeof (instance as SchedulerService).refresh !== 'function') {
      instance = new SchedulerService();
      (global as any)[SCHEDULER_TOKEN] = instance;
    }
    return instance as SchedulerService;
  }

  constructor() {
    console.log('[Scheduler] Initializing global scheduler service...');
    if (process.env.DISABLE_IN_PROCESS_SCHEDULER === 'true') {
      console.log('[Scheduler] In-process cron disabled (serverless / external cron mode)');
      return;
    }
    void this.refresh();
  }

  async refresh() {
    try {
      if (process.env.DISABLE_IN_PROCESS_SCHEDULER === 'true') {
        this.tasks.forEach((task) => task.stop());
        this.tasks.clear();
        return;
      }
      const store = getStore();
      console.log('[Scheduler] Syncing schedules from store...');
      const flows = await store.getFlows();

      // Stop all existing tasks
      this.tasks.forEach(task => task.stop());
      this.tasks.clear();

      for (const flow of flows) {
        if (flow.schedule?.active) {
          this.scheduleFlow(flow);
        }
      }
    } catch (err) {
      console.error('[Scheduler] refresh failed:', err);
    }
  }

  scheduleFlow(flow: FlowData) {
    if (!flow?.schedule || !flow.id) return;
    if (this.tasks.has(flow.id)) {
      this.tasks.get(flow.id)?.stop();
    }

    const cronExpression = getCronExpression(flow.schedule);

    try {
      console.log(`[Scheduler] Scheduling flow ${flow.name} (${flow.id}) with: ${cronExpression}`);

      const task = cron.schedule(cronExpression, async () => {
      console.log(`[Scheduler] TRIGGERED: ${flow.name} (${flow.id})`);
      try {
        // Trigger the internal API
        const host = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
        const res = await fetch(`${host}/api/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brandId: flow.brandId,
            type: flow.type,
            url: flow.url,
            formData: flow.formData,
            flowId: flow.id
          })
        });
        
        if (res.ok) {
            console.log(`[Scheduler] Successfully triggered flow ${flow.id}`);
        } else {
            console.error(`[Scheduler] Failed to trigger flow ${flow.id}: ${res.statusText}`);
        }

        // Update last run
        const storeInner = getStore();
        await storeInner.saveFlow({
            ...flow,
            schedule: {
                ...flow.schedule,
                lastRun: new Date().toISOString()
            }
        });
      } catch (err) {
        console.error(`[Scheduler] Error running scheduled flow ${flow.id}:`, err);
      }
    });

    this.tasks.set(flow.id, task);
    } catch (err) {
      console.error(`[Scheduler] Failed to schedule flow ${flow.id}:`, err);
    }
  }

}

export const scheduler = SchedulerService.getInstance();
