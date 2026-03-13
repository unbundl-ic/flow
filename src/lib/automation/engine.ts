import { Page, BrowserContext } from 'playwright';
import { WebSocketServer, WebSocket } from 'ws';
import { FileStore } from '../filestore';

// Singleton for session management to survive HMR reloads
const ENGINE_TOKEN = Symbol.for('automation.engine');

interface ActiveJob {
  page: Page;
  context: BrowserContext;
  startTime: number;
}

export class AutomationEngine {
  private jobs: Map<string, ActiveJob> = new Map();
  private wsServer: WebSocketServer | null = null;
  private jobSockets: Map<string, WebSocket[]> = new Map();

  constructor() {
    // Cleanup zombie jobs every minute
    if (typeof window === 'undefined') {
      setInterval(() => this.cleanupZombies(), 60000);
    }
  }

  static getInstance(): AutomationEngine {
    if (!(global as any)[ENGINE_TOKEN]) {
      (global as any)[ENGINE_TOKEN] = new AutomationEngine();
    }
    return (global as any)[ENGINE_TOKEN];
  }

  register(jobId: string, page: Page, context: BrowserContext) {
    this.jobs.set(jobId, { page, context, startTime: Date.now() });
    console.log(`[Engine] Job ${jobId} registered.`);
    
    // Set up real-time telemetry streaming
    page.on('console', msg => {
      this.broadcast(jobId, { type: 'log', message: msg.text() });
      FileStore.addLog(jobId, msg.text()).catch(() => {});
    });

    // Start video/frame stream if someone is watching
    this.startStreaming(jobId, page);
  }

  async stop(jobId: string) {
    const job = this.jobs.get(jobId);
    if (job) {
      console.log(`[Engine] Stopping job ${jobId}...`);
      try {
        await job.page.close();
        await job.context.close();
      } catch (e) {
        // Ignore close errors
      }
      this.jobs.delete(jobId);
      this.jobSockets.delete(jobId);
    }
  }

  get(jobId: string) {
    return this.jobs.get(jobId);
  }

  startWsServer() {
    if (this.wsServer) return;
    
    console.log('[Engine] Starting WebSocket stream server on port 3002...');
    const wss = new WebSocketServer({ port: 3002 });
    this.wsServer = wss;

    wss.on('connection', (ws) => {
      let currentJobId: string | null = null;

      ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'init') {
            currentJobId = msg.jobId;
            if (!this.jobSockets.has(currentJobId!)) this.jobSockets.set(currentJobId!, []);
            this.jobSockets.get(currentJobId!)?.push(ws);
            console.log(`[WS] Client attached to job ${currentJobId}`);
          } else if (msg.type === 'click' && currentJobId) {
            const job = this.jobs.get(currentJobId);
            if (job) await job.page.mouse.click(msg.x, msg.y);
          } else if (msg.type === 'type' && currentJobId) {
            const job = this.jobs.get(currentJobId);
            if (job) await job.page.keyboard.type(msg.text);
          }
        } catch (e) {
          console.error('[WS] Message error');
        }
      });

      ws.on('close', () => {
        if (currentJobId) {
            const sockets = this.jobSockets.get(currentJobId);
            if(sockets) this.jobSockets.set(currentJobId, sockets.filter(s => s !== ws));
        }
      });
    });
  }

  private async startStreaming(jobId: string, page: Page) {
    // Binary stream of screenshots for low-latency preview (~5-8 FPS)
    const stream = async () => {
        if (!this.jobs.has(jobId)) return;
        try {
            const sockets = this.jobSockets.get(jobId);
            if (sockets && sockets.length > 0) {
                const buffer = await page.screenshot({ type: 'jpeg', quality: 50 });
                sockets.forEach(s => {
                    if (s.readyState === 1) s.send(buffer);
                });
            }
        } catch (e) {
            // Page might be closed
        }
        setTimeout(stream, 150); // ~6 FPS
    };
    stream();
  }

  private broadcast(jobId: string, data: any) {
    const sockets = this.jobSockets.get(jobId);
    if (sockets) {
      const payload = JSON.stringify(data);
      sockets.forEach(s => {
        if (s.readyState === 1) s.send(payload);
      });
    }
  }

  private async cleanupZombies() {
    const now = Date.now();
    for (const [jobId, job] of this.jobs.entries()) {
      // Jobs older than 30 mins are considered zombies
      if (now - job.startTime > 1800000) {
        console.warn(`[Engine] Cleaning up zombie job ${jobId}`);
        await this.stop(jobId);
        await FileStore.updateJob(jobId, { status: 'failed' });
        await FileStore.addLog(jobId, 'Job timed out (Zombie cleanup).');
      }
    }
  }
}

export const engine = AutomationEngine.getInstance();
