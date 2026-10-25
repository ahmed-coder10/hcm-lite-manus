import { env } from './config/env.js';
import { initDb, closeDb } from './db/index.js';
import { createApp } from './app.js';

async function main() {
  const dbFile = process.env.DB_FILE || './data/hcm.db';
  initDb(dbFile);
  console.log(`[db] SQLite ready at ${dbFile}`);

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log('');
    console.log('  HCM Lite API');
    console.log(`  -> http://localhost:${env.port}/api/health`);
    console.log(`  -> AI: ${env.ai.apiKey ? `${env.ai.model} via ${env.ai.baseUrl}` : 'no key — local rules engine active'}`);
    console.log('');
  });

  const shutdown = (signal) => {
    console.log(`\n[server] ${signal} received — shutting down`);
    server.close(() => {
      try {
        closeDb();
      } catch {
        /* ignore */
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});
