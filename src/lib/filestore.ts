import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const JOBS_DIR = path.join(DATA_DIR, 'jobs');
const FLOWS_DIR = path.join(DATA_DIR, 'flows');
const BRANDS_DIR = path.join(DATA_DIR, 'brands');

// Ensure directories exist
(async () => {
  await fs.mkdir(JOBS_DIR, { recursive: true });
  await fs.mkdir(FLOWS_DIR, { recursive: true });
  await fs.mkdir(BRANDS_DIR, { recursive: true });
})();

export type ScheduleType = 'manual' | 'hourly' | 'daily' | 'weekly' | 'monthly';

export interface BrandData {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface FlowData {
  id: string;
  brandId: string;
  isShopify?: boolean; // New flag for dynamic Shopify crawler
  type: 'form-submission' | 'collection-scrape';
  name: string;
  url: string;
  formData: {
    name: string;
    phone: string;
    [key: string]: string;
  };
  schedule: {
    type: ScheduleType;
    active: boolean;
    lastRun?: string;
    nextRun?: string;
    // New granular config
    time?: string;       // HH:mm
    dayOfWeek?: string;  // 0-6 (Sun-Sat)
    dayOfMonth?: number; // 1-31
  };
  createdAt: string;
  updatedAt: string;
}

export interface JobData {
  _id: string;
  flowId?: string;
  brandId: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  logs: string[];
  metrics?: {
    lcp?: number;
    cls?: number;
    performanceScore?: number;
  };
  /** URL/formData from the run request (worker uses these instead of flow defaults when set). */
  requestPayload?: { url?: string; formData?: unknown };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  results?: any;
  createdAt: string;
  updatedAt: string;
}

export const FileStore = {
  // --- BRANDS ---
  async getBrands(): Promise<BrandData[]> {
    try {
      const files = await fs.readdir(BRANDS_DIR);
      const brands = await Promise.all(
        files.map(async (file) => {
          const data = await fs.readFile(path.join(BRANDS_DIR, file), 'utf-8');
          return JSON.parse(data) as BrandData;
        })
      );
      return brands.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch {
      return [];
    }
  },

  async getBrand(id: string): Promise<BrandData | null> {
    try {
      const data = await fs.readFile(path.join(BRANDS_DIR, `${id}.json`), 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  },

  async saveBrand(brand: BrandData) {
    await fs.mkdir(BRANDS_DIR, { recursive: true });
    await fs.writeFile(path.join(BRANDS_DIR, `${brand.id}.json`), JSON.stringify(brand, null, 2));
    return brand;
  },

  async deleteBrand(id: string) {
    if (!(await this.getBrand(id))) return false;
    const flows = await this.getFlows(id);
    for (const f of flows) {
      const jobs = await this.listJobs(f.id);
      for (const j of jobs) {
        await this.deleteJob(j._id);
      }
      await this.deleteFlow(f.id);
    }
    for (const j of await this.listJobs()) {
      if (j.brandId === id) await this.deleteJob(j._id);
    }
    try {
      await fs.unlink(path.join(BRANDS_DIR, `${id}.json`));
      return true;
    } catch {
      return false;
    }
  },

  // --- FLOWS ---
  async getFlows(brandId?: string): Promise<FlowData[]> {
    try {
      const files = await fs.readdir(FLOWS_DIR);
      const flows = await Promise.all(
        files.map(async (file) => {
          const data = await fs.readFile(path.join(FLOWS_DIR, file), 'utf-8');
          return JSON.parse(data) as FlowData;
        })
      );
      const filtered = brandId ? flows.filter(f => f.brandId === brandId) : flows;
      return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch {
      return [];
    }
  },

  async getFlow(id: string): Promise<FlowData | null> {
    try {
      const data = await fs.readFile(path.join(FLOWS_DIR, `${id}.json`), 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  },

  async saveFlow(flow: FlowData) {
    await fs.mkdir(FLOWS_DIR, { recursive: true });
    await fs.writeFile(path.join(FLOWS_DIR, `${flow.id}.json`), JSON.stringify(flow, null, 2));
    return flow;
  },

  async deleteFlow(id: string) {
    try {
      await fs.unlink(path.join(FLOWS_DIR, `${id}.json`));
      return true;
    } catch {
      return false;
    }
  },

  // --- JOBS ---
  async saveJob(job: JobData) {
    await fs.mkdir(JOBS_DIR, { recursive: true });
    const filePath = path.join(JOBS_DIR, `${job._id}.json`);
    await fs.writeFile(filePath, JSON.stringify(job, null, 2));
    return job;
  },

  async getJob(jobId: string): Promise<JobData | null> {
    try {
      const filePath = path.join(JOBS_DIR, `${jobId}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  },

  async deleteJob(jobId: string) {
    try {
      await fs.unlink(path.join(JOBS_DIR, `${jobId}.json`));
      return true;
    } catch {
      return false;
    }
  },

  async listJobs(flowId?: string): Promise<JobData[]> {
    try {
      await fs.mkdir(JOBS_DIR, { recursive: true });
      const files = await fs.readdir(JOBS_DIR);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));
      const jobs = await Promise.all(
        jsonFiles.map(async (file) => {
          try {
            const data = await fs.readFile(path.join(JOBS_DIR, file), 'utf-8');
            return JSON.parse(data) as JobData;
          } catch {
            return null;
          }
        })
      );
      const valid = jobs.filter((j): j is JobData => j != null);
      const filtered = flowId ? valid.filter(j => j.flowId === flowId) : valid;
      return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch {
      return [];
    }
  },

  async updateJob(jobId: string, updates: Partial<JobData>) {
    const job = await this.getJob(jobId);
    if (job) {
      const updatedJob = { ...job, ...updates, updatedAt: new Date().toISOString() };
      await this.saveJob(updatedJob);
      return updatedJob;
    }
    return null;
  },

  async addLog(jobId: string, log: string) {
    const job = await this.getJob(jobId);
    if (job) {
      job.logs.push(`[${new Date().toLocaleTimeString()}] ${log}`);
      await this.saveJob(job);
    }
  }
};
