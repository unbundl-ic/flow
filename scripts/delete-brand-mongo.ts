/**
 * Remove one brand and its flows/jobs from MongoDB (CLI / automation).
 * With MONGODB_URI set, the app normally syncs deletes via the UI; this script is optional.
 *
 * Usage: npm run delete-brand:mongo -- <brandId>
 */
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { connectMongo } from '../src/lib/store/mongo-connect';
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
  const brandId = process.argv[2]?.trim();
  if (!brandId) {
    console.error('Usage: npm run delete-brand:mongo -- <brandId>');
    process.exit(1);
  }

  loadProjectEnv();

  if (!process.env.MONGODB_URI?.trim()) {
    console.error(
      'MONGODB_URI is missing. Add it to .env or .env.local, or set it in the shell.'
    );
    process.exit(1);
  }

  await connectMongo();
  const ok = await MongoStore.deleteBrand(brandId);
  if (!ok) {
    console.error('Brand not found in MongoDB:', brandId);
    process.exit(1);
  }
  console.log('Deleted brand and related flows/jobs from MongoDB:', brandId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
