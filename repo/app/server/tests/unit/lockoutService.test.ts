import { isCurrentlyLocked, retryAfterSeconds } from '../../src/auth/lockoutService';
import { UserStatus } from '../../src/db/models/userModel';

describe('lockoutService - pure helpers', () => {
  describe('isCurrentlyLocked', () => {
    it('returns false for ACTIVE users', () => {
      expect(isCurrentlyLocked({ status: UserStatus.ACTIVE, lockedUntil: null })).toBe(false);
    });

    it('returns true when LOCKED with no expiry', () => {
      expect(isCurrentlyLocked({ status: UserStatus.LOCKED, lockedUntil: null })).toBe(true);
    });

    it('returns true when LOCKED and lockedUntil is in the future', () => {
      const future = new Date(Date.now() + 60_000);
      expect(isCurrentlyLocked({ status: UserStatus.LOCKED, lockedUntil: future })).toBe(true);
    });

    it('returns false when LOCKED but lockedUntil has expired', () => {
      const past = new Date(Date.now() - 60_000);
      expect(isCurrentlyLocked({ status: UserStatus.LOCKED, lockedUntil: past })).toBe(false);
    });
  });

  describe('retryAfterSeconds', () => {
    it('returns 0 when lockedUntil is null', () => {
      expect(retryAfterSeconds({ lockedUntil: null })).toBe(0);
    });

    it('rounds remaining time up to seconds', () => {
      const future = new Date(Date.now() + 30_000);
      const v = retryAfterSeconds({ lockedUntil: future });
      expect(v).toBeGreaterThanOrEqual(29);
      expect(v).toBeLessThanOrEqual(31);
    });

    it('returns 0 (never negative) for past lockedUntil', () => {
      const past = new Date(Date.now() - 1000);
      expect(retryAfterSeconds({ lockedUntil: past })).toBe(0);
    });
  });
});
