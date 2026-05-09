import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

export const UserRole = {
  ADMIN: 'ADMIN',
  MAINTAINER: 'MAINTAINER',
  DEVELOPER: 'DEVELOPER',
} as const;
export type UserRoleType = (typeof UserRole)[keyof typeof UserRole];

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  LOCKED: 'LOCKED',
  DEACTIVATED: 'DEACTIVATED',
  DELETED: 'DELETED',
} as const;
export type UserStatusType = (typeof UserStatus)[keyof typeof UserStatus];

const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true, minlength: 3, maxlength: 64 },
    displayName: { type: String, required: true, trim: true, maxlength: 128 },
    role: { type: String, enum: Object.values(UserRole), required: true, default: UserRole.DEVELOPER },
    passwordHash: { type: String, required: true },
    status: { type: String, enum: Object.values(UserStatus), required: true, default: UserStatus.ACTIVE },
    failedLoginAttempts: { type: Number, default: 0, min: 0 },
    lockedUntil: { type: Date, default: null },
    mustChangePassword: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'users' },
);

userSchema.index({ role: 1 });
userSchema.index({ status: 1 });

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: import('mongoose').Types.ObjectId };
export const User: Model<UserDoc> = model<UserDoc>('User', userSchema);
