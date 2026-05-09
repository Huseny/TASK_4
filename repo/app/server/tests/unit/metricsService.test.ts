import { recordRequest, getMetricsSnapshot } from '../../src/metrics/metricsService';

describe('metricsService', () => {
  it('returns a fully-shaped snapshot with empty windows', () => {
    const snap = getMetricsSnapshot();
    expect(snap).toHaveProperty('rpm.1m');
    expect(snap).toHaveProperty('rpm.5m');
    expect(snap).toHaveProperty('rpm.15m');
    expect(snap).toHaveProperty('avgLatencyMs.1m');
    expect(snap).toHaveProperty('mongoPool');
  });

  it('records latencies and updates the rolling average', () => {
    for (let i = 0; i < 10; i++) recordRequest(50);
    const snap = getMetricsSnapshot();
    expect(snap.avgLatencyMs['1m']).toBeGreaterThan(0);
    expect(snap.rpm['1m']).toBeGreaterThan(0);
  });

  it('different request samples produce non-zero per-window stats', () => {
    recordRequest(10);
    recordRequest(200);
    const snap = getMetricsSnapshot();
    expect(snap.avgLatencyMs['5m']).toBeGreaterThan(0);
    expect(snap.avgLatencyMs['15m']).toBeGreaterThan(0);
  });
});
