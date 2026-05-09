import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { notificationsApi } from '../lib/api';
import styles from './NavShell.module.css';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export function NavShell({ children }: Props) {
  const { user, logout } = useAuth();
  const location = useLocation();

  const { data: unreadData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 30_000,
    enabled: !!user,
  });

  const unread = unreadData?.count ?? 0;
  const isAdmin = user?.role === 'ADMIN';
  const isMaintainerOrAdmin = isAdmin || user?.role === 'MAINTAINER';

  return (
    <div className={styles.shell}>
      <nav className={styles.nav}>
        <div className={styles.brand}>MergeStream</div>
        <ul className={styles.navLinks}>
          <li><Link to="/" className={location.pathname === '/' ? styles.active : ''}>Dashboard</Link></li>
          <li><Link to="/projects" className={location.pathname.startsWith('/projects') ? styles.active : ''}>Projects</Link></li>
          <li>
            <Link to="/notifications" className={location.pathname === '/notifications' ? styles.active : ''}>
              Notifications {unread > 0 && <span className={styles.badge}>{unread}</span>}
            </Link>
          </li>
          {isAdmin && (
            <>
              <li><Link to="/admin/users" className={location.pathname === '/admin/users' ? styles.active : ''}>Users</Link></li>
              <li><Link to="/admin/audit" className={location.pathname === '/admin/audit' ? styles.active : ''}>Audit</Link></li>
              <li><Link to="/admin/metrics" className={location.pathname === '/admin/metrics' ? styles.active : ''}>Metrics</Link></li>
            </>
          )}
        </ul>
        <div className={styles.userArea}>
          <span className={styles.username}>{user?.username}</span>
          <button onClick={() => void logout()} className={styles.logoutBtn}>Logout</button>
        </div>
      </nav>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
