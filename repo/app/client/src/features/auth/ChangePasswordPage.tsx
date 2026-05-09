import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../../lib/api';
import { useAuth } from '../../app/AuthContext';
import styles from './ChangePasswordPage.module.css';

export function ChangePasswordPage() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authApi.changePassword(current, next);
      await refreshUser();
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h2>Password Change Required</h2>
        <p className={styles.subtitle}>Hello {user?.displayName ?? user?.username}. You must set a new password before continuing.</p>
        <form onSubmit={handleSubmit}>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.field}>
            <label htmlFor="current-password">Current Password</label>
            <input
              id="current-password"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              autoComplete="current-password"
              className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="new-password">New Password</label>
            <input
              id="new-password"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              autoComplete="new-password"
              className={styles.input}
            />
          </div>
          <div className={styles.buttons}>
            <button type="submit" disabled={loading} className={styles.submitBtn}>
              {loading ? 'Saving…' : 'Change Password'}
            </button>
            <button type="button" onClick={() => void logout()} className={styles.logoutBtn}>
              Logout instead
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
