import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pipelineApi } from '../../lib/api';
import { useAuth } from '../../app/AuthContext';
import { StatusBadge } from '../../components/StatusBadge';
import type { RunDto } from '../../lib/types';
import styles from './HistoryPage.module.css';

function RunRow({ run }: { run: RunDto }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);

  const { data: detailData } = useQuery({
    queryKey: ['run', run.projectId, run.id],
    queryFn: () => pipelineApi.getRun(run.projectId, run.id),
    enabled: expanded,
  });

  const cancel = useMutation({
    mutationFn: () => pipelineApi.cancel(run.projectId, run.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['runs', run.projectId] }),
  });

  const attempts = detailData?.run.attempts ?? [];
  const canCancel = (run.status === 'QUEUED' || run.status === 'RUNNING') &&
    (user?.role === 'ADMIN' || user?.role === 'MAINTAINER');

  return (
    <div className={styles.runRow}>
      <div className={styles.runHeader} onClick={() => setExpanded((v) => !v)}>
        <StatusBadge status={run.status} />
        <span className={styles.branch}>{run.sourceBranch}</span>
        <span className={styles.sha}>{run.sourceCommitSha?.slice(0, 8) ?? '—'}</span>
        <span className={styles.time}>{run.finishedAt ? new Date(run.finishedAt).toLocaleString() : '—'}</span>
        {run.status === 'CONFLICT' && (
          <Link to={`/projects/${run.projectId}/runs/${run.id}/conflicts`} className={styles.conflictLink} onClick={(e) => e.stopPropagation()}>
            View Conflicts
          </Link>
        )}
        {canCancel && (
          <button
            className={styles.cancelBtn}
            onClick={(e) => { e.stopPropagation(); cancel.mutate(); }}
            disabled={cancel.isPending}
          >
            Cancel
          </button>
        )}
        <span className={styles.toggle}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div className={styles.logs}>
          {!detailData && <p className={styles.loadingLogs}>Loading logs…</p>}
          {detailData && attempts.length === 0 && <p className={styles.loadingLogs}>No test logs for this run.</p>}
          {attempts.map((a) => (
            <div key={a.attemptIndex} className={styles.attempt}>
              <div className={styles.attemptHeader}>
                Attempt {a.attemptIndex + 1} — exit code {a.exitCode}
                {a.logsTruncated && <span className={styles.truncatedBadge}>Logs truncated at 2MB</span>}
              </div>
              {a.stdout && <pre className={styles.logPre}>{a.stdout}</pre>}
              {a.stderr && <pre className={`${styles.logPre} ${styles.stderr}`}>{a.stderr}</pre>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function HistoryPage() {
  const { projectId } = useParams<{ projectId: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['runs', projectId],
    queryFn: () => pipelineApi.listRuns(projectId!, 50),
    enabled: !!projectId,
  });

  if (isLoading) return <p>Loading history...</p>;
  if (error) return <p>Failed to load history.</p>;

  const runs = data?.runs ?? [];

  return (
    <div>
      <h2>Run History</h2>
      {runs.length === 0 && <p>No runs yet.</p>}
      <div className={styles.runList}>
        {runs.map((run) => <RunRow key={run.id} run={run} />)}
      </div>
    </div>
  );
}
