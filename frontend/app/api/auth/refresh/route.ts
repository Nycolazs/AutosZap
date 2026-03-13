import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  authCookieOptions,
  getBackendUnavailableMessage,
  getBackendUrl,
  readBackendJson,
} from '@/lib/auth-cookies';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;

    if (!refreshToken) {
      return NextResponse.json(
        { message: 'Refresh token ausente.' },
        { status: 401 },
      );
    }

    const response = await fetch(`${getBackendUrl()}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refreshToken,
      }),
    });

    const payload = await readBackendJson(response);

    if (!response.ok) {
      cookieStore.set(ACCESS_COOKIE, '', { ...authCookieOptions, maxAge: 0 });
      cookieStore.set(REFRESH_COOKIE, '', { ...authCookieOptions, maxAge: 0 });
      return NextResponse.json(payload, { status: response.status });
    }

    cookieStore.set(ACCESS_COOKIE, String(payload.accessToken ?? ''), {
      ...authCookieOptions,
      maxAge: 60 * 15,
    });
    cookieStore.set(REFRESH_COOKIE, String(payload.refreshToken ?? ''), {
      ...authCookieOptions,
      maxAge: 60 * 60 * 24 * 7,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      {
        message: getBackendUnavailableMessage(),
      },
      { status: 503 },
    );
  }
}
