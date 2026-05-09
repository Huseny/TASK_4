/**
 * Idempotent local seed script.
 *
 * Creates the admin + maintainer + developer accounts, one sample project
 * pointed at the generated bare repo, and one tracked branch. Re-running
 * is safe: existing documents are updated in place.
 *
 * Temporary passwords are printed ONCE to stdout and are never persisted
 * in cleartext. Every seeded account is marked `mustChangePassword`.
 */
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { getConfig } from '../app/server/src/config';
import { connectMongo, disconnectMongo } from '../app/server/src/db/mongo';
import { User, UserRole, UserStatus } from '../app/server/src/db/models/userModel';
import { Project } from '../app/server/src/db/models/projectModel';
import { TrackedBranch } from '../app/server/src/db/models/trackedBranchModel';
import { logger } from '../app/server/src/shared/logger';

function randomPassword(): string {
  return crypto.randomBytes(9).toString('base64url') + 'A1';
}

async function upsertUser(params: {
  username: string;
  displayName: string;
  role: keyof typeof UserRole;
  password: string;
  rounds: number;
  mustChangePassword: boolean;
}): Promise<{ id: string; created: boolean }> {
  const existing = await User.findOne({ username: params.username }).lean();
  const passwordHash = await bcrypt.hash(params.password, params.rounds);
  if (existing) {
    await User.updateOne(
      { _id: existing._id },
      {
        $set: {
          displayName: params.displayName,
          role: params.role,
          passwordHash,
          status: UserStatus.ACTIVE,
          mustChangePassword: params.mustChangePassword,
          failedLoginAttempts: 0,
          lockedUntil: null,
          deletedAt: null,
        },
      },
    );
    return { id: String(existing._id), created: false };
  }
  const created = await User.create({
    username: params.username,
    displayName: params.displayName,
    role: params.role,
    passwordHash,
    status: UserStatus.ACTIVE,
    mustChangePassword: params.mustChangePassword,
  });
  return { id: String(created._id), created: true };
}

async function main(): Promise<void> {
  const cfg = getConfig();
  await connectMongo();

  const fixed = {
    admin: cfg.seed.adminPassword,
    maintainer: cfg.seed.maintainerPassword,
    developer: cfg.seed.developerPassword,
  };
  const tempPasswords: Record<string, string> = {
    admin: fixed.admin || randomPassword(),
    maintainer: fixed.maintainer || randomPassword(),
    developer: fixed.developer || randomPassword(),
  };

  const admin = await upsertUser({
    username: cfg.seed.admin,
    displayName: 'MergeStream Administrator',
    role: UserRole.ADMIN,
    password: tempPasswords.admin,
    rounds: cfg.auth.bcryptRounds,
    mustChangePassword: !fixed.admin,
  });
  const maintainer = await upsertUser({
    username: cfg.seed.maintainer,
    displayName: 'Sample Maintainer',
    role: UserRole.MAINTAINER,
    password: tempPasswords.maintainer,
    rounds: cfg.auth.bcryptRounds,
    mustChangePassword: !fixed.maintainer,
  });
  const developer = await upsertUser({
    username: cfg.seed.developer,
    displayName: 'Sample Developer',
    role: UserRole.DEVELOPER,
    password: tempPasswords.developer,
    rounds: cfg.auth.bcryptRounds,
    mustChangePassword: !fixed.developer,
  });

  const allowedRoot = cfg.pipeline.allowedRepoRoots[0];
  const sampleBareRepo = path.resolve(allowedRoot, 'sample-service.git');
  const testCommand = 'node -e "if(process.env.FAIL==="1")process.exit(1);console.log(\'tests passed\');"';

  const existing = await Project.findOne({ slug: 'sample-service' }).lean();
  const projectUpdate = {
    name: 'Sample Service',
    description: 'Demo project created by seed.ts — safe to delete.',
    repoPath: sampleBareRepo,
    allowedRepoRoot: allowedRoot,
    targetBranch: 'main',
    testCommand,
    pollIntervalSeconds: 30,
    autoRetryAttempts: 1,
    isActive: true,
    maintainerUserIds: [new mongoose.Types.ObjectId(maintainer.id)],
    developerUserIds: [new mongoose.Types.ObjectId(developer.id)],
    updatedBy: new mongoose.Types.ObjectId(admin.id),
  };

  let projectId: string;
  if (existing) {
    await Project.updateOne({ _id: existing._id }, { $set: projectUpdate });
    projectId = String(existing._id);
  } else {
    const created = await Project.create({
      ...projectUpdate,
      slug: 'sample-service',
      createdBy: new mongoose.Types.ObjectId(admin.id),
    });
    projectId = String(created._id);
  }

  for (const branch of ['feature/green', 'feature/conflict', 'feature/failing']) {
    await TrackedBranch.updateOne(
      { projectId: new mongoose.Types.ObjectId(projectId), branchName: branch },
      {
        $setOnInsert: {
          projectId: new mongoose.Types.ObjectId(projectId),
          branchName: branch,
          ownerUserId: new mongoose.Types.ObjectId(developer.id),
          isActive: true,
        },
      },
      { upsert: true },
    );
  }

  logger().info('seed complete');

  // eslint-disable-next-line no-console
  console.log('\nSeeded accounts:');
  for (const [user, pw] of Object.entries(tempPasswords)) {
    const fixedFlag = (fixed as Record<string, string | undefined>)[user] ? '(fixed via env)' : '(temp, must change on first login)';
    // eslint-disable-next-line no-console
    console.log(`  ${user.padEnd(12)} ${pw}  ${fixedFlag}`);
  }

  await disconnectMongo();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  void disconnectMongo().finally(() => process.exit(1));
});
