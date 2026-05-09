import { loadEnv, toAppConfig, type AppConfig } from './env';

let cached: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (!cached) cached = toAppConfig(loadEnv());
  return cached;
}

export function resetConfigForTests(): void {
  cached = undefined;
}

export type { AppConfig };
