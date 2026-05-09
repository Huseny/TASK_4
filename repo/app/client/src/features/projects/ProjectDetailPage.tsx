import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, usersApi } from '../../lib/api';
import { useAuth } from '../../app/AuthContext';
import type { ProjectDto, TrackedBranchDto, UserDto } from '../../lib/types';
import styles from './ProjectDetailPage.module.css';

function MemberSelect({
  label,
  selected,
  allUsers,
  onChange,
  disabled,
}: {
  label: string;
  selected: string[];
  allUsers: UserDto[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
}) {
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };
  return (
    <div className={styles.memberSelect}>
      <span className={styles.memberLabel}>{label}</span>
      <div className={styles.memberList}>
        {allUsers.map((u) => (
          <label key={u.id} className={styles.memberItem}>
            <input
              type="checkbox"
              checked={selected.includes(u.id)}
              onChange={() => toggle(u.id)}
              disabled={disabled}
            />
            {u.displayName} <span className={styles.memberUsername}>({u.username})</span>
          </label>
        ))}
        {allUsers.length === 0 && <span className={styles.memberEmpty}>No users available.</span>}
      </div>
    </div>
  );
}

function ProjectConfigForm({ project }: { project: ProjectDto }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const canEdit = isAdmin || user?.role === 'MAINTAINER';

  const [form, setForm] = useState({
    name: project.name,
    description: project.description,
    repoPath: project.repoPath,
    targetBranch: project.targetBranch,
    testCommand: project.testCommand,
    pollIntervalSeconds: project.pollIntervalSeconds,
    autoRetryAttempts: project.autoRetryAttempts,
    isActive: project.isActive,
    maintainerUserIds: project.maintainerUserIds,
    developerUserIds: project.developerUserIds,
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
    enabled: isAdmin,
  });
  const allUsers = usersData?.users ?? [];

  const update = useMutation({
    mutationFn: () => projectsApi.update(project.id, form),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      void qc.invalidateQueries({ queryKey: ['project', project.id] });
    },
    onError: (e) => setError((e as Error).message),
  });

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <section className={styles.section}>
      <h3>Configuration</h3>
      {error && <p className={styles.error}>{error}</p>}
      {saved && <p className={styles.saved}>Saved.</p>}
      <div className={styles.fieldGrid}>
        <label>Name<input value={form.name} onChange={(e) => set('name', e.target.value)} disabled={!canEdit} className={styles.input} /></label>
        <label>Slug<input value={project.slug} disabled className={styles.input} /></label>
        <label className={styles.fullWidth}>Description<input value={form.description} onChange={(e) => set('description', e.target.value)} disabled={!canEdit} className={styles.input} /></label>
        <label className={styles.fullWidth}>Repo Path<input value={form.repoPath} onChange={(e) => set('repoPath', e.target.value)} disabled={!canEdit} className={styles.input} /></label>
        <label>Target Branch<input value={form.targetBranch} onChange={(e) => set('targetBranch', e.target.value)} disabled={!canEdit} className={styles.input} /></label>
        <label className={styles.fullWidth}>Test Command<input value={form.testCommand} onChange={(e) => set('testCommand', e.target.value)} disabled={!canEdit} className={styles.input} /></label>
        <label>Poll Interval (s)<input type="number" min={10} max={60} value={form.pollIntervalSeconds} onChange={(e) => set('pollIntervalSeconds', Number(e.target.value))} disabled={!canEdit} className={styles.input} /></label>
        <label>Auto Retry Attempts<input type="number" min={0} max={3} value={form.autoRetryAttempts} onChange={(e) => set('autoRetryAttempts', Number(e.target.value))} disabled={!canEdit} className={styles.input} /></label>
        <label className={styles.checkboxLabel}>
          <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} disabled={!canEdit} />
          Active
        </label>
      </div>
      {isAdmin && (
        <div className={styles.membersGrid}>
          <MemberSelect
            label="Maintainers"
            selected={form.maintainerUserIds}
            allUsers={allUsers}
            onChange={(ids) => set('maintainerUserIds', ids)}
            disabled={update.isPending}
          />
          <MemberSelect
            label="Developers"
            selected={form.developerUserIds}
            allUsers={allUsers}
            onChange={(ids) => set('developerUserIds', ids)}
            disabled={update.isPending}
          />
        </div>
      )}
      {canEdit && (
        <button onClick={() => update.mutate()} disabled={update.isPending} className={styles.saveBtn}>
          {update.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      )}
    </section>
  );
}

