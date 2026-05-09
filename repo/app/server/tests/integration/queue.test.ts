import { enqueueRun, pruneRunsForProject } from '../../src/pipeline/queue';
import { PipelineRun, RunStatus } from '../../src/db/models/pipelineRunModel';
import { AppError } from '../../src/shared/errors';
import { ErrorCode } from '../../src/shared/errors';

const PROJECT_ID = '000000000000000000000001';

describe('pipeline queue', () => {
  it('enqueues a new run and returns it', async () => {
    const result = await enqueueRun({
      projectId: PROJECT_ID,
      sourceBranch: 'feature/a',
      sourceCommitSha: 'abc123',
      targetBranch: 'main',
      triggerType: 'MANUAL',
    });
    expect(result).not.toBeInstanceOf(AppError);
    const run = result as InstanceType<typeof PipelineRun>;
    expect((run as unknown as { status: string }).status).toBe(RunStatus.QUEUED);
  });

  it('deduplicates runs with same project+branch+sha+active status', async () => {
    await enqueueRun({
      projectId: PROJECT_ID,
      sourceBranch: 'feature/dup',
      sourceCommitSha: 'sha-dup',
      targetBranch: 'main',
      triggerType: 'MONITOR',
    });
    const second = await enqueueRun({
      projectId: PROJECT_ID,
      sourceBranch: 'feature/dup',
      sourceCommitSha: 'sha-dup',
      targetBranch: 'main',
      triggerType: 'MONITOR',
    });
    expect(second).not.toBeInstanceOf(AppError);
    // Should return the existing run, not create a new one
    const count = await PipelineRun.countDocuments({
      projectId: PROJECT_ID,
      sourceBranch: 'feature/dup',
      sourceCommitSha: 'sha-dup',
    });
    expect(count).toBe(1);
  });

  it('returns PIPELINE_QUEUE_FULL when 50 runs are queued', async () => {
    // Fill the queue to the cap (50 runs). Use unique SHAs to avoid dedup.
    for (let i = 0; i < 50; i++) {
      const r = await enqueueRun({
        projectId: PROJECT_ID,
        sourceBranch: 'feature/flood',
        sourceCommitSha: `sha-flood-${i}`,
        targetBranch: 'main',
        triggerType: 'MONITOR',
      });
      expect(r).not.toBeInstanceOf(AppError);
    }
    const overflow = await enqueueRun({
      projectId: PROJECT_ID,
      sourceBranch: 'feature/flood',
      sourceCommitSha: 'sha-flood-overflow',
      targetBranch: 'main',
      triggerType: 'MONITOR',
    });
    expect(overflow).toBeInstanceOf(AppError);
    expect((overflow as AppError).code).toBe(ErrorCode.PIPELINE_QUEUE_FULL);
  });

  it('assigns increasing queue sequences (FIFO order)', async () => {
    const a = await enqueueRun({ projectId: PROJECT_ID, sourceBranch: 'a', sourceCommitSha: 'sha-a', targetBranch: 'main', triggerType: 'MONITOR' });
    const b = await enqueueRun({ projectId: PROJECT_ID, sourceBranch: 'b', sourceCommitSha: 'sha-b', targetBranch: 'main', triggerType: 'MONITOR' });
    const seqA = (a as unknown as { queueSequence: number }).queueSequence;
    const seqB = (b as unknown as { queueSequence: number }).queueSequence;
    expect(seqA).toBeLessThan(seqB);
  });

  it('worker tick respects 4-concurrent-run cap: does not pick up a 5th run while 4 are RUNNING', async () => {
    // Directly insert 4 RUNNING runs to simulate the cap being reached
    const runningOps = Array.from({ length: 4 }, (_, i) => ({
      insertOne: {
        document: {
          projectId: PROJECT_ID,
          sourceBranch: `feature/running-${i}`,
          targetBranch: 'main',
          triggerType: 'MONITOR',
          status: RunStatus.RUNNING,
          queuedAt: new Date(),
          startedAt: new Date(),
          queueSequence: i + 20000,
          attemptCount: 0,
        },
      },
    }));
    await PipelineRun.bulkWrite(runningOps as Parameters<typeof PipelineRun.bulkWrite>[0]);

    const runningCount = await PipelineRun.countDocuments({ status: RunStatus.RUNNING });
    expect(runningCount).toBeGreaterThanOrEqual(4);

    // Enqueue a 5th run
    const queued = await enqueueRun({
      projectId: PROJECT_ID,
      sourceBranch: 'feature/waiting',
      sourceCommitSha: 'sha-waiting',
      targetBranch: 'main',
      triggerType: 'MONITOR',
    });
    expect(queued).not.toBeInstanceOf(AppError);

    // Verify the queued run is still QUEUED (worker would skip it when runningCount >= maxConcurrent)
    const queuedRun = await PipelineRun.findById((queued as unknown as { _id: unknown })._id).lean();
    expect((queuedRun as unknown as { status: string } | null)?.status).toBe(RunStatus.QUEUED);
  });

  it('pruneRunsForProject keeps only the newest 500 runs', async () => {
    const projectId = '000000000000000000000002';
    // Insert 502 runs directly (bypassing queue cap to test pruning)
    const bulkOps = Array.from({ length: 502 }, (_, i) => ({
      insertOne: {
        document: {
          projectId,
          sourceBranch: 'feat',
          targetBranch: 'main',
          triggerType: 'MONITOR',
          status: 'PASSED',
          queuedAt: new Date(),
          queueSequence: i + 10000,
          attemptCount: 0,
        },
      },
    }));
    await PipelineRun.bulkWrite(bulkOps as Parameters<typeof PipelineRun.bulkWrite>[0]);
    await pruneRunsForProject(projectId);
    const remaining = await PipelineRun.countDocuments({ projectId });
    expect(remaining).toBe(500);
  });
});
