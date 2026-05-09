import mongoose from 'mongoose';
import { claimRunsForCapacity } from '../../src/pipeline/worker';
import { PipelineRun, RunStatus, nextQueueSequence } from '../../src/db/models/pipelineRunModel';

const PROJECT_ID = new mongoose.Types.ObjectId('000000000000000000000099');
const MAX = 4;

async function seedQueuedRuns(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    const seq = await nextQueueSequence();
    await PipelineRun.create({
      projectId: PROJECT_ID,
      sourceBranch: `feature/race-${seq}`,
      sourceCommitSha: `sha-race-${seq}`,
      targetBranch: 'main',
      triggerType: 'MONITOR',
      status: RunStatus.QUEUED,
      queuedAt: new Date(),
      queueSequence: seq,
    });
  }
}

describe('worker claim concurrency invariant', () => {
  it('parallel claim calls never push RUNNING above maxConcurrent', async () => {
    await seedQueuedRuns(20);

    // Fire many overlapping claims. Combined output must respect the cap.
    const batches = await Promise.all(
      Array.from({ length: 12 }, () => claimRunsForCapacity()),
    );
    const totalClaimed = batches.reduce((sum, b) => sum + b.length, 0);

    expect(totalClaimed).toBeLessThanOrEqual(MAX);

    const running = await PipelineRun.countDocuments({ status: RunStatus.RUNNING });
    expect(running).toBe(totalClaimed);
    expect(running).toBeLessThanOrEqual(MAX);

    // Also assert FIFO: claimed sequences should be the lowest seqs.
    const claimedSeqs = batches
      .flat()
      .map((r) => (r as unknown as { queueSequence: number }).queueSequence)
      .sort((a, b) => a - b);
    const [allSeqs] = await Promise.all([
      PipelineRun.find().sort({ queueSequence: 1 }).select('queueSequence').lean(),
    ]);
    const expectedFirstN = allSeqs.slice(0, claimedSeqs.length).map((r) => r.queueSequence);
    expect(claimedSeqs).toEqual(expectedFirstN);
  });

  it('claim does not exceed cap when other runs are already RUNNING', async () => {
    await seedQueuedRuns(MAX);
    await PipelineRun.updateMany(
      { status: RunStatus.QUEUED },
      { $set: { status: RunStatus.RUNNING, startedAt: new Date() } },
    );
    await seedQueuedRuns(6);

    const batches = await Promise.all(
      Array.from({ length: 8 }, () => claimRunsForCapacity()),
    );
    const newlyClaimed = batches.reduce((sum, b) => sum + b.length, 0);

    expect(newlyClaimed).toBe(0);
    const running = await PipelineRun.countDocuments({ status: RunStatus.RUNNING });
    expect(running).toBe(MAX);
    const queued = await PipelineRun.countDocuments({ status: RunStatus.QUEUED });
    expect(queued).toBe(6);
  });

  it('serial claims fill remaining slots without exceeding cap', async () => {
    await seedQueuedRuns(2);
    await PipelineRun.updateMany(
      { status: RunStatus.QUEUED },
      { $set: { status: RunStatus.RUNNING, startedAt: new Date() } },
    );
    await seedQueuedRuns(5);

    const claimed = await claimRunsForCapacity();
    expect(claimed.length).toBe(MAX - 2);
    const running = await PipelineRun.countDocuments({ status: RunStatus.RUNNING });
    expect(running).toBe(MAX);
  });
});
