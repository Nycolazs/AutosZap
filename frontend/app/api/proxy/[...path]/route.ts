import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  authCookieOptions,
  getBackendUnavailableMessage,
  getBackendUrl,
} from '@/lib/auth-cookies';

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function forwardRequest(request: NextRequest, path: string[], token?: string) {
  const url = new URL(request.url);
  const backendUrl = `${getBackendUrl()}/api/${path.join('/')}${url.search}`;
  const body =
    request.method === 'GET' || request.method === 'HEAD'
      ? undefined
      : Buffer.from(await request.arrayBuffer());

  return fetch(backendUrl, {
    method: request.method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(request.headers.get('accept')
        ? { Accept: request.headers.get('accept') as string }
        : {}),
      ...(request.headers.get('range')
        ? { Range: request.headers.get('range') as string }
        : {}),
      ...(request.headers.get('if-range')
        ? { 'If-Range': request.headers.get('if-range') as string }
        : {}),
      ...(request.headers.get('last-event-id')
        ? { 'Last-Event-ID': request.headers.get('last-event-id') as string }
        : {}),
      ...(body
        ? { 'Content-Type': request.headers.get('content-type') ?? 'application/json' }
        : {}),
    },
    body,
  });
}

function buildUnavailableResponse(request: NextRequest) {
  const acceptsEventStream =
    request.headers.get('accept')?.includes('text/event-stream') ?? false;
  const message = getBackendUnavailableMessage();

  if (acceptsEventStream) {
    return new NextResponse(`event: error\ndata: ${JSON.stringify({ message })}\n\n`, {
      status: 503,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  }

  return NextResponse.json({ message }, { status: 503 });
}

async function handler(request: NextRequest, context: RouteContext) {
  try {
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

    const contentType = response.headers.get('content-type') ?? 'application/json';
    const isEventStream = contentType.includes('text/event-stream');
    const responseHeaders = new Headers({
      'Content-Type': contentType,
    });

    for (const [headerName, forwardedName] of [
      ['cache-control', 'Cache-Control'],
      ['content-disposition', 'Content-Disposition'],
      ['content-range', 'Content-Range'],
      ['accept-ranges', 'Accept-Ranges'],
      ['etag', 'ETag'],
      ['last-modified', 'Last-Modified'],
    ] as const) {
      const value = response.headers.get(headerName);

      if (value) {
        responseHeaders.set(forwardedName, value);
      }
    }

    if (isEventStream) {
      responseHeaders.set(
        'Cache-Control',
        response.headers.get('cache-control') ?? 'no-cache, no-transform',
      );
      responseHeaders.set(
        'Connection',
        response.headers.get('connection') ?? 'keep-alive',
      );
      responseHeaders.set('X-Accel-Buffering', 'no');
    }

    const proxyResponse = isEventStream
      ? new NextResponse(response.body, {
          status: response.status,
          headers: responseHeaders,
        })
      : new NextResponse(await response.arrayBuffer(), {
          status: response.status,
          headers: responseHeaders,
        });

    if (nextAccessToken) {
      proxyResponse.cookies.set(ACCESS_COOKIE, nextAccessToken, {
        ...authCookieOptions,
        maxAge: 60 * 15,
      });
    } else {
      proxyResponse.cookies.set(ACCESS_COOKIE, '', {
        ...authCookieOptions,
        maxAge: 0,
      });
    }

    if (nextRefreshToken) {
      proxyResponse.cookies.set(REFRESH_COOKIE, nextRefreshToken, {
        ...authCookieOptions,
        maxAge: 60 * 60 * 24 * 7,
      });
    } else {
      proxyResponse.cookies.set(REFRESH_COOKIE, '', {
        ...authCookieOptions,
        maxAge: 0,
      });
    }

    return proxyResponse;
  } catch {
    return buildUnavailableResponse(request);
  }
}

export const GET = handler;
export const HEAD = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
