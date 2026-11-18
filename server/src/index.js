import { env, assertProdConfig, mongoUriProblem } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';

let memoryServer = null;

async function start() {
  assertProdConfig();

  // Opt-in in-memory MongoDB for offline development. It downloads a large
  // server binary on first use, so it is never started implicitly.
  if (!env.mongoUri && !env.isProd && process.env.USE_IN_MEMORY_DB === '1') {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create({ instance: { dbName: 'unique-frontdesk' } });
    env.mongoUri = memoryServer.getUri('unique-frontdesk');
    console.log('[db] Using an in-memory MongoDB (USE_IN_MEMORY_DB=1); data is lost on exit');
  }

  const uriProblem = mongoUriProblem(env.mongoUri);
  if (uriProblem) {
    console.error(`[db] ${uriProblem}`);
    console.error('[db] Set MONGODB_URI in .env, or run with USE_IN_MEMORY_DB=1 for a throwaway local database.');
    process.exit(1);
  }

  const { default: app } = await import('./app.js');
  await connectDB();

  // First-run convenience: populate plans and the demo workspace.
  const User = (await import('./models/User.js')).default;
  if ((await User.countDocuments()) === 0) {
    const { runSeed } = await import('./scripts/seed.js');
    await runSeed({ quiet: false });
  }

  const server = app.listen(env.port, () => {
    console.log(`\n  Unique AI Frontdesk API listening on http://localhost:${env.port}`);
    console.log(`  Environment: ${env.nodeEnv}`);
    console.log(`  AI provider: ${env.openaiKey ? 'OpenAI configured' : 'grounded fallback (no OPENAI_API_KEY)'}\n`);
  });

  const shutdown = async (signal) => {
    console.log(`\n[server] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDB();
      if (memoryServer) await memoryServer.stop();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((error) => {
  console.error('[server] failed to start', error);
  process.exit(1);
});
