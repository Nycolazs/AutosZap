export const ACCESS_COOKIE = 'autoszap_access_token';
export const REFRESH_COOKIE = 'autoszap_refresh_token';

export const authCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

export function getBackendUrl() {
  return process.env.BACKEND_URL ?? 'http://localhost:4000';
}
