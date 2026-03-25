import { FileStore } from '@/lib/filestore';
import type { AppStore } from '@/lib/store/interface';
import { MongoStore } from '@/lib/store/mongo-store';

export type { AppStore } from '@/lib/store/interface';

/**
 * Picks the persistence backend for brands/flows/jobs.
 * - Explicit `STORE_BACKEND=file` → JSON under `data/` (ignores Mongo even if URI is set).
 * - Explicit `STORE_BACKEND=mongo` → MongoDB.
 * - Otherwise: if `MONGODB_URI` is set, use Mongo so the UI stays in sync with the same DB as migrate/worker.
 * - Else → file store.
 */
function backend(): 'file' | 'mongo' {
  const explicit = (process.env.STORE_BACKEND ?? '').trim().toLowerCase();
  if (explicit === 'file') return 'file';
  if (explicit === 'mongo' || explicit === 'mongodb') return 'mongo';
  if (process.env.MONGODB_URI?.trim()) return 'mongo';
  return 'file';
}

let cached: AppStore | null = null;
let cachedFor: string | null = null;

/** Resolves the active store; safe to call per request in serverless. */
export function getStore(): AppStore {
  const b = backend();
  if (cached && cachedFor === b) return cached;
  cachedFor = b;
  cached = b === 'mongo' ? MongoStore : FileStore;
  return cached;
}
