import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Notification } from '../db/models/notificationModel';
import { errors } from '../shared/errors';
import { toNotificationDto } from '../shared/dto';
import type { AuthenticatedRequest } from '../shared/types';

export async function listNotificationsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = (req as AuthenticatedRequest).auth!;
    const userId = new mongoose.Types.ObjectId(auth.userId);
    const unreadOnly = req.query.unread === 'true';
    const query: Record<string, unknown> = { userId };
    if (unreadOnly) query.isRead = false;
    const notifications = await Notification.find(query).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ notifications: notifications.map(toNotificationDto) });
  } catch (err) {
    next(err);
  }
}

export async function unreadCountHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = (req as AuthenticatedRequest).auth!;
    const count = await Notification.countDocuments({
      userId: new mongoose.Types.ObjectId(auth.userId),
      isRead: false,
    });
    res.json({ count });
  } catch (err) {
    next(err);
  }
}

export async function markReadHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = (req as AuthenticatedRequest).auth!;
    const notification = await Notification.findOne({
      _id: req.params.notificationId,
      userId: new mongoose.Types.ObjectId(auth.userId),
    });
    if (!notification) return next(errors.notificationNotFound());
    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();
    res.json({ notification: toNotificationDto(notification) });
  } catch (err) {
    next(err);
  }
}

export async function markAllReadHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = (req as AuthenticatedRequest).auth!;
    await Notification.updateMany(
      { userId: new mongoose.Types.ObjectId(auth.userId), isRead: false },
      { $set: { isRead: true, readAt: new Date() } },
    );
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
