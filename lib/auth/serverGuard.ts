/**
 * DD oodle Smart Home — Server Component Session & RBAC Guard
 * Enforces signed HttpOnly cookie verification inside RSC layouts before HTML/RSC streaming.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  getPortalPathForRole,
  SESSION_COOKIE_NAME,
  SessionPayload,
  SessionRole,
  verifySessionToken,
} from './session';

export async function verifyServerSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(rawToken);
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
