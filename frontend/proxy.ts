import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ACCESS_COOKIE } from './lib/auth-cookies';

const publicPaths = ['/login', '/register', '/forgot-password'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const isPublicRoute =
    publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
    pathname.startsWith('/reset-password/');

  const applyNoStore = (response: NextResponse) => {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return response;
  };

  if (pathname === '/') {
    return applyNoStore(
      NextResponse.redirect(new URL(accessToken ? '/app' : '/login', request.url)),
    );
  }

  if (pathname.startsWith('/app') && !accessToken) {
    return applyNoStore(NextResponse.redirect(new URL('/login', request.url)));
  }

  if (isPublicRoute && accessToken) {
    return applyNoStore(NextResponse.redirect(new URL('/app', request.url)));
  }

  return applyNoStore(NextResponse.next());
}

export const config = {
  matcher: ['/', '/login', '/register', '/forgot-password', '/reset-password/:path*', '/app/:path*'],
};
