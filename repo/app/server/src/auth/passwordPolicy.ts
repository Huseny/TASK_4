import { z } from 'zod';

/**
 * Password policy: minimum 10 characters, at least one digit, at least one
 * letter. Enforced on all user-facing password set/reset/change flows.
 * Admin-generated temporary passwords follow the same rule.
 */
export const passwordSchema = z
  .string()
  .min(10, { message: 'Password must be at least 10 characters.' })
  .max(256)
  .refine((s) => /[A-Za-z]/.test(s) && /\d/.test(s), {
    message: 'Password must include at least one letter and one digit.',
  });

export function validatePassword(candidate: string): string[] {
  const r = passwordSchema.safeParse(candidate);
  if (r.success) return [];
  return r.error.issues.map((i) => i.message);
}
