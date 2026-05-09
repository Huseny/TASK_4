import { z } from 'zod';
import { UserRole } from '../db/models/userModel';
import { passwordSchema } from '../auth/passwordPolicy';

export const createUserBodySchema = z
  .object({
    username: z.string().min(3).max(64).toLowerCase(),
    displayName: z.string().min(1).max(128).trim(),
    role: z.enum([UserRole.ADMIN, UserRole.MAINTAINER, UserRole.DEVELOPER]).default(UserRole.DEVELOPER),
    password: passwordSchema,
  })
  .strict();

export const updateRoleBodySchema = z
  .object({
    role: z.enum([UserRole.ADMIN, UserRole.MAINTAINER, UserRole.DEVELOPER]),
  })
  .strict();

export const resetPasswordBodySchema = z
  .object({
    newPassword: passwordSchema,
  })
  .strict();
