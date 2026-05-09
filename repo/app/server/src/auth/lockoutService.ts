import { User, UserStatus, type UserDoc } from '../db/models/userModel';
import { getConfig } from '../config';

/**
 * Account lockout mechanics.
 *
 * After `MS_LOCKOUT_THRESHOLD` (default 5) consecutive failed logins the
 * user is marked LOCKED until `lockedUntil`. A successful login always
 * resets the counter and status.
 */

export function isCurrentlyLocked(user: Pick<UserDoc, 'status' | 'lockedUntil'>): boolean {
  if (user.status !== UserStatus.LOCKED) return false;
  if (!user.lockedUntil) return true;
  return user.lockedUntil.getTime() > Date.now();
}

export function retryAfterSeconds(user: Pick<UserDoc, 'lockedUntil'>): number {
  if (!user.lockedUntil) return 0;
  const ms = user.lockedUntil.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 1000));
}

export async function registerFailedLogin(userId: unknown): Promise<void> {
  const cfg = getConfig();
  const updated = await User.findOneAndUpdate(
    { _id: userId },
    { $inc: { failedLoginAttempts: 1 } },
    { new: true, projection: { failedLoginAttempts: 1, status: 1 } },
  );
  if (!updated) return;
  if (updated.failedLoginAttempts >= cfg.auth.lockoutThreshold) {
    const lockedUntil = new Date(Date.now() + cfg.auth.lockoutWindowSeconds * 1000);
    await User.updateOne(
      { _id: userId },
      { $set: { status: UserStatus.LOCKED, lockedUntil } },
    );
  }
}

export async function registerSuccessfulLogin(userId: unknown): Promise<void> {
  await User.updateOne(
    { _id: userId },
    { $set: { failedLoginAttempts: 0, lockedUntil: null, status: UserStatus.ACTIVE } },
  );
}

export async function releaseLockIfExpired(userId: unknown): Promise<void> {
  const u = await User.findOne({ _id: userId }, { status: 1, lockedUntil: 1 }).lean();
  if (!u) return;
  if (u.status === UserStatus.LOCKED && u.lockedUntil && u.lockedUntil.getTime() <= Date.now()) {
    await User.updateOne(
      { _id: userId },
      { $set: { status: UserStatus.ACTIVE, failedLoginAttempts: 0, lockedUntil: null } },
    );
  }
}
