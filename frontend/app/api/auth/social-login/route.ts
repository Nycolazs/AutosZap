import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  authCookieOptions,
  getBackendUnavailableMessage,
  getBackendUrl,
  readBackendJson,
} from '@/lib/auth-cookies';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const response = await fetch(`${getBackendUrl()}/api/auth/social-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const payload = await readBackendJson(response);

    if (!response.ok) {
      return NextResponse.json(payload, { status: response.status });
    }

    const cookieStore = await cookies();
    cookieStore.set(ACCESS_COOKIE, String(payload.accessToken ?? ''), {
      ...authCookieOptions,
      maxAge: 60 * 15,
    });
    cookieStore.set(REFRESH_COOKIE, String(payload.refreshToken ?? ''), {
      ...authCookieOptions,
      maxAge: 60 * 60 * 24 * 7,
    });

    return NextResponse.json({
      user: payload.user,
      workspace: payload.workspace,
    });
  } catch {
    return NextResponse.json(
      {
        message: getBackendUnavailableMessage(),
      },
      { status: 503 },
    );
  }
}
