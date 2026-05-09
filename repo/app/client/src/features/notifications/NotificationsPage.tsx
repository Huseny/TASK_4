import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../../lib/api';
import { formatAuditTimestamp } from '../../lib/formatters';
import styles from './NotificationsPage.module.css';

export function NotificationsPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list(),
  });

  const markRead = useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      void qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      void qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
  });

  if (isLoading) return <p>Loading notifications...</p>;
  const notifications = data?.notifications ?? [];

  return (
    <div>
      <div className={styles.header}>
        <h2>Notifications</h2>
        <button
          className={styles.markAllBtn}
          onClick={() => markAllRead.mutate()}
          disabled={markAllRead.isPending}
        >
          Mark all read
        </button>
      </div>
      {notifications.length === 0 && <p>No notifications.</p>}
      <div className={styles.list}>
        {notifications.map((n) => (
          <div key={n.id} className={`${styles.item} ${!n.isRead ? styles.unread : ''}`}>
            <div className={styles.itemHeader}>
              <span className={styles.title}>{n.title}</span>
              <span className={styles.time}>{formatAuditTimestamp(n.createdAt)}</span>
            </div>
            <p className={styles.message}>{n.message}</p>
            {!n.isRead && (
              <button
                className={styles.readBtn}
                onClick={() => markRead.mutate(n.id)}
              >
                Mark read
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
