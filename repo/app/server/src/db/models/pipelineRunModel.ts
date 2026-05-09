import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

export const RunStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  CONFLICT: 'CONFLICT',
  CANCELLED: 'CANCELLED',
} as const;
export type RunStatusType = (typeof RunStatus)[keyof typeof RunStatus];

export const TriggerType = { MANUAL: 'MANUAL', MONITOR: 'MONITOR' } as const;
export type TriggerTypeType = (typeof TriggerType)[keyof typeof TriggerType];

const attemptSchema = new Schema(
  {
    attemptIndex: { type: Number, required: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, required: true },
    exitCode: { type: Number, required: true },
    stdout: { type: String, default: '' },
    stderr: { type: String, default: '' },
    logsTruncated: { type: Boolean, default: false },
    timedOut: { type: Boolean, default: false },
  },
  { _id: false },
);

const lineRangeSchema = new Schema(
  { start: { type: Number, required: true }, end: { type: Number, required: true } },
  { _id: false },
);

const conflictSchema = new Schema(
  {
    filePath: { type: String, required: true },
    lineNumbers: { type: [lineRangeSchema], default: [] },
    rawDiff: { type: String, default: '' },
  },
  { _id: false },
);

const runSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    sourceBranch: { type: String, required: true },
    sourceCommitSha: { type: String, default: null },
    targetBranch: { type: String, required: true },
    triggerType: { type: String, enum: Object.values(TriggerType), required: true },
    triggeredByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: Object.values(RunStatus), required: true, default: RunStatus.QUEUED },
    queuedAt: { type: Date, required: true, default: () => new Date() },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    queueSequence: { type: Number, required: true, unique: true },
    attemptCount: { type: Number, default: 0 },
    attempts: { type: [attemptSchema], default: [] },
    mergeCommitSha: { type: String, default: null },
    conflicts: { type: [conflictSchema], default: [] },
    logsTruncated: { type: Boolean, default: false },
    cancelRequested: { type: Boolean, default: false },
    workspacePath: { type: String, default: null },
    errorMessage: { type: String, default: null },
  },
  { timestamps: true, collection: 'pipelineRuns' },
);

runSchema.index({ projectId: 1, queuedAt: -1 });
runSchema.index({ projectId: 1, createdAt: -1 });
runSchema.index({ status: 1, queueSequence: 1 });
runSchema.index({ sourceBranch: 1 });
runSchema.index({ projectId: 1, sourceBranch: 1, sourceCommitSha: 1, status: 1 });

export type PipelineRunDoc = InferSchemaType<typeof runSchema> & { _id: import('mongoose').Types.ObjectId };
export const PipelineRun: Model<PipelineRunDoc> = model<PipelineRunDoc>('PipelineRun', runSchema);

// Monotonic queue sequence counter. Kept in its own tiny collection so
// we can `findOneAndUpdate` with `$inc` atomically across all runs.
const pipelineSequenceSchema = new Schema(
  { _id: { type: String, required: true }, value: { type: Number, required: true, default: 0 } },
  { collection: 'pipelineSequences', _id: false },
);
export const PipelineSequence = model('PipelineSequence', pipelineSequenceSchema);

export async function nextQueueSequence(): Promise<number> {
  const doc = await PipelineSequence.findOneAndUpdate(
    { _id: 'run' },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: 'after', new: true },
  );
  return (doc as unknown as { value: number }).value;
}
