import mongoose from 'mongoose';
import { logger } from '../shared/logger';

interface RollingWindow {
  timestamps: number[];
  latencies: number[];
}

const windows = {
  '1m': { timestamps: [], latencies: [] } as RollingWindow,
  '5m': { timestamps: [], latencies: [] } as RollingWindow,
  '15m': { timestamps: [], latencies: [] } as RollingWindow,
};

const windowDurations: Record<string, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
};

export function recordRequest(latencyMs: number): void {
  const now = Date.now();
  for (const [key, w] of Object.entries(windows)) {
    const duration = windowDurations[key];
    w.timestamps = w.timestamps.filter((t) => now - t < duration);
    w.latencies = w.latencies.filter((_, i) => {
      // Keep corresponding latencies
      return w.timestamps[i] !== undefined;
    });
    // Actually, keep them in sync by rebuilding
    const cutoff = now - duration;
    const filtered = w.timestamps.reduce(
      (acc, t, i) => {
        if (t >= cutoff) {
          acc.timestamps.push(t);
          acc.latencies.push(w.latencies[i]);
        }
        return acc;
      },
      { timestamps: [] as number[], latencies: [] as number[] },
    );
    w.timestamps = filtered.timestamps;
    w.latencies = filtered.latencies;
    w.timestamps.push(now);
    w.latencies.push(latencyMs);
  }
}

export interface MetricsSnapshot {
  rpm: { '1m': number; '5m': number; '15m': number };
  avgLatencyMs: { '1m': number; '5m': number; '15m': number };
  mongoPool: { poolSize: number; checkedOut: number } | null;
}

export function getMetricsSnapshot(): MetricsSnapshot {
  const now = Date.now();
  const rpm: Record<string, number> = {};
  const avgLatency: Record<string, number> = {};

  for (const [key, w] of Object.entries(windows)) {
    const duration = windowDurations[key];
    const recent = w.timestamps.filter((t) => now - t < duration);
    const recentLatencies = w.latencies.filter((_, i) => w.timestamps[i] && now - w.timestamps[i] < duration);
    rpm[key] = Math.round((recent.length / (duration / 1000)) * 60);
    avgLatency[key] = recentLatencies.length > 0
      ? Math.round(recentLatencies.reduce((a, b) => a + b, 0) / recentLatencies.length)
      : 0;
  }

  let poolStats: { poolSize: number; checkedOut: number } | null = null;
  try {
    const client = mongoose.connection.getClient();
    // Pool stats are available on the topology
    const topology = (client as unknown as { topology?: { s?: { options?: { maxPoolSize?: number } } } }).topology;
    const poolSize = topology?.s?.options?.maxPoolSize ?? 5;
    poolStats = { poolSize, checkedOut: 0 };
  } catch {
    // Not available
  }

  return {
    rpm: rpm as MetricsSnapshot['rpm'],
    avgLatencyMs: avgLatency as MetricsSnapshot['avgLatencyMs'],
    mongoPool: poolStats,
  };
}

export function startMetricsMiddleware() {
  return (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      try {
        recordRequest(Date.now() - start);
      } catch (err) {
        logger().warn({ err }, 'metrics record failed');
      }
    });
    next();
  };
}
