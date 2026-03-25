import type { BrandData, FlowData, JobData } from '@/lib/filestore';
import type { AppStore } from '@/lib/store/interface';
import { connectMongo } from '@/lib/store/mongo-connect';
import { BrandModel, FlowModel, JobModel, docToBrand, docToFlow, docToJob } from '@/lib/store/models';

export const MongoStore: AppStore = {
  async getBrands(): Promise<BrandData[]> {
    await connectMongo();
    const rows = await BrandModel.find().lean().exec();
    return rows
      .map((r) => docToBrand(r))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async getBrand(id: string): Promise<BrandData | null> {
    await connectMongo();
    const row = await BrandModel.findById(id).lean().exec();
    return row ? docToBrand(row) : null;
  },

  async saveBrand(brand: BrandData) {
    await connectMongo();
    const payload = {
      _id: brand.id,
      name: brand.name,
      description: brand.description,
      color: brand.color,
      createdAt: brand.createdAt,
      updatedAt: brand.updatedAt,
    };
    await BrandModel.findByIdAndUpdate(brand.id, payload, { upsert: true }).exec();
    return brand;
  },

  async deleteBrand(id: string): Promise<boolean> {
    await connectMongo();
    const existed = await BrandModel.findById(id).lean().exec();
    if (!existed) return false;
    await JobModel.deleteMany({ brandId: id }).exec();
    await FlowModel.deleteMany({ brandId: id }).exec();
    await BrandModel.findByIdAndDelete(id).exec();
    return true;
  },

  async getFlows(brandId?: string): Promise<FlowData[]> {
    await connectMongo();
    const q = brandId ? { brandId } : {};
    const rows = await FlowModel.find(q).lean().exec();
    const flows = rows.map((r) => docToFlow(r));
    return flows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async getFlow(id: string): Promise<FlowData | null> {
    await connectMongo();
    const row = await FlowModel.findById(id).lean().exec();
    return row ? docToFlow(row) : null;
  },

  async saveFlow(flow: FlowData) {
    await connectMongo();
    const payload = {
      _id: flow.id,
      brandId: flow.brandId,
      isShopify: flow.isShopify,
      type: flow.type,
      name: flow.name,
      url: flow.url,
      formData: flow.formData,
      schedule: flow.schedule,
      createdAt: flow.createdAt,
      updatedAt: flow.updatedAt,
    };
    await FlowModel.findByIdAndUpdate(flow.id, payload, { upsert: true }).exec();
    return flow;
  },

  async deleteFlow(id: string): Promise<boolean> {
    await connectMongo();
    const r = await FlowModel.findByIdAndDelete(id).exec();
    return !!r;
  },

  async saveJob(job: JobData) {
    await connectMongo();
    const payload = {
      _id: job._id,
      flowId: job.flowId,
      brandId: job.brandId,
      type: job.type,
      status: job.status,
      logs: job.logs,
      metrics: job.metrics,
      requestPayload: job.requestPayload,
      results: job.results,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
    await JobModel.findByIdAndUpdate(job._id, payload, { upsert: true }).exec();
    return job;
  },

  async getJob(jobId: string): Promise<JobData | null> {
    await connectMongo();
    const row = await JobModel.findById(jobId).lean().exec();
    return row ? docToJob(row) : null;
  },

  async deleteJob(jobId: string): Promise<boolean> {
    await connectMongo();
    const r = await JobModel.findByIdAndDelete(jobId).exec();
    return !!r;
  },

  async listJobs(flowId?: string): Promise<JobData[]> {
    await connectMongo();
    const q = flowId ? { flowId } : {};
    const rows = await JobModel.find(q).lean().exec();
    const jobs = rows.map((r) => docToJob(r));
    return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async updateJob(jobId: string, updates: Partial<JobData>) {
    const job = await this.getJob(jobId);
    if (!job) return null;
    const updatedJob: JobData = {
      ...job,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await this.saveJob(updatedJob);
    return updatedJob;
  },

  async addLog(jobId: string, log: string) {
    await connectMongo();
    const line = `[${new Date().toLocaleTimeString()}] ${log}`;
    await JobModel.findByIdAndUpdate(
      jobId,
      { $push: { logs: line }, $set: { updatedAt: new Date().toISOString() } },
      { new: false }
    ).exec();
  },
};
