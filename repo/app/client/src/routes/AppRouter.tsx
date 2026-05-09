import { Routes, Route, Navigate } from 'react-router-dom';
import { NavShell } from '../components/NavShell';
import { RequireAuth, RequireRole, RequireAuthNoForce } from './RequireRole';
import { LoginPage } from '../features/auth/LoginPage';
import { ChangePasswordPage } from '../features/auth/ChangePasswordPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { ProjectsPage } from '../features/projects/ProjectsPage';
import { ProjectDetailPage } from '../features/projects/ProjectDetailPage';
import { HistoryPage } from '../features/history/HistoryPage';
import { ConflictsPage } from '../features/conflicts/ConflictsPage';
import { NotificationsPage } from '../features/notifications/NotificationsPage';
import { AuditPage } from '../features/admin-audit/AuditPage';
import { UsersPage } from '../features/admin-users/UsersPage';
import { MetricsPage } from '../features/admin-metrics/MetricsPage';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/change-password"
        element={
          <RequireAuthNoForce>
            <ChangePasswordPage />
          </RequireAuthNoForce>
        }
      />

      <Route
        path="/"
        element={
          <RequireAuth>
            <NavShell>
              <DashboardPage />
            </NavShell>
          </RequireAuth>
        }
      />

      <Route
        path="/projects"
        element={
          <RequireAuth>
            <NavShell>
              <ProjectsPage />
            </NavShell>
          </RequireAuth>
        }
      />

      <Route
        path="/projects/:projectId"
        element={
          <RequireAuth>
            <NavShell>
              <ProjectDetailPage />
            </NavShell>
          </RequireAuth>
        }
      />

      <Route
        path="/projects/:projectId/history"
        element={
          <RequireAuth>
            <NavShell>
              <HistoryPage />
            </NavShell>
          </RequireAuth>
        }
      />

      <Route
        path="/projects/:projectId/runs/:runId/conflicts"
        element={
          <RequireAuth>
            <NavShell>
              <ConflictsPage />
            </NavShell>
          </RequireAuth>
        }
      />

      <Route
        path="/notifications"
        element={
          <RequireAuth>
            <NavShell>
              <NotificationsPage />
            </NavShell>
          </RequireAuth>
        }
      />

      <Route
        path="/admin/users"
        element={
          <RequireRole roles={['ADMIN']}>
            <NavShell>
              <UsersPage />
            </NavShell>
          </RequireRole>
        }
      />

      <Route
        path="/admin/audit"
        element={
          <RequireRole roles={['ADMIN']}>
            <NavShell>
              <AuditPage />
            </NavShell>
          </RequireRole>
        }
      />

      <Route
        path="/admin/metrics"
        element={
          <RequireRole roles={['ADMIN']}>
            <NavShell>
              <MetricsPage />
            </NavShell>
          </RequireRole>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
