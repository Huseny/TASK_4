import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { pipelineApi } from '../../lib/api';
import styles from './ConflictsPage.module.css';

export function ConflictsPage() {
  const { projectId, runId } = useParams<{ projectId: string; runId: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['run', projectId, runId],
    queryFn: () => pipelineApi.getRun(projectId!, runId!),
    enabled: !!projectId && !!runId,
  });

  if (isLoading) return <p>Loading conflicts...</p>;
  if (error) return <p>Failed to load run details.</p>;

  const run = data?.run;
  const conflicts = run?.conflicts ?? [];

  return (
    <div>
      <h2>Merge Conflicts</h2>
      <p className={styles.meta}>
        Branch: <span className={styles.branch}>{run?.sourceBranch}</span>
        {' → '}
        <span className={styles.branch}>{run?.targetBranch}</span>
      </p>
      {conflicts.length === 0 && <p>No conflicts recorded.</p>}
      {conflicts.map((c) => (
        <div key={c.filePath} className={styles.conflictFile}>
          <div className={styles.fileHeader}>
            <span className={styles.filePath}>{c.filePath}</span>
            <span className={styles.lineRanges}>
              {c.lineNumbers.map((r, i) => (
                <span key={i} className={styles.lineRange}>L{r.start}–{r.end}</span>
              ))}
            </span>
          </div>
          <pre className={styles.diff}>{c.rawDiff}</pre>
        </div>
      ))}
    </div>
  );
}
