import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

const trackedBranchSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    branchName: { type: String, required: true, trim: true, maxlength: 256 },
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lastSeenCommitSha: { type: String, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'trackedBranches' },
);

trackedBranchSchema.index({ projectId: 1, branchName: 1 }, { unique: true });
trackedBranchSchema.index({ ownerUserId: 1 });

export type TrackedBranchDoc = InferSchemaType<typeof trackedBranchSchema> & { _id: import('mongoose').Types.ObjectId };
export const TrackedBranch: Model<TrackedBranchDoc> = model<TrackedBranchDoc>('TrackedBranch', trackedBranchSchema);
