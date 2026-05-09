import styles from './StatusBadge.module.css';

type RunStatus = 'QUEUED' | 'RUNNING' | 'PASSED' | 'FAILED' | 'CONFLICT' | 'CANCELLED';

interface Props {
  status: RunStatus | string;
}

const STATUS_LABELS: Record<string, string> = {
  QUEUED: 'Queued',
  RUNNING: 'Running',
  PASSED: 'Passed',
  FAILED: 'Failed',
  CONFLICT: 'Conflict',
  CANCELLED: 'Cancelled',
};

export function StatusBadge({ status }: Props) {
  return (
    <span className={`${styles.badge} ${styles[status.toLowerCase()] ?? ''}`} data-status={status}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
