import type { Config } from 'jest';

const transform = {
  '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }] as [string, Record<string, unknown>],
};

const base = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform,
  setupFilesAfterEnv: ['<rootDir>/tests/setup/afterEach.ts'],
};

const config: Config = {
  rootDir: '.',
  testTimeout: 30_000,
  // Allow parallel workers — unit tests are stateless, integration/contract share
  // the in-memory MongoDB but run sequentially via --runInBand on the server script
  maxWorkers: '50%',
  forceExit: true,
  globalSetup: '<rootDir>/tests/setup/globalSetup.ts',
  globalTeardown: '<rootDir>/tests/setup/globalTeardown.ts',
  projects: [
    { ...base, displayName: 'unit', testMatch: ['<rootDir>/tests/unit/**/*.test.ts'] },
    { ...base, displayName: 'integration', testMatch: ['<rootDir>/tests/integration/**/*.test.ts'] },
    { ...base, displayName: 'contract', testMatch: ['<rootDir>/tests/contract/**/*.test.ts'] },
  ],
};

export default config;
