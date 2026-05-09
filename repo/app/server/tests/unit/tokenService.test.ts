import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
  randomCsrfToken,
} from '../../src/auth/tokenService';

describe('tokenService', () => {
  it('signs and verifies an access token round-trip', () => {
    const token = signAccessToken({ sub: 'u1', sid: 's1', role: 'ADMIN' });
    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe('u1');
    expect(decoded.sid).toBe('s1');
    expect(decoded.role).toBe('ADMIN');
  });

  it('signs and verifies a refresh token round-trip', () => {
    const token = signRefreshToken({ sub: 'u1', sid: 's1', jti: 'j1' });
    const decoded = verifyRefreshToken(token);
    expect(decoded.jti).toBe('j1');
    expect(decoded.sub).toBe('u1');
  });

  it('rejects access token signed with refresh secret', () => {
    const cross = signRefreshToken({ sub: 'u1', sid: 's1', jti: 'x' });
    expect(() => verifyAccessToken(cross)).toThrow();
  });

  it('rejects tokens with a tampered payload', () => {
    const token = signAccessToken({ sub: 'u1', sid: 's1', role: 'ADMIN' });
    const tampered = token.slice(0, -2) + 'aa';
    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  it('hashRefreshToken is deterministic and 64-hex chars', () => {
    const a = hashRefreshToken('value');
    const b = hashRefreshToken('value');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('randomCsrfToken returns 64-hex chars and varies', () => {
    const a = randomCsrfToken();
    const b = randomCsrfToken();
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).not.toBe(b);
  });
});
