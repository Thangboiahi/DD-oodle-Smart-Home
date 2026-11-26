'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  LogOut,
  Mail,
  Phone,
  RefreshCw,
  Shield,
  ShieldCheck,
  UserCheck,
  Users,
  Wrench,
} from 'lucide-react';
import { auth } from '@/lib/firebase/client';
import {
  appendIframeSessionTokenIfNeeded,
  clearClientIframeSessionStorage,
  getPortalPathForRole,
  isRoleAllowedForPrefix,
  SESSION_STORAGE_TOKEN_KEY,
  SESSION_STORAGE_USER_KEY,
  SESSION_TOKEN_HEADER,
  SessionPayload,
  SessionRole,
} from '@/lib/auth/session';
import {
  performCleanSignOut,
  verifyCookieOrNavigateWithToken,
} from '@/components/auth/IframeSessionBridge';
import {
  Badge,
  Button,
  OtpPinInput,
  SegmentedControl,
  useToast,
} from '@/components/ui';
import { AuthSkeleton } from '@/components/ui/ViewSkeletons';
import { DDoodleLogo } from '@/components/brand/DDoodleLogo';

const E164_INDIA_REGEX = /^\+91[6-9]\d{9}$/;

function resolveSafeRedirect(nextParam: string | null, role: SessionRole): string {
  const defaultPortal = getPortalPathForRole(role);
  if (!nextParam || !nextParam.startsWith('/') || nextParam.startsWith('//')) {
    return defaultPortal;
  }
  if (nextParam.startsWith('/admin')) {
    return isRoleAllowedForPrefix(role, '/admin') ? nextParam : defaultPortal;
  }
  if (nextParam.startsWith('/installer')) {
    return isRoleAllowedForPrefix(role, '/installer') ? nextParam : defaultPortal;
  }
  if (nextParam.startsWith('/console')) {
    return isRoleAllowedForPrefix(role, '/console') ? nextParam : defaultPortal;
  }
  return defaultPortal;
}

