import { NextRequest, NextResponse } from 'next/server';
import {
  buildSessionSetCookieHeader,
  getPortalPathForRole,
  isDemoAuthAllowed,
  isRoleAllowedForPrefix,
  SESSION_COOKIE_NAME,
  SESSION_TOKEN_HEADER,
  SESSION_TOKEN_QUERY_PARAM,
  SESSION_TTL_SEC,
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

function isHttpsRequest(req: NextRequest): boolean {
  const forwardedProto = req.headers.get('x-forwarded-proto');
  if (forwardedProto === 'https') return true;
  if (forwardedProto) {
    const firstProto = forwardedProto.split(',')[0]?.trim().toLowerCase();
    if (firstProto === 'https') return true;
  }
  return req.nextUrl.protocol === 'https:';
}

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
  let session = await verifySessionToken(rawCookie);
  let verifiedFallbackToken: string | null = null;

  // If cookie was blocked by cross-origin preview iframe, check HMAC-signed ?__dd_tok= or x-dd-session header
  if (!session && isDemoAuthAllowed()) {
    const queryTok = searchParams.get(SESSION_TOKEN_QUERY_PARAM);
    const headerTok = req.headers.get(SESSION_TOKEN_HEADER);
    const candidateTok = queryTok || headerTok;
    if (candidateTok) {
      const verified = await verifySessionToken(candidateTok);
      if (verified) {
        session = verified;
        verifiedFallbackToken = candidateTok;
      }
    }
  }

  const buildNextWithSession = () => {
    if (!verifiedFallbackToken) {
      return NextResponse.next();
    }
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set(SESSION_TOKEN_HEADER, verifiedFallbackToken);
    const res = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    const isHttps = isHttpsRequest(req);
    res.headers.set(
      'Set-Cookie',
      buildSessionSetCookieHeader(verifiedFallbackToken, isHttps, SESSION_TTL_SEC)
    );
    return res;
  };

  // 2. Authenticated Customer / Family Member hitting `/` without `?showcase=1` -> immediate /console redirect
  if (pathname === '/') {
    if (
      session &&
      (session.role === 'customer' || session.role === 'family_member') &&
      searchParams.get('showcase') !== '1'
    ) {
      const targetUrl = new URL('/console', req.url);
      if (verifiedFallbackToken) {
        targetUrl.searchParams.set(SESSION_TOKEN_QUERY_PARAM, verifiedFallbackToken);
      }
      return NextResponse.redirect(targetUrl, 307);
    }
    return buildNextWithSession();
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
    return buildNextWithSession();
  }

  if (!session) {
    const authUrl = new URL('/auth', req.url);
    const cleanParams = new URLSearchParams(searchParams);
    cleanParams.delete(SESSION_TOKEN_QUERY_PARAM);
    const cleanQuery = cleanParams.toString();
    authUrl.searchParams.set('next', `${pathname}${cleanQuery ? `?${cleanQuery}` : ''}`);
    return NextResponse.redirect(authUrl, 307);
  }

  if (!isRoleAllowedForPrefix(session.role, protectedPrefix)) {
    const ownPortalUrl = new URL(getPortalPathForRole(session.role), req.url);
    if (verifiedFallbackToken) {
      ownPortalUrl.searchParams.set(SESSION_TOKEN_QUERY_PARAM, verifiedFallbackToken);
    }
    return NextResponse.redirect(ownPortalUrl, 307);
  }

  return buildNextWithSession();
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