function BranchesSection({ project }: { project: ProjectDto }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'MAINTAINER';

  const { data: branchData } = useQuery({
    queryKey: ['branches', project.id],
    queryFn: () => projectsApi.getBranches(project.id),
  });
  const { data: membersData } = useQuery({
    queryKey: ['members', project.id],
    queryFn: () => projectsApi.getMembers(project.id),
    enabled: canEdit,
  });

  const [newBranch, setNewBranch] = useState('');
  const [newOwner, setNewOwner] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['branches', project.id] });

  const createBranch = useMutation({
    mutationFn: () => projectsApi.createBranch(project.id, { branchName: newBranch, ownerUserId: newOwner }),
    onSuccess: () => { setNewBranch(''); setNewOwner(''); setCreateError(null); invalidate(); },
    onError: (e) => setCreateError((e as Error).message),
  });

  const deleteBranch = useMutation({
    mutationFn: (branchId: string) => projectsApi.deleteBranch(project.id, branchId),
    onSuccess: invalidate,
  });

  const toggleBranch = useMutation({
    mutationFn: ({ branchId, isActive }: { branchId: string; isActive: boolean }) =>
      projectsApi.updateBranch(project.id, branchId, { isActive }),
    onSuccess: invalidate,
  });

  const branches = branchData?.branches ?? [];
  const members = membersData?.users ?? [];

  return (
    <section className={styles.section}>
      <h3>Tracked Branches</h3>
      {canEdit && (
        <div className={styles.addBranch}>
          {createError && <p className={styles.error}>{createError}</p>}
          <input
            placeholder="Branch name"
            value={newBranch}
            onChange={(e) => setNewBranch(e.target.value)}
            className={styles.input}
          />
          <select value={newOwner} onChange={(e) => setNewOwner(e.target.value)} className={styles.select}>
            <option value="">Owner…</option>
            {members.map((u: UserDto) => <option key={u.id} value={u.id}>{u.displayName} ({u.username})</option>)}
          </select>
          <button
            onClick={() => createBranch.mutate()}
            disabled={createBranch.isPending || !newBranch || !newOwner}
            className={styles.saveBtn}
          >
            Add Branch
          </button>
        </div>
      )}
      {branches.length === 0 && <p>No tracked branches yet.</p>}
      <table className={styles.branchTable}>
        <tbody>
          {branches.map((b: TrackedBranchDto) => (
            <tr key={b.id}>
              <td><code>{b.branchName}</code></td>
              <td>{b.isActive ? <span className={styles.active}>Active</span> : <span className={styles.inactive}>Paused</span>}</td>
              <td className={styles.sha}>{b.lastSeenCommitSha?.slice(0, 8) ?? '—'}</td>
              {canEdit && (
                <td className={styles.branchActions}>
                  <button
                    onClick={() => toggleBranch.mutate({ branchId: b.id, isActive: !b.isActive })}
                    disabled={toggleBranch.isPending}
                    className={styles.actionBtn}
                  >
                    {b.isActive ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    onClick={() => { if (window.confirm(`Remove branch "${b.branchName}"?`)) deleteBranch.mutate(b.id); }}
                    disabled={deleteBranch.isPending}
                    className={styles.deleteBtn}
                  >
                    Remove
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId!),
    enabled: !!projectId,
  });

  if (isLoading) return <p>Loading project…</p>;
  if (error || !data?.project) return <p>Project not found.</p>;

  const project = data.project;

  return (
    <div>
      <div className={styles.header}>
        <h2>{project.name}</h2>
        <div className={styles.headerLinks}>
          <Link to={`/projects/${project.id}/history`} className={styles.link}>History</Link>
          <Link to="/projects" className={styles.link}>← All Projects</Link>
        </div>
      </div>
      {project.description && <p className={styles.description}>{project.description}</p>}
      <ProjectConfigForm project={project} />
      <BranchesSection project={project} />
    </div>
  );
}
