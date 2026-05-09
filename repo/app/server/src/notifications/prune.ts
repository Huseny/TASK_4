import mongoose from 'mongoose';
import { Notification } from '../db/models/notificationModel';
import { getConfig } from '../config';

export async function pruneNotificationsForUser(userId: string): Promise<number> {
  const cfg = getConfig();
  const retention = cfg.notifications.retentionPerUser;
  const toDelete = await Notification.find({ userId: new mongoose.Types.ObjectId(userId) })
    .sort({ createdAt: -1 })
    .skip(retention)
    .select('_id')
    .lean();
  if (toDelete.length === 0) return 0;
  const result = await Notification.deleteMany({ _id: { $in: toDelete.map((n) => n._id) } });
  return result.deletedCount ?? 0;
}
