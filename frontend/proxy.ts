import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ACCESS_COOKIE } from './lib/auth-cookies';

const publicPaths = ['/login', '/register', '/forgot-password'];
const MOBILE_USER_AGENT_RE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

function isMobileRequest(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') ?? '';
  const secChUaMobile = request.headers.get('sec-ch-ua-mobile');

  return secChUaMobile === '?1' || MOBILE_USER_AGENT_RE.test(userAgent);
}

function decodeJwtPayload(token?: string) {
  if (!token) {
    return null;
  }

  const [, payload] = token.split('.');
  if (!payload) {
    return null;
  }

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    if (typeof atob !== 'function') {
      return null;
    }

    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = atob(padded);
    return JSON.parse(decoded) as {
      platformRole?: string;
    };
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const tokenPayload = decodeJwtPayload(accessToken);
  const hasPlatformAccess =
    tokenPayload?.platformRole === 'SUPER_ADMIN' ||
    tokenPayload?.platformRole === 'SUPPORT';
  const authenticatedHome =
    hasPlatformAccess ? '/platform' : '/app';
  const isPublicRoute =
    publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
    pathname.startsWith('/reset-password/');

  const applyNoStore = (response: NextResponse) => {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return response;
  };

  if (pathname.startsWith('/app') && !accessToken) {
    return applyNoStore(NextResponse.redirect(new URL('/login', request.url)));
  }

  if (pathname.startsWith('/platform') && !accessToken) {
    return applyNoStore(NextResponse.redirect(new URL('/login', request.url)));
  }

  if (pathname.startsWith('/app/menu-interativo') && isMobileRequest(request)) {
    return applyNoStore(NextResponse.redirect(new URL('/app', request.url)));
  }

  if (isPublicRoute && accessToken) {
    return applyNoStore(
      NextResponse.redirect(new URL(authenticatedHome, request.url)),
    );
  }

  return applyNoStore(NextResponse.next());
}

export const config = {
  matcher: [
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password/:path*',
    '/app/:path*',
    '/platform/:path*',
  ],
};
