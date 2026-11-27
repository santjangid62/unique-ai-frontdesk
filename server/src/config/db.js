import mongoose from 'mongoose';
import { env, previewDbProblem } from './env.js';

let connectionPromise = null;
let previewGuardLogged = false;

/**
 * Connects (or reuses) the MongoDB connection. Cached per process so serverless
 * invocations on the same instance reuse one pool.
 */
export async function connectDB(uri = env.mongoUri) {
  if (!uri) {
    const error = new Error('MONGODB_URI is not configured');
    error.code = 'DB_NOT_CONFIGURED';
    throw error;
  }
  // Never let a Vercel preview deployment open the production database: a
  // copied MONGODB_URI would otherwise expose (and let PRs overwrite) live data.
  const previewProblem = previewDbProblem(uri);
  if (previewProblem) {
    if (!previewGuardLogged) {
      previewGuardLogged = true;
      console.error(`[db] ${previewProblem}`);
    }
    const error = new Error(previewProblem);
    error.code = 'PREVIEW_PRODUCTION_DB';
    throw error;
  }

  if (connectionPromise) return connectionPromise;

  mongoose.set('strictQuery', true);

  connectionPromise = mongoose
    .connect(uri, {
      serverSelectionTimeoutMS: 15000,
      maxPoolSize: 10,
      retryWrites: true,
    })
    .catch((error) => {
      connectionPromise = null;
      throw error;
    });

  return connectionPromise;
}

export function dbState() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return states[mongoose.connection.readyState] || 'unknown';
}

export async function disconnectDB() {
  connectionPromise = null;
  await mongoose.disconnect();
}
