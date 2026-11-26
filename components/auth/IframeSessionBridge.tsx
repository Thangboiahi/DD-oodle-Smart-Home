'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  appendIframeSessionTokenIfNeeded,
  clearClientIframeSessionStorage,
  getPortalPathForRole,
  SESSION_STORAGE_TOKEN_KEY,
  SESSION_STORAGE_USER_KEY,
  SESSION_TOKEN_HEADER,
  SESSION_TOKEN_QUERY_PARAM,
  type SessionPayload,
  type SessionRole,
} from '@/lib/auth/session';
import { dispatchRouteStart } from '@/components/navigation/RouteTransitionLoader';

const ROLE_TRANSITION_LABELS: Record<SessionRole, string> = {
  customer: 'Opening Customer Console...',
  family_member: 'Opening Family Member Console...',
  installer: 'Syncing Field Installer Dispatch...',
  admin: 'Verifying Admin Command Access...',
};

/**
 * Performs post-login navigation that works both in normal top-level browsers (HttpOnly cookies)
 * AND inside cross-origin preview iframes (where Android Chrome / Safari block 3rd-party cookies).
 */
export async function verifyCookieOrNavigateWithToken(params: {
  targetPath: string;
  demoToken?: string | null;
  sessionUser?: SessionPayload | null;
  label?: string;
}): Promise<void> {
  const { targetPath, demoToken, sessionUser, label } = params;

  dispatchRouteStart({
    href: targetPath,
    label: label || (sessionUser?.role ? ROLE_TRANSITION_LABELS[sessionUser.role] : undefined),
    immediateVeil: true,
  });

  try {
    const probeRes = await fetch('/api/auth/session', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
    });
    if (probeRes.ok) {
      const probeData = (await probeRes.json()) as {
        authenticated?: boolean;
        cookiePresent?: boolean;
      };
      if (probeData.authenticated && probeData.cookiePresent !== false) {
        clearClientIframeSessionStorage();
        window.location.assign(targetPath);
        return;
      }
    }
  } catch {
    // Fall through to token handoff if probe fails
  }

  // Cookie was blocked by cross-origin iframe: store signed token in sessionStorage and append ?__dd_tok=
  const fallbackToken =
    demoToken ||
    (typeof window !== 'undefined'
      ? window.sessionStorage.getItem(SESSION_STORAGE_TOKEN_KEY)
      : null);

  if (fallbackToken && typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(SESSION_STORAGE_TOKEN_KEY, fallbackToken);
      if (sessionUser) {
        window.sessionStorage.setItem(SESSION_STORAGE_USER_KEY, JSON.stringify(sessionUser));
      }
    } catch {
      // Ignore storage quota errors
    }
    const urlWithTok = appendIframeSessionTokenIfNeeded(targetPath, fallbackToken);
    window.location.assign(urlWithTok);
    return;
  }

  window.location.assign(targetPath);
}

/**
 * Helper for quick role switchers inside `/admin` and `/installer` headers.
 */
export async function performDemoRoleSwitch(role: SessionRole): Promise<void> {
  const targetDefault = getPortalPathForRole(role);
  dispatchRouteStart({
    href: targetDefault,
    label: ROLE_TRANSITION_LABELS[role],
    immediateVeil: true,
  });

  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ mode: 'demo', role }),
  });
  const data = (await res.json()) as {
    redirectTo?: string;
    demoToken?: string;
    user?: SessionPayload;
    session?: SessionPayload;
  };
  const targetPath = data.redirectTo || targetDefault;
  await verifyCookieOrNavigateWithToken({
    targetPath,
    demoToken: data.demoToken,
    sessionUser: data.user ?? data.session ?? null,
    label: ROLE_TRANSITION_LABELS[role],
  });
}

/**
 * Signs out of both the server HttpOnly cookie and any iframe sessionStorage token.
 */
export async function performCleanSignOut(redirectTo: string = '/auth'): Promise<void> {
  dispatchRouteStart({
    href: redirectTo,
    label: 'Signing Out & Clearing Session...',
    immediateVeil: true,
  });
  clearClientIframeSessionStorage();
  try {
    await fetch('/api/auth/session', {
      method: 'DELETE',
      credentials: 'include',
    });
  } catch {
    // Ignore network errors on sign out
  }
  window.location.assign(redirectTo);
}

/**
 * Client-side navigation interceptor active ONLY when cookie-blocked iframe mode is active
 * in `sessionStorage`. Automatically preserves `?__dd_tok=` on internal clicks between
 * `/console/*`, `/installer/*`, `/admin/*`, and `/?showcase=1`.
 */
export function IframeTokenSyncBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlTok = searchParams?.get(SESSION_TOKEN_QUERY_PARAM);
    if (urlTok) {
      try {
        window.sessionStorage.setItem(SESSION_STORAGE_TOKEN_KEY, urlTok);
      } catch {
        // Ignore storage errors
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const activeTok = window.sessionStorage.getItem(SESSION_STORAGE_TOKEN_KEY);
      if (!activeTok) return;

      const target = e.target as HTMLElement | null;
      const anchor = target?.closest('a');
      if (!anchor) return;

      const rawHref = anchor.getAttribute('href');
      if (!rawHref || !rawHref.startsWith('/') || rawHref.startsWith('//')) return;
      if (rawHref.startsWith('/auth')) return;

      const needsProtectedToken =
        rawHref === '/console' ||
        rawHref.startsWith('/console/') ||
        rawHref.startsWith('/console?') ||
        rawHref === '/installer' ||
        rawHref.startsWith('/installer/') ||
        rawHref.startsWith('/installer?') ||
        rawHref === '/admin' ||
        rawHref.startsWith('/admin/') ||
        rawHref.startsWith('/admin?');

      if (!needsProtectedToken) return;
      if (rawHref.includes(`${SESSION_TOKEN_QUERY_PARAM}=`)) return;

      e.preventDefault();
      dispatchRouteStart({ href: rawHref });
      const decorated = appendIframeSessionTokenIfNeeded(rawHref, activeTok);
      router.push(decorated);
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [router, pathname]);

  return null;
}

export { SESSION_TOKEN_HEADER };
