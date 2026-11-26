import { NextRequest, NextResponse } from 'next/server';
import firebaseConfig from '../../../../firebase-applet-config.json';
import {
  buildSessionSetCookieHeader,
  getPortalPathForRole,
  isDemoAuthAllowed,
  SESSION_COOKIE_NAME,
  SESSION_TOKEN_HEADER,
  SESSION_TOKEN_QUERY_PARAM,
  SESSION_TTL_SEC,
  SessionPayload,
  SessionRole,
  signSessionToken,
  verifySessionToken,
} from '@/lib/auth/session';

const BOOTSTRAPPED_ADMIN_EMAIL = 'thangboiahi@gmail.com';
const VALID_ROLES = new Set<SessionRole>(['customer', 'family_member', 'installer', 'admin']);

interface SessionPostBody {
  idToken?: string;
  mode?: 'demo' | 'firebase';
  role?: SessionRole;
  demoRole?: SessionRole;
  uid?: string;
  name?: string;
  phone?: string;
  email?: string;
  homeId?: string;
}

interface FirebaseLookupUser {
  localId?: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  phoneNumber?: string;
  customAttributes?: string;
}

function isHttpsRequest(req: NextRequest): boolean {
  const forwardedProto = req.headers.get('x-forwarded-proto');
  if (forwardedProto === 'https') return true;
  if (forwardedProto) {
    const firstProto = forwardedProto.split(',')[0]?.trim().toLowerCase();
    if (firstProto === 'https') return true;
  }
  return req.nextUrl.protocol === 'https:';
}

function getSessionCookieOptions(req: NextRequest, maxAge: number) {
  const isHttps = isHttpsRequest(req);
  return {
    httpOnly: true,
    path: '/',
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    secure: isHttps,
    ...(isHttps ? { partitioned: true } : {}),
    maxAge,
  };
}

function mapRawRoleString(raw: unknown): SessionRole | null {
  if (typeof raw !== 'string') return null;
  const clean = raw.trim().toLowerCase();
  if (clean === 'admin') return 'admin';
  if (clean === 'installer') return 'installer';
  if (clean === 'family' || clean === 'family_member') return 'family_member';
  if (clean === 'customer' || clean === 'owner') return 'customer';
  return null;
}

