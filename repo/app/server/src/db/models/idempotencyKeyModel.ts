import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

const idempotencySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    key: { type: String, required: true, maxlength: 200 },
    method: { type: String, required: true },
    routeFingerprint: { type: String, required: true },
    requestFingerprint: { type: String, required: true },
    statusCode: { type: Number, required: true },
    responseBody: { type: Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'idempotencyKeys', timestamps: false },
);

idempotencySchema.index({ userId: 1, key: 1, method: 1, routeFingerprint: 1 }, { unique: true });
idempotencySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type IdempotencyKeyDoc = InferSchemaType<typeof idempotencySchema> & { _id: import('mongoose').Types.ObjectId };
export const IdempotencyKey: Model<IdempotencyKeyDoc> = model<IdempotencyKeyDoc>('IdempotencyKey', idempotencySchema);
