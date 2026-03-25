/**
 * One-time: replace Mongo brands/flows/jobs with contents of data/brands, data/flows, data/jobs.
 * Clears those collections first, then inserts only what is on disk (no demo seed).
 * Loads `.env` then `.env.local` from the project root (tsx does not load them by default).
 */
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { FileStore } from '../src/lib/filestore';
import { connectMongo } from '../src/lib/store/mongo-connect';
import { BrandModel, FlowModel, JobModel } from '../src/lib/store/models';
import { MongoStore } from '../src/lib/store/mongo-store';

function loadProjectEnv() {
  const root = process.cwd();
  if (existsSync(resolve(root, '.env'))) {
    loadEnv({ path: resolve(root, '.env') });
  }
  if (existsSync(resolve(root, '.env.local'))) {
    loadEnv({ path: resolve(root, '.env.local'), override: true });
  }
}

async function main() {
  loadProjectEnv();

  if (!process.env.MONGODB_URI?.trim()) {
    console.error(
      'MONGODB_URI is missing. Add it to .env or .env.local in the project root, or set it in the shell before running this script.'
    );
    process.exit(1);
  }

  await connectMongo();

  await Promise.all([
    BrandModel.deleteMany({}),
    FlowModel.deleteMany({}),
    JobModel.deleteMany({}),
  ]);
  console.log('Cleared Mongo brands, flows, jobs collections.');

  const brands = await FileStore.getBrands();
  const flows = await FileStore.getFlows();
  const jobs = await FileStore.listJobs();

  for (const b of brands) {
    await MongoStore.saveBrand(b);
    console.log('Brand', b.id);
  }
  for (const f of flows) {
    await MongoStore.saveFlow(f);
    console.log('Flow', f.id);
  }
  for (const j of jobs) {
    await MongoStore.saveJob(j);
    console.log('Job', j._id);
  }

  console.log(`Done: ${brands.length} brands, ${flows.length} flows, ${jobs.length} jobs`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
