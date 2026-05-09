import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../../lib/api';
import type { UserDto } from '../../lib/types';
import styles from './UsersPage.module.css';

const ROLES = ['ADMIN', 'MAINTAINER', 'DEVELOPER'] as const;

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<string>('DEVELOPER');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const create = useMutation({
    mutationFn: () => usersApi.create({ username, displayName, role, password }),
    onSuccess: () => {
      setUsername(''); setDisplayName(''); setPassword(''); setError(null); setOpen(false);
      onCreated();
    },
    onError: (e) => setError((e as Error).message),
  });

  if (!open) {
    return (
      <button className={styles.createOpenBtn} onClick={() => setOpen(true)}>+ Create User</button>
    );
  }

  return (
    <form className={styles.createForm} onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
      <h3>New User</h3>
      {error && <p className={styles.formError}>{error}</p>}
      <div className={styles.formRow}>
        <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required className={styles.input} />
        <input placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required className={styles.input} />
        <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className={styles.input} />
        <select value={role} onChange={(e) => setRole(e.target.value)} className={styles.select}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button type="submit" disabled={create.isPending} className={styles.saveBtn}>
          {create.isPending ? 'Creating…' : 'Create'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(null); }} className={styles.cancelFormBtn}>Cancel</button>
      </div>
    </form>
  );
}

function UserRow({ u }: { u: UserDto }) {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['users'] });

  const [editRole, setEditRole] = useState<string>(u.role);
  const [newPw, setNewPw] = useState('');
  const [showPwField, setShowPwField] = useState(false);

  const updateRole = useMutation({ mutationFn: () => usersApi.updateRole(u.id, editRole), onSuccess: invalidate });
  const resetPw = useMutation({
    mutationFn: () => usersApi.resetPassword(u.id, newPw),
    onSuccess: () => { setNewPw(''); setShowPwField(false); invalidate(); },
  });
  const deactivate = useMutation({ mutationFn: () => usersApi.deactivate(u.id), onSuccess: invalidate });
  const del = useMutation({ mutationFn: () => usersApi.delete(u.id), onSuccess: invalidate });

  return (
    <tr>
      <td>{u.username}</td>
      <td>{u.displayName}</td>
      <td>
        <select
          value={editRole}
          onChange={(e) => setEditRole(e.target.value)}
          className={styles.roleSelect}
          disabled={updateRole.isPending}
        >
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {editRole !== u.role && (
          <button onClick={() => updateRole.mutate()} disabled={updateRole.isPending} className={styles.saveBtn}>Save</button>
        )}
      </td>
      <td>{u.status}</td>
      <td className={styles.actions}>
        {!showPwField ? (
          <button onClick={() => setShowPwField(true)} className={styles.actionBtn}>Reset Pw</button>
        ) : (
          <span className={styles.pwReset}>
            <input
              type="password"
              placeholder="New password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className={styles.pwInput}
            />
            <button onClick={() => resetPw.mutate()} disabled={resetPw.isPending || !newPw} className={styles.saveBtn}>Set</button>
            <button onClick={() => { setShowPwField(false); setNewPw(''); }} className={styles.cancelFormBtn}>✕</button>
          </span>
        )}
        {u.status === 'ACTIVE' && (
          <button onClick={() => deactivate.mutate()} disabled={deactivate.isPending} className={styles.deactivateBtn}>
            Deactivate
          </button>
        )}
        <button
          onClick={() => { if (window.confirm(`Delete user "${u.username}"? This is irreversible.`)) del.mutate(); }}
          disabled={del.isPending}
          className={styles.deleteBtn}
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

export function UsersPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: usersApi.list });
  const users = data?.users ?? [];

  return (
    <div>
      <h2>User Management</h2>
      <CreateUserForm onCreated={() => void qc.invalidateQueries({ queryKey: ['users'] })} />
      {isLoading && <p>Loading...</p>}
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Username</th>
            <th>Display Name</th>
            <th>Role</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => <UserRow key={u.id} u={u} />)}
        </tbody>
      </table>
    </div>
  );
}
