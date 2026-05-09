import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { validate } from '../../src/middleware/validate';
import { AppError, ErrorCode } from '../../src/shared/errors';

function runValidate(
  middleware: ReturnType<typeof validate>,
  req: Partial<Request>,
): Promise<{ called: boolean; err: unknown; req: Partial<Request> }> {
  return new Promise((resolve) => {
    const next: NextFunction = ((err?: unknown) => {
      resolve({ called: !err, err, req });
    }) as unknown as NextFunction;
    middleware(req as Request, {} as Response, next);
  });
}

describe('validate middleware', () => {
  it('passes through when body, params, and query all parse', async () => {
    const mw = validate({
      body: z.object({ name: z.string() }).strict(),
      params: z.object({ id: z.string() }),
      query: z.object({ q: z.string() }),
    });
    const result = await runValidate(mw, {
      body: { name: 'x' },
      params: { id: '1' },
      query: { q: 'hi' },
    });
    expect(result.called).toBe(true);
    expect(result.err).toBeUndefined();
  });

  it('rejects with VALIDATION_FAILED on a body shape mismatch', async () => {
    const mw = validate({ body: z.object({ name: z.string() }).strict() });
    const result = await runValidate(mw, { body: { wrong: 1 } });
    expect(result.called).toBe(false);
    expect(result.err).toBeInstanceOf(AppError);
    expect((result.err as AppError).code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('rejects extra fields when schema is strict', async () => {
    const mw = validate({ body: z.object({ name: z.string() }).strict() });
    const result = await runValidate(mw, { body: { name: 'ok', extra: 'no' } });
    expect(result.called).toBe(false);
    expect(result.err).toBeInstanceOf(AppError);
  });

  it('reports issues separately for each segment', async () => {
    const mw = validate({
      body: z.object({ name: z.string() }).strict(),
      params: z.object({ id: z.string() }),
    });
    const result = await runValidate(mw, { body: { name: 1 }, params: { id: 5 } });
    expect((result.err as AppError).code).toBe(ErrorCode.VALIDATION_FAILED);
    const details = (result.err as AppError).details as Record<string, unknown>;
    expect(details.body).toBeDefined();
    expect(details.params).toBeDefined();
  });

  it('replaces req.body with the parsed value (e.g. defaults applied)', async () => {
    const mw = validate({
      body: z.object({ name: z.string(), retry: z.number().default(1) }).strict(),
    });
    const result = await runValidate(mw, { body: { name: 'x' } });
    expect(result.called).toBe(true);
    expect((result.req.body as { retry: number }).retry).toBe(1);
  });
});
