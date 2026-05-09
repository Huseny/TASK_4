import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

const sessionSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    refreshTokenHash: { type: String, required: true },
    csrfToken: { type: String, required: true },
    issuedAt: { type: Date, required: true, default: () => new Date() },
    lastSeenAt: { type: Date, required: true, default: () => new Date() },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: true, collection: 'sessions', _id: false },
);

sessionSchema.index({ expiresAt: 1 });
sessionSchema.index({ revokedAt: 1 });

export type SessionDoc = InferSchemaType<typeof sessionSchema> & { _id: string };
export const Session: Model<SessionDoc> = model<SessionDoc>('Session', sessionSchema);
