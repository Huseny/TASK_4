/**
 * Central sanitizer for response DTOs, audit metadata, and log payloads.
 *
 * Strips every field whose name matches a secret pattern. Runs recursively
 * on plain objects and arrays; leaves primitives alone. Used by:
 *   - every DTO mapper in `shared/dto.ts`
 *   - the audit writer in `audit/auditService.ts`
 *   - the pino logger's `redact` paths (for field-name parity)
 *
 * Adding a new secret field requires adding it here AND to
 * `shared/logger.ts` redact paths.
 */
const SECRET_FIELD_PATTERNS: RegExp[] = [
  /^password$/i,
  /^passwordHash$/i,
  /^refreshToken$/i,
  /^refreshTokenHash$/i,
  /^accessToken$/i,
  /^csrfToken$/i,
  /^token$/i,
  /^secret/i,
  /^apiKey$/i,
  /Hash$/,
];

export function isSecretKey(key: string): boolean {
  return SECRET_FIELD_PATTERNS.some((r) => r.test(key));
}

export function sanitize<T>(input: T): T {
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) {
    return (input as unknown[]).map((v) => sanitize(v)) as unknown as T;
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (isSecretKey(k)) continue;
      out[k] = sanitize(v);
    }
    return out as unknown as T;
  }
  return input;
}
