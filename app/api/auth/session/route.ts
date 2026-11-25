import { NextRequest, NextResponse } from 'next/server';
import firebaseConfig from '../../../../firebase-applet-config.json';
import {
  getPortalPathForRole,
  isDemoAuthAllowed,
  SESSION_COOKIE_NAME,
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
  demoRole?: SessionRole;
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
 * Isolated non-production/demo verification fallback when Firebase Admin env vars
 * are absent, preserving deterministic UIDs so /installer job matching works cleanly.
 */
function verifyDemoAuthRequest(body: SessionPostBody): Omit<SessionPayload, 'iat' | 'exp'> | null {
  if (!isDemoAuthAllowed()) return null;
  if (!body.demoRole || !VALID_ROLES.has(body.demoRole)) return null;

  const demoDirectory: Record<SessionRole, Omit<SessionPayload, 'iat' | 'exp'>> = {
    customer: {
      uid: 'uid_customer_imphal_01',
      role: 'customer',
      name: body.name?.trim() || 'Thangboi Haokip (Owner)',
      phone: body.phone?.trim() || '+919862011114',
      email: body.email?.trim() || 'owner@ddoodle.in',
      homeId: body.homeId?.trim() || 'home_imphal_001',
      mode: 'demo',
    },
    family_member: {
      uid: 'uid_family_imphal_02',
      role: 'family_member',
      name: body.name?.trim() || 'Priya Sharma (Family)',
      phone: body.phone?.trim() || '+919862022282',
      email: body.email?.trim() || 'family@ddoodle.in',
      homeId: body.homeId?.trim() || 'home_imphal_001',
      mode: 'demo',
    },
    installer: {
      uid: 'uid_installer_manipur_01',
      role: 'installer',
      name: body.name?.trim() || 'Bikramjit Singh (Field Tech)',
      phone: body.phone?.trim() || '+919862055501',
      email: body.email?.trim() || 'installer@ddoodle.in',
      homeId: 'home_imphal_001',
      mode: 'demo',
    },
    admin: {
      uid: 'uid_admin_ddoodle_01',
      role: 'admin',
      name: body.name?.trim() || 'DD oodle Command Admin',
      phone: body.phone?.trim() || '+919862099900',
      email: body.email?.trim() || BOOTSTRAPPED_ADMIN_EMAIL,
      homeId: 'home_imphal_001',
      mode: 'demo',
    },
  };

  return demoDirectory[body.demoRole];
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);
  return NextResponse.json({
    authenticated: Boolean(session),
    session,
    demoEnabled: isDemoAuthAllowed(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SessionPostBody;

    let sessionInput: Omit<SessionPayload, 'iat' | 'exp'> | null = null;
    if (body.idToken) {
      sessionInput = await verifyFirebaseIdToken(body.idToken);
      if (!sessionInput) {
        return NextResponse.json(
          { error: 'Invalid or expired Firebase ID token.' },
          { status: 401 }
        );
      }
    } else if (body.demoRole) {
      sessionInput = verifyDemoAuthRequest(body);
      if (!sessionInput) {
        return NextResponse.json(
          { error: 'Demo authentication is disabled or invalid role supplied.' },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Missing idToken or demoRole payload.' },
        { status: 400 }
      );
    }

    const token = await signSessionToken(sessionInput);
    const redirectTo = getPortalPathForRole(sessionInput.role);
    const response = NextResponse.json({
      ok: true,
      session: sessionInput,
      redirectTo,
    });

    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SEC,
      secure: process.env.NODE_ENV === 'production',
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: 'Failed to create session cookie.' },
      { status: 400 }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}
