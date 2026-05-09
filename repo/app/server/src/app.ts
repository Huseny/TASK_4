import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { logger } from './shared/logger';
import { requestIdMiddleware } from './middleware/requestId';
import { errorMiddleware, notFoundMiddleware } from './middleware/error';
import { authRouter } from './auth/authRoutes';
import { usersRouter } from './users/usersRoutes';
import { projectsRouter } from './projects/projectsRoutes';
import { pipelineRouter } from './pipeline/pipelineRoutes';
import { notificationsRouter } from './notifications/notificationsRoutes';
import { auditRouter } from './audit/auditRoutes';
import { metricsRouter } from './metrics/metricsRoutes';
import { startMetricsMiddleware } from './metrics/metricsService';
import { getConfig } from './config';

export function createApp(): express.Application {
  const app = express();
  const cfg = getConfig();

  app.set('trust proxy', 1);

  app.use(
    pinoHttp({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logger: logger() as any,
      customLogLevel: (_req, res) => (res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      autoLogging: cfg.env !== 'test',
    }),
  );

  app.use(requestIdMiddleware);
  app.use(startMetricsMiddleware());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/pipeline', pipelineRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/metrics', metricsRouter);

  // Serve the React SPA for non-API paths when the client bundle exists
  const clientDist = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^\/(?!api(?:\/|$))/, (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
