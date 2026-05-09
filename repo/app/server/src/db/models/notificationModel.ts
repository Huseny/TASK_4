import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

export const NotificationType = {
  MERGE_CONFLICT: 'MERGE_CONFLICT',
  TEST_FAILURE: 'TEST_FAILURE',
} as const;
export type NotificationTypeType = (typeof NotificationType)[keyof typeof NotificationType];

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    pipelineRunId: { type: Schema.Types.ObjectId, ref: 'PipelineRun', required: true },
    type: { type: String, enum: Object.values(NotificationType), required: true },
    title: { type: String, required: true, maxlength: 256 },
    message: { type: String, required: true, maxlength: 2048 },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'notifications' },
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

export type NotificationDoc = InferSchemaType<typeof notificationSchema> & { _id: import('mongoose').Types.ObjectId };
export const Notification: Model<NotificationDoc> = model<NotificationDoc>('Notification', notificationSchema);
