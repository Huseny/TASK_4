import { useQuery } from '@tanstack/react-query';
import { metricsApi } from '../../lib/api';
import styles from './MetricsPage.module.css';

interface MetricsData {
  rpm: { '1m': number; '5m': number; '15m': number };
  avgLatencyMs: { '1m': number; '5m': number; '15m': number };
  mongoPool: { poolSize: number; checkedOut: number } | null;
}

export function MetricsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['metrics'],
    queryFn: metricsApi.get,
    refetchInterval: 15_000,
  });

  const m = data as MetricsData | undefined;

  return (
    <div>
      <h2>System Metrics</h2>
      {isLoading && <p>Loading metrics...</p>}
      {m && (
        <div className={styles.grid}>
          <div className={styles.card}>
            <h3>Requests per minute</h3>
            <table className={styles.metricsTable}>
              <tbody>
                <tr><td>Last 1m</td><td>{m.rpm['1m']}</td></tr>
                <tr><td>Last 5m</td><td>{m.rpm['5m']}</td></tr>
                <tr><td>Last 15m</td><td>{m.rpm['15m']}</td></tr>
              </tbody>
            </table>
          </div>
          <div className={styles.card}>
            <h3>Average latency</h3>
            <table className={styles.metricsTable}>
              <tbody>
                <tr><td>Last 1m</td><td>{m.avgLatencyMs['1m']} ms</td></tr>
                <tr><td>Last 5m</td><td>{m.avgLatencyMs['5m']} ms</td></tr>
                <tr><td>Last 15m</td><td>{m.avgLatencyMs['15m']} ms</td></tr>
              </tbody>
            </table>
          </div>
          {m.mongoPool && (
            <div className={styles.card}>
              <h3>MongoDB Pool</h3>
              <table className={styles.metricsTable}>
                <tbody>
                  <tr><td>Pool size</td><td>{m.mongoPool.poolSize}</td></tr>
                  <tr><td>Checked out</td><td>{m.mongoPool.checkedOut}</td></tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
