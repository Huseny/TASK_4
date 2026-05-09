import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationsPage } from '../features/notifications/NotificationsPage';
import * as api from '../lib/api';
import type { NotificationDto } from '../lib/types';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const sample: NotificationDto[] = [
  {
    id: 'n1', userId: 'u1', projectId: 'p1', pipelineRunId: 'r1', type: 'TEST_FAILURE',
    title: 'Tests failed', message: 'Branch feature/x failed', isRead: false,
    readAt: null, createdAt: new Date().toISOString(),
  },
  {
    id: 'n2', userId: 'u1', projectId: 'p1', pipelineRunId: 'r2', type: 'MERGE_CONFLICT',
    title: 'Merge conflict', message: 'feature/y conflicts', isRead: true,
    readAt: new Date().toISOString(), createdAt: new Date().toISOString(),
  },
];

describe('NotificationsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders notifications and shows the unread one with a Mark read button', async () => {
    vi.spyOn(api.notificationsApi, 'list').mockResolvedValue({ notifications: sample });

    render(wrap(<NotificationsPage />));

    await waitFor(() => expect(screen.getByText('Tests failed')).toBeInTheDocument());
    expect(screen.getByText('Merge conflict')).toBeInTheDocument();
    // Only the unread row exposes a "Mark read" button.
    const buttons = screen.getAllByRole('button', { name: /mark read/i });
    expect(buttons).toHaveLength(1);
  });

  it('clicking "Mark all read" calls notificationsApi.markAllRead', async () => {
    vi.spyOn(api.notificationsApi, 'list').mockResolvedValue({ notifications: sample });
    const markAll = vi.spyOn(api.notificationsApi, 'markAllRead').mockResolvedValue(undefined);

    render(wrap(<NotificationsPage />));

    await waitFor(() => expect(screen.getByText('Tests failed')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /mark all read/i }));

    await waitFor(() => expect(markAll).toHaveBeenCalled());
  });

  it('shows the empty state when there are no notifications', async () => {
    vi.spyOn(api.notificationsApi, 'list').mockResolvedValue({ notifications: [] });

    render(wrap(<NotificationsPage />));

    await waitFor(() => expect(screen.getByText(/no notifications\./i)).toBeInTheDocument());
  });
});
