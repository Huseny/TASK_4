import { z } from 'zod';
import { passwordSchema } from './passwordPolicy';

export const loginBodySchema = z
  .object({
    username: z.string().min(3).max(64).toLowerCase(),
    password: z.string().min(1).max(256),
  })
  .strict();

export const changePasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1).max(256),
    newPassword: passwordSchema,
  })
  .strict();
