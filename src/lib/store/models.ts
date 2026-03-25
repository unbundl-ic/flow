import mongoose, { Schema } from 'mongoose';
import type { BrandData, FlowData, JobData } from '@/lib/filestore';

const BrandMongooseSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    color: { type: String, default: '#000000' },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { _id: false }
);

const FlowMongooseSchema = new Schema(
  {
    _id: { type: String, required: true },
    brandId: { type: String, required: true },
    isShopify: { type: Boolean },
    type: { type: String, required: true },
    name: { type: String, required: true },
    url: { type: String, required: true },
    formData: { type: Schema.Types.Mixed, default: {} },
    schedule: { type: Schema.Types.Mixed, required: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { _id: false }
);
FlowMongooseSchema.index({ brandId: 1 });

const JobMongooseSchema = new Schema(
  {
    _id: { type: String, required: true },
    flowId: { type: String },
    brandId: { type: String, required: true },
    type: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed'],
      required: true,
    },
    logs: { type: [String], default: [] },
    metrics: { type: Schema.Types.Mixed },
    requestPayload: { type: Schema.Types.Mixed },
    results: { type: Schema.Types.Mixed },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { _id: false }
);
JobMongooseSchema.index({ flowId: 1 });

export const BrandModel =
  mongoose.models.Brand || mongoose.model('Brand', BrandMongooseSchema, 'brands');
export const FlowModel =
  mongoose.models.Flow || mongoose.model('Flow', FlowMongooseSchema, 'flows');
export const JobModel =
  mongoose.models.Job || mongoose.model('Job', JobMongooseSchema, 'jobs');

export function docToBrand(doc: mongoose.FlattenMaps<BrandData & { _id: string }>): BrandData {
  const o = doc as unknown as { _id: string } & Omit<BrandData, 'id'>;
  return {
    id: o._id,
    name: o.name,
    description: o.description,
    color: o.color,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

export function docToFlow(doc: mongoose.FlattenMaps<FlowData & { _id: string }>): FlowData {
  const o = doc as unknown as { _id: string } & Omit<FlowData, 'id'>;
  return {
    id: o._id,
    brandId: o.brandId,
    isShopify: o.isShopify,
    type: o.type as FlowData['type'],
    name: o.name,
    url: o.url,
    formData: o.formData ?? { name: '', phone: '' },
    schedule: o.schedule,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

export function docToJob(doc: mongoose.FlattenMaps<JobData>): JobData {
  const o = doc as unknown as JobData;
  return {
    _id: o._id,
    flowId: o.flowId,
    brandId: o.brandId,
    type: o.type,
    status: o.status,
    logs: o.logs ?? [],
    metrics: o.metrics,
    requestPayload: o.requestPayload,
    results: o.results,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}
