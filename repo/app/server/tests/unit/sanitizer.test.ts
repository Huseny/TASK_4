import { sanitize } from '../../src/shared/sanitizer';

describe('sanitizer', () => {
  it('removes passwordHash from objects', () => {
    const result = sanitize({ id: '1', passwordHash: 'secret', username: 'alice' });
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).toHaveProperty('id');
  });

  it('removes refreshTokenHash', () => {
    const result = sanitize({ sessionId: 'abc', refreshTokenHash: 'token', userId: 'u1' });
    expect(result).not.toHaveProperty('refreshTokenHash');
  });

  it('removes fields matching Hash$ pattern', () => {
    const result = sanitize({ data: 'ok', someHash: 'abc123' });
    expect(result).not.toHaveProperty('someHash');
  });

  it('passes through clean objects unchanged', () => {
    const input = { id: '1', name: 'test', count: 5 };
    expect(sanitize(input)).toEqual(input);
  });

  it('handles null and primitive inputs gracefully', () => {
    expect(sanitize(null as unknown as Record<string, unknown>)).toBeNull();
    expect(sanitize('string' as unknown as Record<string, unknown>)).toBe('string');
  });

  it('recursively strips nested sensitive fields', () => {
    const result = sanitize({ user: { passwordHash: 'x', name: 'bob' } });
    expect((result as Record<string, Record<string, string>>).user).not.toHaveProperty('passwordHash');
    expect((result as Record<string, Record<string, string>>).user.name).toBe('bob');
  });
});
