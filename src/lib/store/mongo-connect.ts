import mongoose from 'mongoose';

declare global {
  var mongooseCache: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
}

const g = global as typeof globalThis & { mongooseCache?: typeof global.mongooseCache };

if (!g.mongooseCache) {
  g.mongooseCache = { conn: null, promise: null };
}

export async function connectMongo(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set');
  }

  if (g.mongooseCache!.conn) {
    return g.mongooseCache!.conn;
  }

  if (!g.mongooseCache!.promise) {
    g.mongooseCache!.promise = mongoose.connect(uri);
  }

  try {
    const conn = await g.mongooseCache!.promise;
    g.mongooseCache!.conn = conn;
    return conn;
  } catch (err) {
    g.mongooseCache!.promise = null;
    g.mongooseCache!.conn = null;
    console.error('[mongo-connect] Connection failed, cache cleared for retry:', err);
    throw err;
  }
}