function AuthWorkspace() {
  const searchParams = useSearchParams();
  const { pushToast } = useToast();

  const nextParam = searchParams?.get('next') ?? null;

  const [mode, setMode] = useState<'phone' | 'email'>('phone');
  const [phoneDigits, setPhoneDigits] = useState('9862011114');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('123456');
  const [resendSec, setResendSec] = useState(0);

  const [email, setEmail] = useState('owner@ddoodle.in');
  const [password, setPassword] = useState('ddoodle123');
  const [submitting, setSubmitting] = useState(false);
  const [loadingRole, setLoadingRole] = useState<SessionRole | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [demoEnabled, setDemoEnabled] = useState(true);
  const [activeSession, setActiveSession] = useState<SessionPayload | null>(null);
  const [activeDemoToken, setActiveDemoToken] = useState<string | null>(null);
  const [signedInRole, setSignedInRole] = useState<SessionRole | null>(null);
  const [redirectTarget, setRedirectTarget] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(async () => {
      try {
        const storedTok =
          typeof window !== 'undefined'
            ? window.sessionStorage.getItem(SESSION_STORAGE_TOKEN_KEY)
            : null;
        if (storedTok) {
          setActiveDemoToken(storedTok);
        }
        const headers: Record<string, string> = {};
        if (storedTok) {
          headers[SESSION_TOKEN_HEADER] = storedTok;
        }
        const res = await fetch('/api/auth/session', {
          cache: 'no-store',
          credentials: 'include',
          headers,
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          demoEnabled?: boolean;
          user?: SessionPayload | null;
          session?: SessionPayload | null;
        };
        if (typeof data.demoEnabled === 'boolean') setDemoEnabled(data.demoEnabled);
        const resolved = data.user ?? data.session ?? null;
        if (resolved) setActiveSession(resolved);
      } catch {
        // Ignore transient network errors on initial probe
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (resendSec <= 0) return;
    const t = window.setInterval(() => setResendSec((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(t);
  }, [resendSec]);

  const fullPhone = `+91${phoneDigits.replace(/\D/g, '')}`;

  const establishServerSession = async (payload: {
    idToken?: string;
    mode?: 'demo' | 'firebase';
    role?: SessionRole;
    demoRole?: SessionRole;
    uid?: string;
    name?: string;
    phone?: string;
    email?: string;
  }) => {
    setSubmitting(true);
    setErrorMessage(null);
    const requestedRole = payload.role ?? payload.demoRole ?? null;
    if (requestedRole) setLoadingRole(requestedRole);

    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        user?: SessionPayload;
        session?: SessionPayload;
        redirectTo?: string;
        demoToken?: string;
      };
      const sessionObj = data.user ?? data.session;
      if (!res.ok || !sessionObj) {
        const msg = data.error || 'Could not establish session cookie. Please try again.';
        setErrorMessage(msg);
        pushToast({
          title: 'Sign-In Failed',
          description: msg,
          tone: 'critical',
        });
        setSubmitting(false);
        setLoadingRole(null);
        return;
      }

      const role = sessionObj.role;
      const target = nextParam
        ? resolveSafeRedirect(nextParam, role)
        : data.redirectTo || getPortalPathForRole(role);

      if (data.demoToken) {
        setActiveDemoToken(data.demoToken);
        try {
          window.sessionStorage.setItem(SESSION_STORAGE_TOKEN_KEY, data.demoToken);
          window.sessionStorage.setItem(SESSION_STORAGE_USER_KEY, JSON.stringify(sessionObj));
        } catch {
          // Ignore storage errors
        }
      }

      setSignedInRole(role);
      setActiveSession(sessionObj);
      setRedirectTarget(target);
      pushToast({
        title: `Signed In (${role.replace('_', ' ').toUpperCase()})`,
        description: `Opening ${target}...`,
        tone: 'success',
      });

      // Immediately probe GET /api/auth/session: if cookies work, navigate cleanly;
      // if cross-origin iframe blocked the cookie, navigate with ?__dd_tok= handoff.
      await verifyCookieOrNavigateWithToken({
        targetPath: target,
        demoToken: data.demoToken ?? null,
        sessionUser: sessionObj,
      });
    } catch {
      const msg = 'Network error while contacting /api/auth/session.';
      setErrorMessage(msg);
      pushToast({
        title: 'Sign-In Error',
        description: msg,
        tone: 'critical',
      });
      setSubmitting(false);
      setLoadingRole(null);
    }
  };

  const handleDemoAccountSignIn = (role: SessionRole) => {
    void establishServerSession({
      mode: 'demo',
      role,
    });
  };

  const handleSignOutCurrentSession = async () => {
    setSubmitting(true);
    setErrorMessage(null);
    clearClientIframeSessionStorage();
    setActiveSession(null);
    setActiveDemoToken(null);
    setSignedInRole(null);
    await performCleanSignOut('/auth');
  };

  const handleSendOtp = () => {
    setErrorMessage(null);
    if (!E164_INDIA_REGEX.test(fullPhone)) {
      const msg = 'Enter a valid 10-digit Indian mobile number (+91 followed by 10 digits starting 6–9).';
      setErrorMessage(msg);
      pushToast({
        title: 'Invalid Indian Mobile Number',
        description: msg,
        tone: 'warning',
      });
      return;
    }
    setOtpSent(true);
    if (otp.length < 6) setOtp('123456');
    setResendSec(30);
    pushToast({
      title: 'OTP Dispatched (+91)',
      description: `Demo OTP 123456 ready for ${fullPhone}`,
      tone: 'info',
    });
  };

  const handleVerifyOtp = () => {
    setErrorMessage(null);
    if (!/^\d{6}$/.test(otp.trim())) {
      const msg = 'Enter all 6 digits of your SMS verification code (e.g. 123456).';
      setErrorMessage(msg);
      pushToast({ title: 'Enter 6-digit OTP', description: msg, tone: 'warning' });
      return;
    }
    if (!demoEnabled) {
      const msg = 'Demo OTP fallback is disabled in this environment.';
      setErrorMessage(msg);
      pushToast({
        title: 'Firebase Phone OTP Required',
        description: msg,
        tone: 'warning',
      });
      return;
    }

    const cleanDigits = phoneDigits.replace(/\D/g, '');
    const matchedRole: SessionRole =
      cleanDigits === '9862099900'
        ? 'admin'
        : cleanDigits === '9862055501'
        ? 'installer'
        : cleanDigits === '9862022282'
        ? 'family_member'
        : 'customer';

    void establishServerSession({
      mode: 'demo',
      role: matchedRole,
      phone: fullPhone,
      name:
        matchedRole === 'customer'
          ? `Thangboi Haokip (${fullPhone.slice(-4)})`
          : undefined,
    });
  };

  const handleEmailSignIn = async () => {
    setErrorMessage(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail.includes('@') || password.length < 6) {
      const msg = 'Enter a valid email address and a password with at least 6 characters.';
      setErrorMessage(msg);
      pushToast({
        title: 'Invalid Email or Password',
        description: msg,
        tone: 'warning',
      });
      return;
    }

    const lower = trimmedEmail.toLowerCase();
    const inferredRole: SessionRole =
      lower.includes('admin') || lower === 'thangboiahi@gmail.com'
        ? 'admin'
        : lower.includes('installer') || lower.includes('tech')
        ? 'installer'
        : lower.includes('family') || lower.includes('member')
        ? 'family_member'
        : 'customer';

    // When demo auth is active, sign in directly against /api/auth/session without stalling
    // on unconfigured Firebase client credentials.
    if (demoEnabled) {
      await establishServerSession({
        mode: 'demo',
        role: inferredRole,
        email: trimmedEmail,
      });
      return;
    }

    try {
      const cred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      const idToken = await cred.user.getIdToken();
      await establishServerSession({ idToken, mode: 'firebase' });
    } catch {
      const msg = 'Verify your Firebase Email/Password credentials.';
      setErrorMessage(msg);
      pushToast({
        title: 'Email Sign-In Rejected',
        description: msg,
        tone: 'critical',
      });
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    if (demoEnabled) {
      await establishServerSession({
        mode: 'demo',
        role: 'customer',
      });
      return;
    }
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      const idToken = await cred.user.getIdToken();
      await establishServerSession({ idToken, mode: 'firebase' });
    } catch {
      const msg = 'Google Sign-In was cancelled or blocked by popup policy.';
      setErrorMessage(msg);
      pushToast({
        title: 'Google Sign-In Blocked',
        description: msg,
        tone: 'warning',
      });
    }
  };

  return (
    <div className="max-w-md mx-auto my-6 sm:my-10 px-3 space-y-4">
      <div className="text-center space-y-1.5 flex flex-col items-center">
        <DDoodleLogo size="lg" variant={submitting || loadingRole !== null ? "loading" : "idle"} animated={true} />
        <h1 className="text-lg font-bold tracking-tight text-foreground">
          My Console — DD oodle Sign In
        </h1>
        <p className="text-xs text-foreground-secondary">
          Server-verified HttpOnly sessions for Customers, Installers &amp; Admin
        </p>
      </div>

      {activeSession && (
        <div className="rounded-2xl border border-primary-border bg-primary-soft/50 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
          <div className="min-w-0">
            <div className="font-semibold text-foreground truncate">
              Active: {activeSession.name}
            </div>
            <div className="text-[10px] font-mono text-foreground-secondary">
              Role: {activeSession.role.toUpperCase()} ({activeSession.mode})
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="primary"
              size="sm"
              disabled={submitting}
              onClick={() => {
                const target = nextParam
                  ? resolveSafeRedirect(nextParam, activeSession.role)
                  : getPortalPathForRole(activeSession.role);
                void verifyCookieOrNavigateWithToken({
                  targetPath: appendIframeSessionTokenIfNeeded(target, activeDemoToken),
                  demoToken: activeDemoToken,
                  sessionUser: activeSession,
                });
              }}
            >
              Continue →
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={submitting}
              onClick={() => void handleSignOutCurrentSession()}
              title="Sign Out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="rounded-xl border border-danger/60 bg-danger-soft/80 px-3.5 py-2.5 flex items-start gap-2 text-xs text-danger"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex-1 leading-snug">{errorMessage}</div>
        </div>
      )}

      {/* Preview / Demo Account 1-Tap Sign-In Card */}
      {demoEnabled && (
        <div className="rounded-2xl border border-accent-border bg-surface p-4 space-y-2.5 text-xs shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-foreground">
              Instant Demo Accounts (1-Tap Sign In)
            </span>
            <Badge variant="warning">DEMO READY</Badge>
          </div>
          <p className="text-[11px] text-foreground-muted leading-snug">
            Tap any role below to issue a signed HttpOnly session cookie and jump directly into its portal.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={submitting}
              onClick={() => handleDemoAccountSignIn('customer')}
            >
              <UserCheck className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate">
                {loadingRole === 'customer' ? 'Signing In...' : 'Customer Owner'}
              </span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={submitting}
              onClick={() => handleDemoAccountSignIn('family_member')}
            >
              <Users className="h-3.5 w-3.5 text-tertiary shrink-0" />
              <span className="truncate">
                {loadingRole === 'family_member' ? 'Signing In...' : 'Family Member'}
              </span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={submitting}
              onClick={() => handleDemoAccountSignIn('installer')}
            >
              <Wrench className="h-3.5 w-3.5 text-warning shrink-0" />
              <span className="truncate">
                {loadingRole === 'installer' ? 'Signing In...' : 'Field Installer'}
              </span>
            </Button>
            <Button
              variant="accent"
              size="sm"
              disabled={submitting}
              onClick={() => handleDemoAccountSignIn('admin')}
            >
              <Shield className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {loadingRole === 'admin' ? 'Signing In...' : 'Master Admin'}
              </span>
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-surface border border-border-strong p-4 sm:p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <KeyRound className="h-3.5 w-3.5 text-primary" />
            <span>Phone OTP or Email Sign-In</span>
          </div>
          <Badge variant="mono">IST · +91</Badge>
        </div>

        <SegmentedControl<'phone' | 'email'>
          fullWidth
          ariaLabel="Sign-in method"
          value={mode}
          onChange={(next) => {
            setErrorMessage(null);
            setMode(next);
          }}
          options={[
            { value: 'phone', label: 'Phone OTP (+91)', icon: <Phone className="h-3.5 w-3.5" /> },
            { value: 'email', label: 'Email / Google', icon: <Mail className="h-3.5 w-3.5" /> },
          ]}
        />

        {signedInRole ? (
          <div className="rounded-xl border border-success/40 bg-success-soft p-4 text-center space-y-2 text-xs">
            <CheckCircle2 className="h-6 w-6 text-success mx-auto" />
            <div className="font-semibold text-foreground">
              Signed In as {signedInRole.replace('_', ' ').toUpperCase()}
            </div>
            <div className="text-foreground-secondary">
              Opening {redirectTarget || getPortalPathForRole(signedInRole)}...
            </div>
          </div>
        ) : mode === 'phone' ? (
          <div className="space-y-3">
            <label className="block space-y-1 text-xs">
              <span className="text-foreground-secondary font-medium">Mobile Number</span>
              <div className="flex items-center rounded-xl border border-border bg-surface-elevated overflow-hidden focus-within:border-accent">
                <span className="px-3 py-2 font-mono text-xs font-semibold text-accent border-r border-border/60 bg-surface">
                  +91
                </span>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={phoneDigits}
                  onChange={(e) => setPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="98620 11114"
                  className="flex-1 h-10 bg-transparent px-3 font-mono text-xs text-foreground tabular-nums focus:outline-none"
                />
              </div>
            </label>

            {otpSent && (
              <div className="space-y-2">
                <OtpPinInput
                  length={6}
                  label="Enter 6-Digit SMS OTP (Demo OTP: 123456)"
                  value={otp}
                  onChange={setOtp}
                />
                <div className="flex items-center justify-between text-[11px] font-mono text-foreground-muted">
                  <span>Sent to {fullPhone}</span>
                  <button
                    type="button"
                    disabled={resendSec > 0}
                    onClick={handleSendOtp}
                    className="inline-flex items-center gap-1 text-accent disabled:opacity-45 cursor-pointer"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>{resendSec > 0 ? `Resend in ${resendSec}s` : 'Resend OTP'}</span>
                  </button>
                </div>
              </div>
            )}

            <Button
              variant="primary"
              className="w-full"
              touchTarget
              disabled={submitting}
              onClick={otpSent ? handleVerifyOtp : handleSendOtp}
            >
              <span>
                {submitting
                  ? 'Verifying Session...'
                  : otpSent
                  ? 'Verify OTP & Enter Console'
                  : 'Send 6-Digit OTP'}
              </span>
            </Button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <label className="block space-y-1 text-xs">
              <span className="text-foreground-secondary font-medium">Email Address</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@ddoodle.in (or admin@ddoodle.in)"
                className="w-full h-10 rounded-xl border border-border bg-surface-elevated px-3 text-xs text-foreground focus:outline-none focus:border-accent"
              />
            </label>
            <label className="block space-y-1 text-xs">
              <span className="text-foreground-secondary font-medium">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-10 rounded-xl border border-border bg-surface-elevated px-3 text-xs text-foreground focus:outline-none focus:border-accent"
              />
            </label>
            <div className="text-[11px] font-mono text-foreground-muted">
              Tip: Use <span className="text-accent">owner@ddoodle.in</span>,{' '}
              <span className="text-accent">family@ddoodle.in</span>,{' '}
              <span className="text-accent">installer@ddoodle.in</span>, or{' '}
              <span className="text-accent">admin@ddoodle.in</span>
            </div>
            <Button
              variant="primary"
              className="w-full"
              touchTarget
              disabled={submitting}
              onClick={() => void handleEmailSignIn()}
            >
              <span>{submitting ? 'Signing In...' : 'Sign In with Email'}</span>
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              touchTarget
              disabled={submitting}
              onClick={() => void handleGoogleSignIn()}
            >
              <span>Continue with Google Account</span>
            </Button>
          </div>
        )}

        <div className="pt-2.5 border-t border-border/50 flex items-center gap-2 text-[10px] text-foreground-muted">
          <ShieldCheck className="h-3.5 w-3.5 text-success shrink-0" />
          <span>Offline Port 80 LAN &amp; Web Bluetooth stay accessible via your G7 8-digit PIN.</span>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <AuthWorkspace />
    </Suspense>
  );
}
