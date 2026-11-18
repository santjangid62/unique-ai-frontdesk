/**
 * Verifies the configured MongoDB connection and reports collection/index state.
 * Usage: npm run db:check
 */
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';
import { env, mongoUriProblem } from '../config/env.js';

const MODELS = [
  'Tenant',
  'User',
  'Plan',
  'Subscription',
  'BusinessProfile',
  'AiAgent',
  'KnowledgeEntry',
  'KnowledgeDocument',
  'Lead',
  'Customer',
  'Conversation',
  'Message',
  'Call',
  'Appointment',
  'Integration',
  'Notification',
  'UsageLog',
  'AuditLog',
  'RefreshToken',
  'AutomationRule',
  'PasswordReset',
  'PlatformSetting',
];

(async () => {
  const uriProblem = mongoUriProblem(env.mongoUri);
  if (uriProblem) {
    console.error(`\n  ${uriProblem}\n`);
    process.exit(1);
  }

  const masked = env.mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:••••@');
  console.log(`\nConnecting to ${masked}\n`);

  try {
    await connectDB();
    const admin = mongoose.connection.db.admin();
    const info = await admin.serverStatus();
    console.log(`  host     : ${mongoose.connection.host}`);
    console.log(`  database : ${mongoose.connection.name}`);
    console.log(`  version  : ${info.version}`);
    console.log(`  uptime   : ${Math.round(info.uptime)}s`);
  } catch (error) {
    console.error(`\n  Connection failed: ${error.message}`);
    console.error('  Check the username/password, the cluster host and the IP allowlist (0.0.0.0/0 for Vercel).');
    process.exit(1);
  }

  for (const name of MODELS) {
    await import(`../models/${name}.js`);
  }

  console.log('\n  Collections / documents:');
  for (const name of MODELS) {
    const model = mongoose.models[name];
    if (!model) {
      console.log(`  - ${name.padEnd(18)} (not registered)`);
      continue;
    }
    const count = await model.countDocuments();
    const collection = model.collection.collectionName;
    const indexes = await model.collection.indexes().catch(() => []);
    console.log(`  - ${collection.padEnd(20)} ${String(count).padStart(5)} docs · ${indexes.length} indexes`);
  }

  await disconnectDB();
  console.log('\n  Database check complete.\n');
  process.exit(0);
})().catch(async (error) => {
  console.error('[db:check] failed', error);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
