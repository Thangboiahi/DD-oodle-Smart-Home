import { NextRequest, NextResponse } from 'next/server';
import {
  getPortalPathForRole,
  isRoleAllowedForPrefix,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from '@/lib/auth/session';

const LEGACY_CONSOLE_PREFIXES = [
  '/devices',
  '/vehicles',
  '/automations',
  '/billing',
  '/settings',
  '/setup',
];

export async function middleware(req: NextRequest) {
  const { pathname, search, searchParams } = req.nextUrl;

  // 1. Server 307 redirects for legacy customer routes -> /console/*
  for (const prefix of LEGACY_CONSOLE_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      const targetUrl = new URL(`/console${pathname}${search}`, req.url);
      return NextResponse.redirect(targetUrl, 307);
    }
  }

  const rawCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(rawCookie);

  // 2. Authenticated Customer / Family Member hitting `/` without `?showcase=1` -> immediate /console redirect
  if (pathname === '/') {
    if (
      session &&
      (session.role === 'customer' || session.role === 'family_member') &&
      searchParams.get('showcase') !== '1'
    ) {
      return NextResponse.redirect(new URL('/console', req.url), 307);
    }
    return NextResponse.next();
  }

  // 3. Role-gated portals
  const protectedPrefix =
    pathname === '/admin' || pathname.startsWith('/admin/')
      ? '/admin'
      : pathname === '/installer' || pathname.startsWith('/installer/')
      ? '/installer'
      : pathname === '/console' || pathname.startsWith('/console/')
      ? '/console'
      : null;

  if (!protectedPrefix) {
    return NextResponse.next();
  }

  if (!session) {
    const authUrl = new URL('/auth', req.url);
    authUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(authUrl, 307);
  }

  if (!isRoleAllowedForPrefix(session.role, protectedPrefix)) {
    const ownPortal = getPortalPathForRole(session.role);
    return NextResponse.redirect(new URL(ownPortal, req.url), 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/console/:path*',
    '/installer/:path*',
    '/admin/:path*',
    '/devices/:path*',
    '/vehicles/:path*',
    '/automations/:path*',
    '/billing/:path*',
    '/settings/:path*',
    '/setup/:path*',
  ],
};
