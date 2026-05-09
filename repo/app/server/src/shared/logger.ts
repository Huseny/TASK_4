import pino from 'pino';
import { getConfig } from '../config';

export function createLogger(): pino.Logger {
  const cfg = getConfig();
  const options: pino.LoggerOptions = {
    level: cfg.observability.logLevel,
    redact: {
      paths: [
        'password',
        '*.password',
        'passwordHash',
        '*.passwordHash',
        'refreshToken',
        '*.refreshToken',
        'refreshTokenHash',
        '*.refreshTokenHash',
        'accessToken',
        '*.accessToken',
        'csrfToken',
        '*.csrfToken',
        'authorization',
        'cookie',
        'req.headers.cookie',
        'req.headers.authorization',
        'req.headers["x-csrf-token"]',
      ],
      remove: true,
    },
  };
  if (cfg.env === 'development') {
    options.transport = {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
    };
  }
  return pino(options);
}

let cached: pino.Logger | undefined;
export function logger(): pino.Logger {
  if (!cached) cached = createLogger();
  return cached;
}
