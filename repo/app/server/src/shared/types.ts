import type { Request } from 'express';
import type { UserRoleType } from '../db/models/userModel';

export interface AuthContext {
  userId: string;
  username: string;
  role: UserRoleType;
  sessionId: string;
  csrfToken: string;
  mustChangePassword: boolean;
}

export interface AuthenticatedRequest extends Request {
  requestId: string;
  auth?: AuthContext;
}

export type MaybeAuthenticatedRequest = AuthenticatedRequest;
