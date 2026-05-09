/**
 * On-demand retention runner. Prunes:
 *   - pipelineRuns beyond the newest 500 per project
 *   - notifications beyond the newest 200 per user
 *   - expired idempotencyKeys (Mongo TTL normally handles this;
 *     this script force-triggers the cleanup for auditors who want
 *     synchronous evidence).
 */
import { connectMongo, disconnectMongo } from '../app/server/src/db/mongo';
import { Project } from '../app/server/src/db/models/projectModel';
import { User } from '../app/server/src/db/models/userModel';
import { pruneRunsForProject } from '../app/server/src/pipeline/retention';
import { pruneNotificationsForUser } from '../app/server/src/notifications/prune';
import { IdempotencyKey } from '../app/server/src/db/models/idempotencyKeyModel';
import { logger } from '../app/server/src/shared/logger';

async function main(): Promise<void> {
  await connectMongo();
  const projects = await Project.find({}, { _id: 1 }).lean();
  let runsPruned = 0;
  for (const p of projects) runsPruned += await pruneRunsForProject(String(p._id));

  const users = await User.find({}, { _id: 1 }).lean();
  let notificationsPruned = 0;
  for (const u of users) notificationsPruned += await pruneNotificationsForUser(String(u._id));

  const idem = await IdempotencyKey.deleteMany({ expiresAt: { $lte: new Date() } });
  logger().info({ runsPruned, notificationsPruned, idempotencyPruned: idem.deletedCount ?? 0 }, 'retention pruning complete');
  await disconnectMongo();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  void disconnectMongo().finally(() => process.exit(1));
});
