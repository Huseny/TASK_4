import { z } from 'zod';

const gitRefSchema = z
  .string()
  .min(1)
  .max(256)
  .trim()
  .regex(
    /^[A-Za-z0-9_][A-Za-z0-9._/\-]*$/,
    'Branch name must start with a letter, digit, or underscore and may only contain letters, digits, dots, slashes, underscores, and hyphens',
  );

export const createProjectBodySchema = z
  .object({
    name: z.string().min(1).max(200).trim(),
    slug: z.string().min(1).max(128).toLowerCase().trim().regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
    description: z.string().max(2000).default(''),
    repoPath: z.string().min(1).max(4096),
    targetBranch: gitRefSchema.default('main'),
    testCommand: z.string().min(1).max(2048),
    pollIntervalSeconds: z.number().int().min(10).max(60).default(30),
    autoRetryAttempts: z.number().int().min(0).max(3).default(0),
    maintainerUserIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID')).default([]),
    developerUserIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID')).default([]),
  })
  .strict();

export const updateProjectBodySchema = z
  .object({
    name: z.string().min(1).max(200).trim().optional(),
    description: z.string().max(2000).optional(),
    repoPath: z.string().min(1).max(4096).optional(),
    targetBranch: gitRefSchema.optional(),
    testCommand: z.string().min(1).max(2048).optional(),
    pollIntervalSeconds: z.number().int().min(10).max(60).optional(),
    autoRetryAttempts: z.number().int().min(0).max(3).optional(),
    isActive: z.boolean().optional(),
    maintainerUserIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID')).optional(),
    developerUserIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID')).optional(),
  })
  .strict();

export const createTrackedBranchBodySchema = z
  .object({
    branchName: gitRefSchema,
    ownerUserId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID'),
  })
  .strict();

export const updateTrackedBranchBodySchema = z
  .object({
    isActive: z.boolean().optional(),
    ownerUserId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID').optional(),
  })
  .strict();
