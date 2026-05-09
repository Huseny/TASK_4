import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { projectsApi, usersApi } from '../../lib/api';
import { useAuth } from '../../app/AuthContext';
import type { UserDto } from '../../lib/types';
import styles from './ProjectsPage.module.css';

const DEFAULTS = {
  name: '', slug: '', description: '', repoPath: '', targetBranch: 'main',
  testCommand: 'npm test', pollIntervalSeconds: 30, autoRetryAttempts: 1,
};

function CreateProjectForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState(DEFAULTS);
  const [maintainerIds, setMaintainerIds] = useState<string[]>([]);
  const [developerIds, setDeveloperIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
    enabled: open,
  });
  const allUsers: UserDto[] = usersData?.users ?? [];

  const set = (key: keyof typeof DEFAULTS, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const toggleMember = (id: string, list: string[], setList: (ids: string[]) => void) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const create = useMutation({
    mutationFn: () => projectsApi.create({
      ...form,
      pollIntervalSeconds: Number(form.pollIntervalSeconds),
      autoRetryAttempts: Number(form.autoRetryAttempts),
      isActive: true,
      maintainerUserIds: maintainerIds,
      developerUserIds: developerIds,
    }),
    onSuccess: () => {
      setForm(DEFAULTS);
      setMaintainerIds([]);
      setDeveloperIds([]);
      setError(null);
      setOpen(false);
      onCreated();
    },
    onError: (e) => setError((e as Error).message),
  });

  if (!open) {
    return <button className={styles.createBtn} onClick={() => setOpen(true)}>+ New Project</button>;
  }

  return (
    <div className={styles.createForm}>
      <h3>New Project</h3>
      {error && <p className={styles.formError}>{error}</p>}
      <div className={styles.formGrid}>
        <label>Name<input value={form.name} onChange={(e) => set('name', e.target.value)} required className={styles.input} /></label>
        <label>Slug<input value={form.slug} onChange={(e) => set('slug', e.target.value)} required className={styles.input} /></label>
        <label className={styles.fullWidth}>Repo Path<input value={form.repoPath} onChange={(e) => set('repoPath', e.target.value)} required className={styles.input} /></label>
        <label>Target Branch<input value={form.targetBranch} onChange={(e) => set('targetBranch', e.target.value)} required className={styles.input} /></label>
        <label className={styles.fullWidth}>Test Command<input value={form.testCommand} onChange={(e) => set('testCommand', e.target.value)} required className={styles.input} /></label>
        <label>Poll Interval (s)<input type="number" min={10} max={60} value={form.pollIntervalSeconds} onChange={(e) => set('pollIntervalSeconds', Number(e.target.value))} className={styles.input} /></label>
        <label>Auto Retry<input type="number" min={0} max={3} value={form.autoRetryAttempts} onChange={(e) => set('autoRetryAttempts', Number(e.target.value))} className={styles.input} /></label>
        <label className={styles.fullWidth}>Description<input value={form.description} onChange={(e) => set('description', e.target.value)} className={styles.input} /></label>
      </div>
      {allUsers.length > 0 && (
        <div className={styles.membersGrid}>
          <div className={styles.memberBox}>
            <span className={styles.memberBoxLabel}>Maintainers</span>
            <div className={styles.memberCheckList}>
              {allUsers.map((u) => (
                <label key={u.id} className={styles.memberCheckItem}>
                  <input
                    type="checkbox"
                    checked={maintainerIds.includes(u.id)}
                    onChange={() => toggleMember(u.id, maintainerIds, setMaintainerIds)}
                  />
                  {u.displayName} <span className={styles.memberSub}>({u.username})</span>
                </label>
              ))}
            </div>
          </div>
          <div className={styles.memberBox}>
            <span className={styles.memberBoxLabel}>Developers</span>
            <div className={styles.memberCheckList}>
              {allUsers.map((u) => (
                <label key={u.id} className={styles.memberCheckItem}>
                  <input
                    type="checkbox"
                    checked={developerIds.includes(u.id)}
                    onChange={() => toggleMember(u.id, developerIds, setDeveloperIds)}
                  />
                  {u.displayName} <span className={styles.memberSub}>({u.username})</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className={styles.formActions}>
        <button
          onClick={() => { create.mutate(); }}
          disabled={create.isPending || !form.name || !form.slug || !form.repoPath}
          className={styles.saveBtn}
        >
          {create.isPending ? 'Creating…' : 'Create'}
        </button>
        <button onClick={() => { setOpen(false); setError(null); }} className={styles.cancelBtn}>Cancel</button>
      </div>
    </div>
  );
}

export function ProjectsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['projects'], queryFn: projectsApi.list });
  const projects = data?.projects ?? [];

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>Projects</h2>
        {user?.role === 'ADMIN' && (
          <CreateProjectForm onCreated={() => void qc.invalidateQueries({ queryKey: ['projects'] })} />
        )}
      </div>
      {isLoading && <p>Loading projects...</p>}
      <div className={styles.list}>
        {projects.map((p) => (
          <div key={p.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <Link to={`/projects/${p.id}`} className={styles.name}>{p.name}</Link>
              <span className={`${styles.statusDot} ${p.isActive ? styles.active : styles.inactive}`} />
            </div>
            <p className={styles.desc}>{p.description || <em>No description</em>}</p>
            <div className={styles.meta}>
              <span>Branch: <code>{p.targetBranch}</code></span>
              <span>Poll: {p.pollIntervalSeconds}s</span>
            </div>
            <div className={styles.actions}>
              <Link to={`/projects/${p.id}/history`} className={styles.link}>History</Link>
              <Link to={`/projects/${p.id}`} className={styles.link}>Configure</Link>
            </div>
          </div>
        ))}
        {projects.length === 0 && !isLoading && <p>No projects found.</p>}
      </div>
    </div>
  );
}
