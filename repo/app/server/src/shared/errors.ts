/**
 * MergeStream error codes.
 *
 * Every error returned by the API uses a canonical code from this list so
 * the frontend can branch on it and the requirements matrix can reference
 * one symbol. Adding a code requires adding it here AND to
 * `docs/api-contract.md` §1.
 */
export const ErrorCode = {
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
  AUTH_ACCOUNT_DEACTIVATED: 'AUTH_ACCOUNT_DEACTIVATED',
  AUTH_SESSION_INVALID: 'AUTH_SESSION_INVALID',
  AUTH_MUST_CHANGE_PASSWORD: 'AUTH_MUST_CHANGE_PASSWORD',
  AUTH_REFRESH_INVALID: 'AUTH_REFRESH_INVALID',

  CSRF_TOKEN_INVALID: 'CSRF_TOKEN_INVALID',
  RATE_LIMITED: 'RATE_LIMITED',

  VALIDATION_FAILED: 'VALIDATION_FAILED',

  IDEMPOTENCY_KEY_MISSING: 'IDEMPOTENCY_KEY_MISSING',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',

  RBAC_FORBIDDEN: 'RBAC_FORBIDDEN',
  PROJECT_ACCESS_DENIED: 'PROJECT_ACCESS_DENIED',
  PROJECT_REPO_PATH_FORBIDDEN: 'PROJECT_REPO_PATH_FORBIDDEN',
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',

  PIPELINE_QUEUE_FULL: 'PIPELINE_QUEUE_FULL',
  PIPELINE_RUN_NOT_FOUND: 'PIPELINE_RUN_NOT_FOUND',
  PIPELINE_RUN_STATE_INVALID: 'PIPELINE_RUN_STATE_INVALID',

  NOTIFICATION_NOT_FOUND: 'NOTIFICATION_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_CONFLICT: 'USER_CONFLICT',
  BRANCH_NOT_FOUND: 'BRANCH_NOT_FOUND',

  CONFLICT: 'CONFLICT',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  public readonly code: ErrorCodeType;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(code: ErrorCodeType, message: string, status: number, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }
}

export const errors = {
  invalidCredentials: () =>
    new AppError(ErrorCode.AUTH_INVALID_CREDENTIALS, 'Invalid username or password.', 401),
  accountLocked: (retryAfterSeconds: number) =>
    new AppError(ErrorCode.AUTH_ACCOUNT_LOCKED, 'Account is temporarily locked after repeated failed logins.', 423, { retryAfterSeconds }),
  accountDeactivated: () =>
    new AppError(ErrorCode.AUTH_ACCOUNT_DEACTIVATED, 'This account has been deactivated.', 403),
  sessionInvalid: () =>
    new AppError(ErrorCode.AUTH_SESSION_INVALID, 'Session is missing, expired, or revoked.', 401),
  refreshInvalid: () =>
    new AppError(ErrorCode.AUTH_REFRESH_INVALID, 'Refresh token is invalid or already used.', 401),
  mustChangePassword: () =>
    new AppError(ErrorCode.AUTH_MUST_CHANGE_PASSWORD, 'Password change is required before continuing.', 403),
  csrfInvalid: () => new AppError(ErrorCode.CSRF_TOKEN_INVALID, 'CSRF token is missing or invalid.', 403),
  rateLimited: (retryAfterSeconds: number) =>
    new AppError(ErrorCode.RATE_LIMITED, 'Too many requests.', 429, { retryAfterSeconds }),
  validation: (details: unknown) =>
    new AppError(ErrorCode.VALIDATION_FAILED, 'Request failed validation.', 400, details),
  idempotencyKeyMissing: () =>
    new AppError(ErrorCode.IDEMPOTENCY_KEY_MISSING, 'Idempotency-Key header is required.', 400),
  idempotencyConflict: () =>
    new AppError(ErrorCode.IDEMPOTENCY_CONFLICT, 'Idempotency-Key was reused with a different request payload.', 409),
  forbidden: (code: ErrorCodeType = ErrorCode.RBAC_FORBIDDEN) =>
    new AppError(code, 'You do not have permission to perform this action.', 403),
  projectAccessDenied: () =>
    new AppError(ErrorCode.PROJECT_ACCESS_DENIED, 'You do not have access to this project.', 403),
  projectRepoPathForbidden: () =>
    new AppError(ErrorCode.PROJECT_REPO_PATH_FORBIDDEN, 'repoPath must resolve under an allow-listed root.', 400),
  projectNotFound: () => new AppError(ErrorCode.PROJECT_NOT_FOUND, 'Project not found.', 404),
  pipelineQueueFull: () =>
    new AppError(ErrorCode.PIPELINE_QUEUE_FULL, 'The pipeline queue is full. Try again later.', 503),
  runNotFound: () => new AppError(ErrorCode.PIPELINE_RUN_NOT_FOUND, 'Pipeline run not found.', 404),
  runStateInvalid: (reason: string) =>
    new AppError(ErrorCode.PIPELINE_RUN_STATE_INVALID, reason, 409),
  notificationNotFound: () =>
    new AppError(ErrorCode.NOTIFICATION_NOT_FOUND, 'Notification not found.', 404),
  userNotFound: () => new AppError(ErrorCode.USER_NOT_FOUND, 'User not found.', 404),
  userConflict: (message: string) => new AppError(ErrorCode.USER_CONFLICT, message, 409),
  branchNotFound: () => new AppError(ErrorCode.BRANCH_NOT_FOUND, 'Tracked branch not found.', 404),
  internal: (message = 'Unexpected server error.') =>
    new AppError(ErrorCode.INTERNAL_ERROR, message, 500),
  serviceUnavailable: (message: string) =>
    new AppError(ErrorCode.SERVICE_UNAVAILABLE, message, 503),
  conflict: (message: string) => new AppError(ErrorCode.CONFLICT, message, 409),
  notFound: (message: string) => new AppError(ErrorCode.NOT_FOUND, message, 404),
};
