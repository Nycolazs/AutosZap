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

  if (pathname === '/') {
    return NextResponse.redirect(new URL(accessToken ? '/app/inbox' : '/login', request.url));
  }

  if (pathname.startsWith('/app') && !accessToken) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isPublicRoute && accessToken) {
    return NextResponse.redirect(new URL('/app/inbox', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login', '/register', '/forgot-password', '/reset-password/:path*', '/app/:path*'],
};
