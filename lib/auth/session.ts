/**
 * DD oodle Smart Home — Signed HttpOnly Role Session Utility (Edge + Node Web Crypto)
 * Uses HMAC-SHA256 over base64url payload for tamper-proof __dd_session cookies.
 */

export const SESSION_COOKIE_NAME = '__dd_session';
export const SESSION_TOKEN_QUERY_PARAM = '__dd_tok';
export const SESSION_TOKEN_HEADER = 'x-dd-session';
export const SESSION_STORAGE_TOKEN_KEY = 'dd_oodle_iframe_session_token';
export const SESSION_STORAGE_USER_KEY = 'dd_oodle_iframe_session_user';
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

export function getSessionSecret(): string {
  return process.env.SESSION_SECRET || 'ddoodle-dev-preview-hmac-v1.4-key';
}

export function isDemoAuthAllowed(): boolean {
  if (
    process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === 'false' ||
    process.env.DISABLE_DEMO_AUTH === 'true'
  ) {
    return false;
  }
  return (
    process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH !== 'false' ||
    !process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  );
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

export function buildSessionSetCookieHeader(
  token: string,
  isHttps: boolean,
  maxAgeSec: number = SESSION_TTL_SEC
): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSec}`,
  ];
  if (isHttps) {
    parts.push('SameSite=None', 'Secure', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  return parts.join('; ');
}

export function appendIframeSessionTokenIfNeeded(
  targetPath: string,
  explicitToken?: string | null
): string {
  if (!targetPath || !targetPath.startsWith('/')) return targetPath;
  const tok =
    explicitToken ??
    (typeof window !== 'undefined'
      ? window.sessionStorage.getItem(SESSION_STORAGE_TOKEN_KEY)
      : null);
  if (!tok) return targetPath;
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const url = new URL(targetPath, base);
    if (!url.searchParams.has(SESSION_TOKEN_QUERY_PARAM)) {
      url.searchParams.set(SESSION_TOKEN_QUERY_PARAM, tok);
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    const joiner = targetPath.includes('?') ? '&' : '?';
    return `${targetPath}${joiner}${SESSION_TOKEN_QUERY_PARAM}=${encodeURIComponent(tok)}`;
  }
}

export function clearClientIframeSessionStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_TOKEN_KEY);
    window.sessionStorage.removeItem(SESSION_STORAGE_USER_KEY);
  } catch {
    // Ignore storage errors
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(b64u: string): Uint8Array<ArrayBuffer> {
  const clean = b64u.trim().replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (clean.length % 4)) % 4;
  const b64 = clean + '='.repeat(padLen);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function encodeUtf8(text: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(text);
  const copy = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  copy.set(encoded);
  return copy;
}

async function importHmacKey(): Promise<CryptoKey> {
  const secretBytes = encodeUtf8(getSessionSecret());
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
  const jsonBytes = encodeUtf8(JSON.stringify(payload));
  const payloadB64 = bytesToBase64Url(jsonBytes);
  const key = await importHmacKey();
  const sigBuf = await crypto.subtle.sign(
    'HMAC',
    key,
    encodeUtf8(payloadB64)
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
    const dataBytes = encodeUtf8(payloadB64);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      dataBytes
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
