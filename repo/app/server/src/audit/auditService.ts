import {
  AuditEvent,
  AuditOutcome,
  type AuditActionTypeType,
  type AuditResourceTypeType,
  type AuditOutcomeType,
} from '../db/models/auditEventModel';
import { sanitize } from '../shared/sanitizer';
import { logger } from '../shared/logger';

/**
 * Central audit writer. EVERY audit event flows through this function —
 * never insert directly into the collection — so sanitization and shape
 * stay consistent.
 */
export interface WriteAuditParams {
  actionType: AuditActionTypeType;
  resourceType: AuditResourceTypeType;
  resourceId?: string | null;
  projectId?: string | null;
  actorUserId?: string | null;
  actorUsername?: string | null;
  outcome?: AuditOutcomeType;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
}

export async function writeAudit(params: WriteAuditParams): Promise<void> {
  try {
    await AuditEvent.create({
      timestamp: new Date(),
      actionType: params.actionType,
      resourceType: params.resourceType,
      resourceId: params.resourceId ?? null,
      projectId: params.projectId ?? null,
      actorUserId: params.actorUserId ?? null,
      actorUsername: params.actorUsername ?? 'system',
      outcome: params.outcome ?? AuditOutcome.SUCCESS,
      metadata: sanitize(params.metadata ?? {}),
      requestId: params.requestId ?? null,
    });
  } catch (err) {
    // Audit failures must not break request processing; log them.
    logger().error({ err, actionType: params.actionType }, 'failed to write audit event');
  }
}
