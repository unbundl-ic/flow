import type { BrandData, FlowData, JobData } from '@/lib/filestore';

/** Same surface as FileStore; active backend from `getStore()` (Mongo when `MONGODB_URI` is set unless `STORE_BACKEND=file`). */
export interface AppStore {
  getBrands(): Promise<BrandData[]>;
  getBrand(id: string): Promise<BrandData | null>;
  saveBrand(brand: BrandData): Promise<BrandData>;
  deleteBrand(id: string): Promise<boolean>;
  getFlows(brandId?: string): Promise<FlowData[]>;
  getFlow(id: string): Promise<FlowData | null>;
  saveFlow(flow: FlowData): Promise<FlowData>;
  deleteFlow(id: string): Promise<boolean>;
  saveJob(job: JobData): Promise<JobData>;
  getJob(jobId: string): Promise<JobData | null>;
  deleteJob(jobId: string): Promise<boolean>;
  listJobs(flowId?: string): Promise<JobData[]>;
  updateJob(jobId: string, updates: Partial<JobData>): Promise<JobData | null>;
  addLog(jobId: string, log: string): Promise<void>;
}
