import mongoose from 'mongoose';
import { Notification, NotificationType } from '../../src/db/models/notificationModel';
import { createNotification } from '../../src/notifications/notificationsService';
import request from 'supertest';
import { createApp } from '../../src/app';
import { User, UserStatus } from '../../src/db/models/userModel';
import { hashPassword } from '../../src/auth/passwordService';
import { resetRateLimitBucketsForTests } from '../../src/middleware/rateLimit';

const app = createApp();
const PROJECT_ID = new mongoose.Types.ObjectId('000000000000000000000001');
const RUN_ID = new mongoose.Types.ObjectId('000000000000000000000002');

async function createAndLogin(suffix: string) {
  const password = 'ValidPass1';
  const passwordHash = await hashPassword(password);
  const user = await User.create({
    username: `notif_${suffix}`,
    displayName: 'Notif User',
    passwordHash,
    role: 'DEVELOPER',
    status: UserStatus.ACTIVE,
  });
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password });
  return {
    user,
    cookies: loginRes.headers['set-cookie'] as string[],
    csrf: (loginRes.headers['set-cookie'] as string[])
      .map((c: string) => c.match(/ms_csrf=([^;]+)/))
      .filter(Boolean)
      .map((m) => m![1])[0] ?? '',
  };
}

beforeEach(() => {
  resetRateLimitBucketsForTests();
});

describe('notifications', () => {
  it('returns only notifications for the authenticated user', async () => {
    const { user, cookies } = await createAndLogin('scopeA');
    const { user: otherUser } = await createAndLogin('scopeB');
    resetRateLimitBucketsForTests();

    await Notification.create({
      userId: user._id,
      projectId: PROJECT_ID,
      pipelineRunId: RUN_ID,
      type: NotificationType.TEST_FAILURE,
      title: 'For me',
      message: 'msg',
    });
    await Notification.create({
      userId: otherUser._id,
      projectId: PROJECT_ID,
      pipelineRunId: RUN_ID,
      type: NotificationType.TEST_FAILURE,
      title: 'Not for me',
      message: 'msg',
    });

    const res = await request(app)
      .get('/api/notifications')
      .set('Cookie', cookies.join('; '));
    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0].title).toBe('For me');
  });

  it('counts unread notifications correctly', async () => {
    const { user, cookies } = await createAndLogin('unreadcount');
    resetRateLimitBucketsForTests();

    for (let i = 0; i < 3; i++) {
      await Notification.create({
        userId: user._id,
        projectId: PROJECT_ID,
        pipelineRunId: RUN_ID,
        type: NotificationType.MERGE_CONFLICT,
        title: `Notif ${i}`,
        message: 'msg',
      });
    }

    const res = await request(app)
      .get('/api/notifications/unread-count')
      .set('Cookie', cookies.join('; '));
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
  });

  it('marks a notification as read', async () => {
    const { user, cookies, csrf } = await createAndLogin('markread');
    resetRateLimitBucketsForTests();

    const notif = await Notification.create({
      userId: user._id,
      projectId: PROJECT_ID,
      pipelineRunId: RUN_ID,
      type: NotificationType.TEST_FAILURE,
      title: 'Mark me',
      message: 'msg',
    });

    const res = await request(app)
      .post(`/api/notifications/${notif._id}/mark-read`)
      .set('Cookie', cookies.join('; '))
      .set('X-CSRF-Token', csrf)
      .set('Idempotency-Key', `notif-mark-${Date.now()}`);
    expect(res.status).toBe(200);
    expect(res.body.notification.isRead).toBe(true);
  });

  it('marks all notifications as read for the authenticated user only', async () => {
    const { user: userA, cookies: cookiesA, csrf: csrfA } = await createAndLogin('markallA');
    const { user: userB } = await createAndLogin('markallB');
    resetRateLimitBucketsForTests();

    for (let i = 0; i < 3; i++) {
      await Notification.create({
        userId: userA._id,
        projectId: PROJECT_ID,
        pipelineRunId: RUN_ID,
        type: NotificationType.TEST_FAILURE,
        title: `A ${i}`,
        message: 'msg',
      });
    }
    await Notification.create({
      userId: userB._id,
      projectId: PROJECT_ID,
      pipelineRunId: RUN_ID,
      type: NotificationType.TEST_FAILURE,
      title: 'B keep unread',
      message: 'msg',
    });

    const res = await request(app)
      .post('/api/notifications/mark-all-read')
      .set('Cookie', cookiesA.join('; '))
      .set('X-CSRF-Token', csrfA)
      .set('Idempotency-Key', `mark-all-${Date.now()}`);
    expect(res.status).toBe(204);

    const unreadA = await Notification.countDocuments({ userId: userA._id, isRead: false });
    const unreadB = await Notification.countDocuments({ userId: userB._id, isRead: false });
    expect(unreadA).toBe(0);
    expect(unreadB).toBe(1);
  });

  it('GET /api/notifications/unread-count drops to 0 after mark-all-read', async () => {
    const { user, cookies, csrf } = await createAndLogin('markallcount');
    resetRateLimitBucketsForTests();

    for (let i = 0; i < 4; i++) {
      await Notification.create({
        userId: user._id,
        projectId: PROJECT_ID,
        pipelineRunId: RUN_ID,
        type: NotificationType.MERGE_CONFLICT,
        title: `N${i}`,
        message: 'msg',
      });
    }

    const before = await request(app)
      .get('/api/notifications/unread-count')
      .set('Cookie', cookies.join('; '));
    expect(before.body.count).toBe(4);

    await request(app)
      .post('/api/notifications/mark-all-read')
      .set('Cookie', cookies.join('; '))
      .set('X-CSRF-Token', csrf)
      .set('Idempotency-Key', `mark-all-cnt-${Date.now()}`);
    resetRateLimitBucketsForTests();

    const after = await request(app)
      .get('/api/notifications/unread-count')
      .set('Cookie', cookies.join('; '));
    expect(after.body.count).toBe(0);
  });

  it('pruneNotificationsForUser keeps only 200 per user', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const notifications = Array.from({ length: 210 }, (_, i) => ({
      userId: new mongoose.Types.ObjectId(userId),
      projectId: PROJECT_ID,
      pipelineRunId: RUN_ID,
      type: NotificationType.TEST_FAILURE,
      title: `Notif ${i}`,
      message: 'msg',
      createdAt: new Date(Date.now() - i * 1000),
    }));
    await Notification.insertMany(notifications);
    await createNotification({
      userId,
      projectId: PROJECT_ID.toString(),
      pipelineRunId: RUN_ID.toString(),
      type: 'FAILURE',
      title: 'Trigger prune',
      message: 'msg',
    });
    const count = await Notification.countDocuments({ userId: new mongoose.Types.ObjectId(userId) });
    expect(count).toBe(200);
  });
});
