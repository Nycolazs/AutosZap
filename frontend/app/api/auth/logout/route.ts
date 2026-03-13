import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  authCookieOptions,
  getBackendUrl,
} from '@/lib/auth-cookies';

export async function POST() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;

  if (refreshToken) {
    try {
      await fetch(`${getBackendUrl()}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          refreshToken,
        }),
      });
    } catch {
      // O logout local deve prosseguir mesmo se o backend estiver indisponivel.
    }
  }

  cookieStore.set(ACCESS_COOKIE, '', { ...authCookieOptions, maxAge: 0 });
  cookieStore.set(REFRESH_COOKIE, '', { ...authCookieOptions, maxAge: 0 });

  return NextResponse.json({ success: true });
}
