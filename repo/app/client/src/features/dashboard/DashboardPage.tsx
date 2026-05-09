import { useState } from 'react';
import { useDashboardSummary } from './useDashboardSummary';
import { StatusBadge } from '../../components/StatusBadge';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { pipelineApi, projectsApi } from '../../lib/api';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import type { DashboardProject } from '../../lib/types';
import styles from './DashboardPage.module.css';

function nanoidSimple(size = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(size))).map((b) => chars[b % chars.length]).join('');
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}

function TriggerButton({ p, canTrigger }: { p: DashboardProject; canTrigger: boolean }) {
  const qc = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [triggering, setTriggering] = useState(false);

  const { data: branchData } = useQuery({
    queryKey: ['branches', p.projectId],
    queryFn: () => projectsApi.getBranches(p.projectId),
    enabled: picking,
  });

  const activeBranches = branchData?.branches.filter((b) => b.isActive) ?? [];

  const doTrigger = async (sourceBranch: string) => {
    setTriggering(true);
    try {
      await pipelineApi.trigger(p.projectId, sourceBranch, nanoidSimple(12));
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setTriggering(false);
      setPicking(false);
    }
  };

  if (!canTrigger) return null;

  if (!picking) {
    return (
      <button
        className={styles.triggerBtn}
        onClick={() => setPicking(true)}
        disabled={!p.isActive}
      >
        Trigger
      </button>
    );
  }

  if (!branchData) {
    return <span className={styles.triggerLoading}>Loading branches…</span>;
  }

  if (activeBranches.length === 0) {
    return (
      <span className={styles.triggerEmpty}>
        No active branches.{' '}
        <button className={styles.triggerCancel} onClick={() => setPicking(false)}>Cancel</button>
      </span>
    );
  }

  return (
    <div className={styles.triggerPicker}>
      <select
        className={styles.triggerSelect}
        defaultValue=""
        onChange={(e) => { if (e.target.value) void doTrigger(e.target.value); }}
        disabled={triggering}
      >
        <option value="" disabled>Pick branch…</option>
        {activeBranches.map((b) => (
          <option key={b.id} value={b.branchName}>{b.branchName}</option>
        ))}
      </select>
      <button className={styles.triggerCancel} onClick={() => setPicking(false)}>Cancel</button>
    </div>
  );
}

export function DashboardPage() {
  const { data, isLoading, error } = useDashboardSummary();
  const { user } = useAuth();

  if (isLoading) return <p>Loading dashboard...</p>;
  if (error) return <p className={styles.error}>Failed to load dashboard.</p>;

  const { projects, queue } = data!;
  const canTrigger = user?.role === 'ADMIN' || user?.role === 'MAINTAINER' || user?.role === 'DEVELOPER';

  return (
    <div>
      <div className={styles.header}>
        <h1>Dashboard</h1>
        <div className={styles.queueStats}>
          <span>Queued: {queue.queued}</span>
          <span>Running: {queue.running}</span>
        </div>
      </div>
      <div className={styles.grid}>
        {projects.map((p) => (
          <div key={p.projectId} className={`${styles.card} ${!p.isActive ? styles.inactive : ''}`}>
            <div className={styles.cardHeader}>
              <Link to={`/projects/${p.projectId}`} className={styles.projectName}>{p.name}</Link>
              {p.latestRun && <StatusBadge status={p.latestRun.status} />}
            </div>
            {p.latestRun ? (
              <div className={styles.runInfo}>
                <span className={styles.branch}>{p.latestRun.sourceBranch}</span>
                <span className={styles.time}>{relativeTime(p.latestRun.finishedAt ?? p.latestRun.startedAt)}</span>
              </div>
            ) : (
              <p className={styles.noRuns}>No runs yet</p>
            )}
            <div className={styles.cardActions}>
              <Link to={`/projects/${p.projectId}/history`} className={styles.link}>History</Link>
              <TriggerButton p={p} canTrigger={canTrigger} />
            </div>
          </div>
        ))}
        {projects.length === 0 && <p>No projects assigned to you yet.</p>}
      </div>
    </div>
  );
}
