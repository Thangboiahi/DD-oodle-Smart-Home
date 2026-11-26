/**
 * DD oodle Smart Home — Server Component Session & RBAC Guard
 * Enforces signed HttpOnly cookie verification (and middleware-verified x-dd-session token fallback
 * for cookie-blocked preview iframes) inside RSC layouts before HTML/RSC streaming.
 */

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  getPortalPathForRole,
  isDemoAuthAllowed,
  SESSION_COOKIE_NAME,
  SESSION_TOKEN_HEADER,
  SessionPayload,
  SessionRole,
  verifySessionToken,
} from './session';

export async function verifyServerSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const cookieSession = await verifySessionToken(rawToken);
  if (cookieSession) return cookieSession;

  if (isDemoAuthAllowed()) {
    const headerStore = await headers();
    const fallbackTok = headerStore.get(SESSION_TOKEN_HEADER);
    if (fallbackTok) {
      return verifySessionToken(fallbackTok);
    }
  }

  return null;
}

export async function requireServerRole(
  allowedRoles: SessionRole[],
  requestedPath: string = '/console'
): Promise<SessionPayload> {
  const session = await verifyServerSession();
  if (!session) {
    redirect(`/auth?next=${encodeURIComponent(requestedPath)}`);
  }
  if (!allowedRoles.includes(session.role)) {
    redirect(getPortalPathForRole(session.role));
  }
  return session;
}