async function resolveRoleFromFirestoreRest(
  uid: string,
  idToken: string
): Promise<{ role: SessionRole | null; homeId?: string; name?: string }> {
  const projectId = firebaseConfig.projectId;
  const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/${encodeURIComponent(dbId)}/documents`;

  // 1. Check /admins/{uid} (matches firestore.rules)
  try {
    const adminRes = await fetch(`${baseUrl}/admins/${encodeURIComponent(uid)}`, {
      headers: { Authorization: `Bearer ${idToken}` },
      cache: 'no-store',
    });
    if (adminRes.ok) {
      const doc = (await adminRes.json()) as {
        fields?: { role?: { stringValue?: string } };
      };
      const r = mapRawRoleString(doc.fields?.role?.stringValue);
      if (r) return { role: r };
    }
  } catch {
    // Fall through to /users/{uid}
  }

  // 2. Check /users/{uid}
  try {
    const userRes = await fetch(`${baseUrl}/users/${encodeURIComponent(uid)}`, {
      headers: { Authorization: `Bearer ${idToken}` },
      cache: 'no-store',
    });
    if (userRes.ok) {
      const doc = (await userRes.json()) as {
        fields?: {
          role?: { stringValue?: string };
          name?: { stringValue?: string };
          home_ids?: { arrayValue?: { values?: Array<{ stringValue?: string }> } };
        };
      };
      const r = mapRawRoleString(doc.fields?.role?.stringValue);
      const firstHome = doc.fields?.home_ids?.arrayValue?.values?.[0]?.stringValue;
      const name = doc.fields?.name?.stringValue;
      return { role: r, homeId: firstHome, name };
    }
  } catch {
    // Ignore network / permission errors and default cleanly
  }

  return { role: null };
}

async function verifyFirebaseIdToken(idToken: string): Promise<Omit<SessionPayload, 'iat' | 'exp'> | null> {
  if (!idToken || typeof idToken !== 'string') return null;

  const lookupRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(
      firebaseConfig.apiKey
    )}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
      cache: 'no-store',
    }
  );

  if (!lookupRes.ok) return null;
  const data = (await lookupRes.json()) as { users?: FirebaseLookupUser[] };
  const user = data.users?.[0];
  if (!user?.localId) return null;

  let claimRole: SessionRole | null = null;
  if (user.customAttributes) {
    try {
      const claims = JSON.parse(user.customAttributes) as { role?: string };
      claimRole = mapRawRoleString(claims.role);
    } catch {
      claimRole = null;
    }
  }

  const isBootstrappedAdmin =
    Boolean(user.emailVerified) &&
    user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;

  const fsProfile = await resolveRoleFromFirestoreRest(user.localId, idToken);

  const resolvedRole: SessionRole =
    isBootstrappedAdmin
      ? 'admin'
      : claimRole ?? fsProfile.role ?? 'customer';

  return {
    uid: user.localId,
    role: resolvedRole,
    name: fsProfile.name || user.displayName || user.email || user.phoneNumber || 'DD oodle User',
    email: user.email,
    phone: user.phoneNumber,
    homeId: fsProfile.homeId || 'home_imphal_001',
    mode: 'firebase',
  };
}

/**
 * Isolated non-production/demo verification fallback when demo auth is enabled
 * or Firebase Admin env vars are absent, preserving deterministic UIDs so
 * /installer job matching works cleanly.
 */
function verifyDemoAuthRequest(body: SessionPostBody): Omit<SessionPayload, 'iat' | 'exp'> | null {
  if (!isDemoAuthAllowed()) return null;
  const targetRole = mapRawRoleString(body.role ?? body.demoRole);
  if (!targetRole || !VALID_ROLES.has(targetRole)) return null;

  const demoDirectory: Record<SessionRole, Omit<SessionPayload, 'iat' | 'exp'>> = {
    customer: {
      uid: body.uid?.trim() || 'uid_customer_imphal_01',
      role: 'customer',
      name: body.name?.trim() || 'Thangboi Haokip (Owner)',
      phone: body.phone?.trim() || '+919862011114',
      email: body.email?.trim() || 'owner@ddoodle.in',
      homeId: body.homeId?.trim() || 'home_imphal_001',
      mode: 'demo',
    },
    family_member: {
      uid: body.uid?.trim() || 'uid_family_imphal_02',
      role: 'family_member',
      name: body.name?.trim() || 'Priya Sharma (Family)',
      phone: body.phone?.trim() || '+919862022282',
      email: body.email?.trim() || 'family@ddoodle.in',
      homeId: body.homeId?.trim() || 'home_imphal_001',
      mode: 'demo',
    },
    installer: {
      uid: body.uid?.trim() || 'uid_installer_manipur_01',
      role: 'installer',
      name: body.name?.trim() || 'Bikramjit Singh (Field Tech)',
      phone: body.phone?.trim() || '+919862055501',
      email: body.email?.trim() || 'installer@ddoodle.in',
      homeId: body.homeId?.trim() || 'home_imphal_001',
      mode: 'demo',
    },
    admin: {
      uid: body.uid?.trim() || 'uid_admin_ddoodle_01',
      role: 'admin',
      name: body.name?.trim() || 'DD oodle Command Admin',
      phone: body.phone?.trim() || '+919862099900',
      email: body.email?.trim() || BOOTSTRAPPED_ADMIN_EMAIL,
      homeId: body.homeId?.trim() || 'home_imphal_001',
      mode: 'demo',
    },
  };

  return demoDirectory[targetRole];
}

export async function GET(req: NextRequest) {
  const cookieToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  let session = await verifySessionToken(cookieToken);

  if (!session && isDemoAuthAllowed()) {
    const fallbackTok =
      req.headers.get(SESSION_TOKEN_HEADER) ||
      req.nextUrl.searchParams.get(SESSION_TOKEN_QUERY_PARAM);
    if (fallbackTok) {
      session = await verifySessionToken(fallbackTok);
    }
  }

  return NextResponse.json({
    authenticated: Boolean(session),
    cookiePresent: Boolean(cookieToken && session),
    user: session,
    session,
    demoEnabled: isDemoAuthAllowed(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SessionPostBody;

    let sessionInput: Omit<SessionPayload, 'iat' | 'exp'> | null = null;
    if (body.idToken && body.mode !== 'demo') {
      sessionInput = await verifyFirebaseIdToken(body.idToken);
      if (!sessionInput) {
        return NextResponse.json(
          { error: 'Invalid or expired Firebase ID token.' },
          { status: 401 }
        );
      }
    } else if (body.mode === 'demo' || body.role || body.demoRole) {
      sessionInput = verifyDemoAuthRequest(body);
      if (!sessionInput) {
        return NextResponse.json(
          { error: 'Demo authentication is disabled or invalid role supplied.' },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Missing idToken or demo role payload.' },
        { status: 400 }
      );
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const token = await signSessionToken(sessionInput, nowSec);
    const fullSession: SessionPayload = {
      ...sessionInput,
      iat: nowSec,
      exp: nowSec + SESSION_TTL_SEC,
    };
    const redirectTo = getPortalPathForRole(fullSession.role);
    const demoAllowed = isDemoAuthAllowed();
    const response = NextResponse.json({
      ok: true,
      user: fullSession,
      session: fullSession,
      redirectTo,
      ...(demoAllowed ? { demoToken: token } : {}),
    });

    const isHttps = isHttpsRequest(req);
    response.cookies.set(
      SESSION_COOKIE_NAME,
      token,
      getSessionCookieOptions(req, SESSION_TTL_SEC)
    );
    response.headers.set(
      'Set-Cookie',
      buildSessionSetCookieHeader(token, isHttps, SESSION_TTL_SEC)
    );

    return response;
  } catch {
    return NextResponse.json(
      { error: 'Failed to create session cookie.' },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const response = NextResponse.json({ ok: true });
  const isHttps = isHttpsRequest(req);
  response.cookies.set(
    SESSION_COOKIE_NAME,
    '',
    getSessionCookieOptions(req, 0)
  );
  response.headers.set(
    'Set-Cookie',
    buildSessionSetCookieHeader('', isHttps, 0)
  );
  return response;
}
