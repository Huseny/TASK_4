import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

export const AuditActionType = {
  AUTH_LOGIN_SUCCESS: 'AUTH_LOGIN_SUCCESS',
  AUTH_LOGIN_FAILURE: 'AUTH_LOGIN_FAILURE',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  AUTH_REFRESH: 'AUTH_REFRESH',
  AUTH_PASSWORD_CHANGED: 'AUTH_PASSWORD_CHANGED',

  USER_CREATE: 'USER_CREATE',
  USER_ROLE_ASSIGN: 'USER_ROLE_ASSIGN',
  USER_PASSWORD_RESET: 'USER_PASSWORD_RESET',
  USER_DEACTIVATE: 'USER_DEACTIVATE',
  USER_DELETE: 'USER_DELETE',

  PROJECT_CREATE: 'PROJECT_CREATE',
  PROJECT_UPDATE: 'PROJECT_UPDATE',
  TRACKED_BRANCH_CREATE: 'TRACKED_BRANCH_CREATE',
  TRACKED_BRANCH_UPDATE: 'TRACKED_BRANCH_UPDATE',
  TRACKED_BRANCH_DELETE: 'TRACKED_BRANCH_DELETE',

  PIPELINE_TRIGGER: 'PIPELINE_TRIGGER',
  PIPELINE_CANCEL: 'PIPELINE_CANCEL',
  PIPELINE_SCHEDULER_ENQUEUE: 'PIPELINE_SCHEDULER_ENQUEUE',
  PIPELINE_CONFLICT: 'PIPELINE_CONFLICT',
  PIPELINE_TEST_FAILURE: 'PIPELINE_TEST_FAILURE',
  PIPELINE_QUEUE_FULL: 'PIPELINE_QUEUE_FULL',
  PIPELINE_WORKSPACE_CLEANUP_FAILED: 'PIPELINE_WORKSPACE_CLEANUP_FAILED',
} as const;
export type AuditActionTypeType = (typeof AuditActionType)[keyof typeof AuditActionType];

export const AuditResourceType = {
  USER: 'USER',
  SESSION: 'SESSION',
  PROJECT: 'PROJECT',
  TRACKED_BRANCH: 'TRACKED_BRANCH',
  PIPELINE_RUN: 'PIPELINE_RUN',
  NOTIFICATION: 'NOTIFICATION',
  SYSTEM: 'SYSTEM',
} as const;
export type AuditResourceTypeType = (typeof AuditResourceType)[keyof typeof AuditResourceType];

export const AuditOutcome = { SUCCESS: 'SUCCESS', FAILURE: 'FAILURE' } as const;
export type AuditOutcomeType = (typeof AuditOutcome)[keyof typeof AuditOutcome];

const auditSchema = new Schema(
  {
    timestamp: { type: Date, required: true, default: () => new Date() },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorUsername: { type: String, required: true, default: 'system' },
    actionType: { type: String, enum: Object.values(AuditActionType), required: true },
    resourceType: { type: String, enum: Object.values(AuditResourceType), required: true },
    resourceId: { type: String, default: null },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    outcome: { type: String, enum: Object.values(AuditOutcome), required: true, default: AuditOutcome.SUCCESS },
    metadata: { type: Schema.Types.Mixed, default: {} },
    requestId: { type: String, default: null },
  },
  { timestamps: false, collection: 'auditEvents' },
);

auditSchema.index({ timestamp: -1 });
auditSchema.index({ actionType: 1, timestamp: -1 });
auditSchema.index({ actorUserId: 1, timestamp: -1 });
auditSchema.index({ projectId: 1, timestamp: -1 });

export type AuditEventDoc = InferSchemaType<typeof auditSchema> & { _id: import('mongoose').Types.ObjectId };
export const AuditEvent: Model<AuditEventDoc> = model<AuditEventDoc>('AuditEvent', auditSchema);
