import mongoose from 'mongoose';
import { Notification, NotificationType } from '../db/models/notificationModel';
import { pruneNotificationsForUser } from './prune';

export interface CreateNotificationParams {
  userId: string;
  projectId: string;
  pipelineRunId: string;
  type: 'CONFLICT' | 'FAILURE';
  title: string;
  message: string;
}

export async function createNotification(params: CreateNotificationParams): Promise<void> {
  const type = params.type === 'CONFLICT' ? NotificationType.MERGE_CONFLICT : NotificationType.TEST_FAILURE;
  await Notification.create({
    userId: new mongoose.Types.ObjectId(params.userId),
    projectId: new mongoose.Types.ObjectId(params.projectId),
    pipelineRunId: new mongoose.Types.ObjectId(params.pipelineRunId),
    type,
    title: params.title,
    message: params.message,
  });
  await pruneNotificationsForUser(params.userId);
}
