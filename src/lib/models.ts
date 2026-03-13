import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IBrand extends Document {
  name: string;
  slug: string;
  startUrl: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BrandSchema: Schema = new Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  startUrl: { type: String, required: true },
  active: { type: Boolean, default: true },
}, { timestamps: true });

export const Brand: Model<IBrand> = mongoose.models.Brand || mongoose.model<IBrand>('Brand', BrandSchema);

export interface IJob extends Document {
  brandId: string;
  type: 'form-submission' | 'collection-scrape';
  status: 'pending' | 'running' | 'completed' | 'failed';
  logs: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  results?: any;
  createdAt: Date;
  updatedAt: Date;
}

const JobSchema: Schema = new Schema({
  brandId: { type: String, required: true },
  type: { type: String, enum: ['form-submission', 'collection-scrape'], required: true },
  status: { type: String, enum: ['pending', 'running', 'completed', 'failed'], default: 'pending' },
  logs: [{ type: String }],
  results: { type: Schema.Types.Mixed },
}, { timestamps: true });

export const Job: Model<IJob> = mongoose.models.Job || mongoose.model<IJob>('Job', JobSchema);

export interface IProductReport extends Document {
  jobId: mongoose.Types.ObjectId;
  brandId: string;
  url: string;
  name: string;
  variants: Array<{
    name: string;
    available: boolean;
    price?: string;
  }>;
  psiScore?: number;
  createdAt: Date;
}

const ProductReportSchema: Schema = new Schema({
  jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
  brandId: { type: String, required: true },
  url: { type: String, required: true },
  name: { type: String },
  variants: [{
    name: { type: String },
    available: { type: Boolean },
    price: { type: String },
  }],
  psiScore: { type: Number },
}, { timestamps: true });

export const ProductReport: Model<IProductReport> = mongoose.models.ProductReport || mongoose.model<IProductReport>('ProductReport', ProductReportSchema);
