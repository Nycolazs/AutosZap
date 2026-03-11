import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE, authCookieOptions, getBackendUrl } from '@/lib/auth-cookies';

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function forwardRequest(request: NextRequest, path: string[], token?: string) {
  const url = new URL(request.url);
  const backendUrl = `${getBackendUrl()}/api/${path.join('/')}${url.search}`;
  const body =
    request.method === 'GET' || request.method === 'HEAD'
      ? undefined
      : await request.text();

  return fetch(backendUrl, {
    method: request.method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': request.headers.get('content-type') ?? 'application/json' } : {}),
    },
    body,
  });
}

async function handler(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;

  let response = await forwardRequest(request, path, accessToken);
  let nextAccessToken = accessToken;
  let nextRefreshToken = refreshToken;

  if (response.status === 401 && refreshToken) {
    const refreshResponse = await fetch(`${getBackendUrl()}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (refreshResponse.ok) {
      const refreshPayload = (await refreshResponse.json()) as {
        accessToken: string;
        refreshToken: string;
      };
      nextAccessToken = refreshPayload.accessToken;
      nextRefreshToken = refreshPayload.refreshToken;
      response = await forwardRequest(request, path, nextAccessToken);
    } else {
      nextAccessToken = undefined;
      nextRefreshToken = undefined;
    }
  }

  const text = await response.text();
  const proxyResponse = new NextResponse(text, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'application/json',
    },
  });

  if (nextAccessToken) {
    proxyResponse.cookies.set(ACCESS_COOKIE, nextAccessToken, {
      ...authCookieOptions,
      maxAge: 60 * 15,
    });
  } else {
    proxyResponse.cookies.set(ACCESS_COOKIE, '', { ...authCookieOptions, maxAge: 0 });
  }

  if (nextRefreshToken) {
    proxyResponse.cookies.set(REFRESH_COOKIE, nextRefreshToken, {
      ...authCookieOptions,
      maxAge: 60 * 60 * 24 * 7,
    });
  } else {
    proxyResponse.cookies.set(REFRESH_COOKIE, '', { ...authCookieOptions, maxAge: 0 });
  }

  return proxyResponse;
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
