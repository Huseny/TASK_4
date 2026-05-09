import type { Response, CookieOptions } from 'express';
import { getConfig } from '../config';

export const ACCESS_COOKIE = 'ms_access';
export const REFRESH_COOKIE = 'ms_refresh';
export const CSRF_COOKIE = 'ms_csrf';

function baseCookieOptions(): CookieOptions {
  const cfg = getConfig();
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: cfg.env === 'production',
  };
}

export function setAuthCookies(
  res: Response,
  params: { accessToken: string; refreshToken: string; csrfToken: string },
): void {
  const cfg = getConfig();
  const base = baseCookieOptions();
  res.cookie(ACCESS_COOKIE, params.accessToken, {
    ...base,
    maxAge: cfg.auth.accessTtlSeconds * 1000,
    path: '/',
  });
  res.cookie(REFRESH_COOKIE, params.refreshToken, {
    ...base,
    maxAge: cfg.auth.refreshTtlSeconds * 1000,
    path: '/api/auth',
  });
  res.cookie(CSRF_COOKIE, params.csrfToken, {
    httpOnly: false, // readable by JS so the SPA can echo as X-CSRF-Token
    sameSite: 'strict',
    secure: cfg.env === 'production',
    maxAge: cfg.auth.sessionTtlSeconds * 1000,
    path: '/',
  });
}

export function clearAuthCookies(res: Response): void {
  const cfg = getConfig();
  const base: CookieOptions = {
    httpOnly: true,
    sameSite: 'strict',
    secure: cfg.env === 'production',
  };
  res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base, path: '/api/auth' });
  res.clearCookie(CSRF_COOKIE, { ...base, httpOnly: false, path: '/' });
}
