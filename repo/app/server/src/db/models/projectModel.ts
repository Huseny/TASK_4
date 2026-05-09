import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

const projectSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 128 },
    description: { type: String, default: '', maxlength: 2000 },
    repoPath: { type: String, required: true },
    allowedRepoRoot: { type: String, required: true },
    targetBranch: { type: String, required: true, default: 'main' },
    testCommand: { type: String, required: true, maxlength: 2048 },
    pollIntervalSeconds: { type: Number, required: true, min: 10, max: 60, default: 30 },
    autoRetryAttempts: { type: Number, required: true, min: 0, max: 3, default: 0 },
    isActive: { type: Boolean, default: true },
    maintainerUserIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    developerUserIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'projects' },
);

projectSchema.index({ isActive: 1 });
projectSchema.index({ maintainerUserIds: 1 });
projectSchema.index({ developerUserIds: 1 });

export type ProjectDoc = InferSchemaType<typeof projectSchema> & { _id: import('mongoose').Types.ObjectId };
export const Project: Model<ProjectDoc> = model<ProjectDoc>('Project', projectSchema);
