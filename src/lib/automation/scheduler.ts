import cron, { ScheduledTask } from 'node-cron';
import { FileStore } from '../filestore';

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
    this.refresh();
  }

  async refresh() {
    try {
      console.log('[Scheduler] Syncing schedules from FileStore...');
      const flows = await FileStore.getFlows();

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

  scheduleFlow(flow: any) {
    if (!flow?.schedule || !flow.id) return;
    if (this.tasks.has(flow.id)) {
      this.tasks.get(flow.id)?.stop();
    }

    const cronExpression = this.getCronExpression(flow.schedule);

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
        await FileStore.saveFlow({
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

  private getCronExpression(schedule: any): string {
    if (!schedule || typeof schedule !== 'object') return '0 0 * * *';
    const time = schedule.time || '09:00';
    const parts = String(time).trim().split(':');
    const hour = parts[0] != null && /^\d{1,2}$/.test(parts[0]) ? parts[0] : '9';
    const minute = parts[1] != null && /^\d{1,2}$/.test(parts[1]) ? parts[1] : '0';

    switch (schedule.type) {
      case 'hourly':
        return '0 * * * *';
      case 'daily':
        return `${minute} ${hour} * * *`;
      case 'weekly': {
        const dayOfWeek = schedule.dayOfWeek != null ? String(schedule.dayOfWeek) : '1';
        return `${minute} ${hour} * * ${/^[0-6]$/.test(dayOfWeek) ? dayOfWeek : '1'}`;
      }
      case 'monthly': {
        const d = schedule.dayOfMonth != null ? parseInt(String(schedule.dayOfMonth), 10) : 1;
        const dayOfMonth = (d >= 1 && d <= 31) ? String(d) : '1';
        return `${minute} ${hour} ${dayOfMonth} * *`;
      }
      default:
        return '0 0 * * *';
    }
  }
}

export const scheduler = SchedulerService.getInstance();
