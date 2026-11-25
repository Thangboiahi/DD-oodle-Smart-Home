/**
 * DD oodle Smart Home — Signed HttpOnly Role Session Utility (Edge + Node Web Crypto)
 * Uses HMAC-SHA256 over base64url payload for tamper-proof __dd_session cookies.
 */

export const SESSION_COOKIE_NAME = '__dd_session';
export const SESSION_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

export type SessionRole = 'customer' | 'family_member' | 'installer' | 'admin';

export interface SessionPayload {
  uid: string;
  role: SessionRole;
  name: string;
  email?: string;
  phone?: string;
  homeId: string;
  mode: 'firebase' | 'demo';
  iat: number;
  exp: number;
}

const VALID_ROLES = new Set<SessionRole>(['customer', 'family_member', 'installer', 'admin']);

function getSessionSecret(): string {
  return (
    process.env.SESSION_COOKIE_SECRET ||
    process.env.VOICE_WEBHOOK_SIGNING_SECRET ||
    'dd-oodle-smart-home-v14-hmac-cookie-key'
  );
}

export function isDemoAuthAllowed(): boolean {
  const hasServerAdminCreds = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  return !hasServerAdminCreds && process.env.DISABLE_DEMO_AUTH !== 'true';
}

export function getPortalPathForRole(role: SessionRole): string {
  if (role === 'admin') return '/admin';
  if (role === 'installer') return '/installer';
  return '/console';
}

export function isRoleAllowedForPrefix(role: SessionRole, prefix: '/console' | '/installer' | '/admin'): boolean {
  if (prefix === '/admin') return role === 'admin';
  if (prefix === '/installer') return role === 'installer' || role === 'admin';
  return role === 'customer' || role === 'family_member' || role === 'admin';
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(b64u: string): Uint8Array {
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64u.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

async function importHmacKey(): Promise<CryptoKey> {
  const secretBytes = new TextEncoder().encode(getSessionSecret());
  return crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signSessionToken(
  input: Omit<SessionPayload, 'iat' | 'exp'>,
  nowSec: number = Math.floor(Date.now() / 1000)
): Promise<string> {
  const payload: SessionPayload = {
    ...input,
    iat: nowSec,
    exp: nowSec + SESSION_TTL_SEC,
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));
  const payloadB64 = bytesToBase64Url(jsonBytes);
  const key = await importHmacKey();
  const sigBuf = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payloadB64)
  );
  const sigB64 = bytesToBase64Url(new Uint8Array(sigBuf));
  return `${payloadB64}.${sigB64}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
  nowSec: number = Math.floor(Date.now() / 1000)
): Promise<SessionPayload | null> {
  if (!token || typeof token !== 'string') return null;
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;

  const payloadB64 = token.slice(0, dotIdx);
  const sigB64 = token.slice(dotIdx + 1);
  if (!payloadB64 || !sigB64) return null;

  try {
    const key = await importHmacKey();
    const sigBytes = base64UrlToBytes(sigB64);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes.buffer as ArrayBuffer,
      new TextEncoder().encode(payloadB64)
    );
    if (!valid) return null;

    const jsonText = new TextDecoder().decode(base64UrlToBytes(payloadB64));
    const parsed = JSON.parse(jsonText) as Partial<SessionPayload>;
    if (
      !parsed ||
      typeof parsed.uid !== 'string' ||
      !parsed.uid ||
      typeof parsed.role !== 'string' ||
      !VALID_ROLES.has(parsed.role as SessionRole) ||
      typeof parsed.exp !== 'number' ||
      parsed.exp <= nowSec
    ) {
      return null;
    }

    return {
      uid: parsed.uid,
      role: parsed.role as SessionRole,
      name: typeof parsed.name === 'string' && parsed.name ? parsed.name : 'DD oodle User',
      email: typeof parsed.email === 'string' ? parsed.email : undefined,
      phone: typeof parsed.phone === 'string' ? parsed.phone : undefined,
      homeId: typeof parsed.homeId === 'string' && parsed.homeId ? parsed.homeId : 'home_imphal_001',
      mode: parsed.mode === 'firebase' ? 'firebase' : 'demo',
      iat: typeof parsed.iat === 'number' ? parsed.iat : nowSec,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}
