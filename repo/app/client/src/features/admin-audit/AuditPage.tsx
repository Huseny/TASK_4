import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditApi } from '../../lib/api';
import { formatAuditTimestamp } from '../../lib/formatters';
import styles from './AuditPage.module.css';

export function AuditPage() {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>({});

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['audit', appliedFilters],
    queryFn: () => auditApi.list(appliedFilters),
  });

  const events = data?.events ?? [];

  const handleSearch = () => {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(filters)) {
      if (v.trim()) clean[k] = v.trim();
    }
    setAppliedFilters(clean);
  };

  return (
    <div>
      <h2>Audit Log</h2>
      <div className={styles.filters}>
        {['actionType', 'actorUserId', 'resourceType', 'outcome'].map((f) => (
          <label key={f} className={styles.filterLabel}>
            {f}
            <input
              className={styles.filterInput}
              value={filters[f] ?? ''}
              onChange={(e) => setFilters((prev) => ({ ...prev, [f]: e.target.value }))}
              placeholder={`Filter by ${f}`}
            />
          </label>
        ))}
        <button className={styles.searchBtn} onClick={handleSearch}>Search</button>
      </div>
      {isLoading && <p>Loading...</p>}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Resource</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className={e.outcome === 'FAILURE' ? styles.failure : ''}>
                <td className={styles.ts}>{formatAuditTimestamp(e.timestamp)}</td>
                <td>{e.actorUsername}</td>
                <td><code>{e.actionType}</code></td>
                <td>{e.resourceType}{e.resourceId ? ` #${e.resourceId.slice(-6)}` : ''}</td>
                <td>{e.outcome}</td>
              </tr>
            ))}
            {events.length === 0 && !isLoading && (
              <tr><td colSpan={5} className={styles.empty}>No events found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
