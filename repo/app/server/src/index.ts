import { connectMongo } from './db/mongo';
import { createApp } from './app';
import { getConfig } from './config';
import { logger } from './shared/logger';
import { startScheduler, stopScheduler } from './pipeline/scheduler';
import { startWorker, stopWorker } from './pipeline/worker';
import execa from 'execa';

async function checkGitAvailable(): Promise<void> {
  try {
    await execa('git', ['--version']);
  } catch {
    throw new Error('git is not available on PATH. Install git and try again.');
  }
}

async function main(): Promise<void> {
  await checkGitAvailable();

  const cfg = getConfig();
  await connectMongo(cfg.mongo.url);

  const app = createApp();
  const server = app.listen(cfg.http.port, cfg.http.host, () => {
    logger().info({ port: cfg.http.port, host: cfg.http.host }, 'MergeStream server started');
  });

  startScheduler();
  startWorker();

  const shutdown = async (): Promise<void> => {
    logger().info('Shutting down gracefully...');
    stopScheduler();
    stopWorker();
    server.close(() => {
      logger().info('HTTP server closed');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
