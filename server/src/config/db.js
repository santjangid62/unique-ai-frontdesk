import mongoose from 'mongoose';
import { env } from './env.js';

let connectionPromise = null;

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
