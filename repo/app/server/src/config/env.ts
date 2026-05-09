import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

const envFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile });
}

const splitList = (v: string | undefined): string[] =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const EnvSchema = z.object({
  MS_PORT: z.coerce.number().int().positive().default(4000),
  MS_HOST: z.string().default('127.0.0.1'),
  MS_CLIENT_ORIGIN: z.string().default('http://127.0.0.1:4000'),

  MS_MONGO_URL: z.string().default('mongodb://127.0.0.1:27017/mergestream'),

  MS_JWT_ACCESS_SECRET: z.string().min(16),
  MS_JWT_REFRESH_SECRET: z.string().min(16),
  MS_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  MS_REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(28_800),
  MS_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(28_800),
  MS_BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  MS_LOCKOUT_THRESHOLD: z.coerce.number().int().positive().default(5),
  MS_LOCKOUT_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),

  MS_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),

  MS_ALLOWED_REPO_ROOTS: z.string().default('./fixtures/repos'),
  MS_WORKSPACE_ROOT: z.string().default('./.tmp/workspaces'),
  MS_TEST_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(600),

  MS_MAX_CONCURRENT_RUNS: z.coerce.number().int().positive().default(4),
  MS_MAX_QUEUED_RUNS: z.coerce.number().int().positive().default(50),

  MS_RUNS_RETENTION_PER_PROJECT: z.coerce.number().int().positive().default(500),
  MS_NOTIFICATIONS_RETENTION_PER_USER: z.coerce.number().int().positive().default(200),
  MS_AUDIT_SEARCH_LIMIT: z.coerce.number().int().positive().default(1000),
  MS_HISTORY_DEFAULT_LIMIT: z.coerce.number().int().positive().default(50),

  MS_LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  MS_SEED_ADMIN_USERNAME: z.string().default('admin'),
  MS_SEED_MAINTAINER_USERNAME: z.string().default('maintainer'),
  MS_SEED_DEVELOPER_USERNAME: z.string().default('developer'),
  MS_SEED_ADMIN_PASSWORD: z.string().optional(),
  MS_SEED_MAINTAINER_PASSWORD: z.string().optional(),
  MS_SEED_DEVELOPER_PASSWORD: z.string().optional(),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type EnvVars = z.infer<typeof EnvSchema>;

export function loadEnv(): EnvVars {
  const defaults: Record<string, string> = {
    MS_JWT_ACCESS_SECRET: process.env.NODE_ENV === 'test' ? 'test-access-secret-test-access-secret-32bytes' : '',
    MS_JWT_REFRESH_SECRET: process.env.NODE_ENV === 'test' ? 'test-refresh-secret-test-refresh-secret-32bytes' : '',
  };
  const merged = { ...defaults, ...process.env };
  const parsed = EnvSchema.safeParse(merged);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}

export interface AppConfig {
  http: { host: string; port: number; clientOrigin: string };
  mongo: { url: string };
  auth: {
    accessSecret: string;
    refreshSecret: string;
    accessTtlSeconds: number;
    refreshTtlSeconds: number;
    sessionTtlSeconds: number;
    bcryptRounds: number;
    lockoutThreshold: number;
    lockoutWindowSeconds: number;
  };
  rateLimit: { perMinute: number };
  pipeline: {
    allowedRepoRoots: string[];
    workspaceRoot: string;
    testTimeoutSeconds: number;
    maxConcurrent: number;
    maxQueued: number;
    runsRetention: number;
    historyDefaultLimit: number;
  };
  notifications: { retentionPerUser: number };
  audit: { searchLimit: number };
  observability: { logLevel: EnvVars['MS_LOG_LEVEL'] };
  seed: {
    admin: string;
    maintainer: string;
    developer: string;
    adminPassword?: string;
    maintainerPassword?: string;
    developerPassword?: string;
  };
  env: 'development' | 'test' | 'production';
}

export function toAppConfig(v: EnvVars): AppConfig {
  return {
    http: { host: v.MS_HOST, port: v.MS_PORT, clientOrigin: v.MS_CLIENT_ORIGIN },
    mongo: { url: v.MS_MONGO_URL },
    auth: {
      accessSecret: v.MS_JWT_ACCESS_SECRET,
      refreshSecret: v.MS_JWT_REFRESH_SECRET,
      accessTtlSeconds: v.MS_ACCESS_TOKEN_TTL_SECONDS,
      refreshTtlSeconds: v.MS_REFRESH_TOKEN_TTL_SECONDS,
      sessionTtlSeconds: v.MS_SESSION_TTL_SECONDS,
      bcryptRounds: v.MS_BCRYPT_ROUNDS,
      lockoutThreshold: v.MS_LOCKOUT_THRESHOLD,
      lockoutWindowSeconds: v.MS_LOCKOUT_WINDOW_SECONDS,
    },
    rateLimit: { perMinute: v.MS_RATE_LIMIT_PER_MINUTE },
    pipeline: {
      allowedRepoRoots: splitList(v.MS_ALLOWED_REPO_ROOTS).map((p) => path.resolve(p)),
      workspaceRoot: path.resolve(v.MS_WORKSPACE_ROOT),
      testTimeoutSeconds: v.MS_TEST_TIMEOUT_SECONDS,
      maxConcurrent: v.MS_MAX_CONCURRENT_RUNS,
      maxQueued: v.MS_MAX_QUEUED_RUNS,
      runsRetention: v.MS_RUNS_RETENTION_PER_PROJECT,
      historyDefaultLimit: v.MS_HISTORY_DEFAULT_LIMIT,
    },
    notifications: { retentionPerUser: v.MS_NOTIFICATIONS_RETENTION_PER_USER },
    audit: { searchLimit: v.MS_AUDIT_SEARCH_LIMIT },
    observability: { logLevel: v.MS_LOG_LEVEL },
    seed: {
      admin: v.MS_SEED_ADMIN_USERNAME,
      maintainer: v.MS_SEED_MAINTAINER_USERNAME,
      developer: v.MS_SEED_DEVELOPER_USERNAME,
      adminPassword: v.MS_SEED_ADMIN_PASSWORD,
      maintainerPassword: v.MS_SEED_MAINTAINER_PASSWORD,
      developerPassword: v.MS_SEED_DEVELOPER_PASSWORD,
    },
    env: v.NODE_ENV,
  };
}
