'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import {
  CheckCircle2,
  KeyRound,
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
  getPortalPathForRole,
  isRoleAllowedForPrefix,
  SessionPayload,
  SessionRole,
} from '@/lib/auth/session';
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { pushToast } = useToast();

  const nextParam = searchParams?.get('next') ?? null;

  const [mode, setMode] = useState<'phone' | 'email'>('phone');
  const [phoneDigits, setPhoneDigits] = useState('9862011114');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [resendSec, setResendSec] = useState(0);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState(true);
  const [activeSession, setActiveSession] = useState<SessionPayload | null>(null);
  const [signedInRole, setSignedInRole] = useState<SessionRole | null>(null);

  useEffect(() => {
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch('/api/auth/session', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as {
          demoEnabled?: boolean;
          session?: SessionPayload | null;
        };
        if (typeof data.demoEnabled === 'boolean') setDemoEnabled(data.demoEnabled);
        if (data.session) setActiveSession(data.session);
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
    demoRole?: SessionRole;
    name?: string;
    phone?: string;
    email?: string;
  }) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        session?: SessionPayload;
      };
      if (!res.ok || !data.session) {
        pushToast({
          title: 'Sign-In Failed',
          description: data.error || 'Could not verify credentials.',
          tone: 'critical',
        });
        return;
      }

      const role = data.session.role;
      const target = resolveSafeRedirect(nextParam, role);
      setSignedInRole(role);
      setActiveSession(data.session);
      pushToast({
        title: `Signed In (${role.replace('_', ' ').toUpperCase()})`,
        description: `Routing to ${target}`,
        tone: 'success',
      });
      router.push(target);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendOtp = () => {
    if (!E164_INDIA_REGEX.test(fullPhone)) {
      pushToast({
        title: 'Enter a valid 10-digit Indian mobile number',
        description: 'Format: +91 followed by 10 digits.',
        tone: 'warning',
      });
      return;
    }
    setOtpSent(true);
    setResendSec(30);
    pushToast({
      title: 'OTP Dispatched (+91)',
      description: `Enter any 6 digits to sign in with preview OTP for ${fullPhone}`,
      tone: 'info',
    });
  };

  const handleVerifyOtp = () => {
    if (otp.length < 6) {
      pushToast({ title: 'Enter all 6 OTP digits', tone: 'warning' });
      return;
    }
    if (!demoEnabled) {
      pushToast({
        title: 'Firebase Phone OTP Required',
        description: 'Demo OTP fallback is disabled in this environment.',
        tone: 'warning',
      });
      return;
    }
    void establishServerSession({
      demoRole: 'customer',
      phone: fullPhone,
      name: `Customer (${fullPhone.slice(-4)})`,
    });
  };

  const handleEmailSignIn = async () => {
    if (!email.includes('@') || password.length < 6) {
      pushToast({ title: 'Enter valid email and password (6+ chars)', tone: 'warning' });
      return;
    }
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const idToken = await cred.user.getIdToken();
      await establishServerSession({ idToken });
    } catch {
      if (demoEnabled) {
        const lower = email.toLowerCase();
        const role: SessionRole = lower.includes('admin') || lower === 'thangboiahi@gmail.com'
          ? 'admin'
          : lower.includes('installer')
          ? 'installer'
          : lower.includes('family')
          ? 'family_member'
          : 'customer';
        await establishServerSession({ demoRole: role, email: email.trim() });
      } else {
        pushToast({
          title: 'Email Sign-In Rejected',
          description: 'Verify your Firebase Email/Password credentials.',
          tone: 'critical',
        });
      }
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      const idToken = await cred.user.getIdToken();
      await establishServerSession({ idToken });
    } catch {
      if (demoEnabled) {
        await establishServerSession({ demoRole: 'customer' });
      } else {
        pushToast({
          title: 'Google Sign-In Cancelled or Blocked',
          tone: 'warning',
        });
      }
    }
  };

  return (
    <div className="max-w-md mx-auto my-6 sm:my-10 px-3 space-y-4">
      <div className="text-center space-y-1.5 flex flex-col items-center">
        <DDoodleLogo size="md" animated={true} />
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
          <Button
            variant="primary"
            size="sm"
            onClick={() => router.push(getPortalPathForRole(activeSession.role))}
          >
            Continue →
          </Button>
        </div>
      )}

      <div className="rounded-2xl bg-surface border border-border-strong p-4 sm:p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <KeyRound className="h-3.5 w-3.5 text-primary" />
            <span>Authentication</span>
          </div>
          <Badge variant="mono">IST · +91</Badge>
        </div>

        <SegmentedControl<'phone' | 'email'>
          fullWidth
          ariaLabel="Sign-in method"
          value={mode}
          onChange={setMode}
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
              Opening {getPortalPathForRole(signedInRole)}...
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
                  placeholder="98620 00000"
                  className="flex-1 h-10 bg-transparent px-3 font-mono text-xs text-foreground tabular-nums focus:outline-none"
                />
              </div>
            </label>

            {otpSent && (
              <div className="space-y-2">
                <OtpPinInput
                  length={6}
                  label="Enter 6-Digit SMS OTP"
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
              <span>{otpSent ? 'Verify OTP & Enter Console' : 'Send 6-Digit OTP'}</span>
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
                placeholder="owner@ddoodle.in"
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
            <Button
              variant="primary"
              className="w-full"
              touchTarget
              disabled={submitting}
              onClick={() => void handleEmailSignIn()}
            >
              <span>Sign In with Email</span>
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

      {/* Preview / Non-Production Role Switcher (Strict Production Gate) */}
      {demoEnabled && (
        <div className="rounded-2xl border border-border bg-surface/80 p-4 space-y-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-foreground">
              Preview Mode · Instant Role Switcher
            </span>
            <Badge variant="warning">DEMO ONLY</Badge>
          </div>
          <p className="text-[11px] text-foreground-muted leading-snug">
            Active when Firebase Admin credentials are unconfigured so you can verify strict
            server-side route isolation across all 4 roles.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={submitting}
              onClick={() => void establishServerSession({ demoRole: 'customer' })}
            >
              <UserCheck className="h-3.5 w-3.5 text-primary" />
              <span>Customer → /console</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={submitting}
              onClick={() => void establishServerSession({ demoRole: 'family_member' })}
            >
              <Users className="h-3.5 w-3.5 text-tertiary" />
              <span>Family → /console</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={submitting}
              onClick={() => void establishServerSession({ demoRole: 'installer' })}
            >
              <Wrench className="h-3.5 w-3.5 text-warning" />
              <span>Installer → /installer</span>
            </Button>
            <Button
              variant="accent"
              size="sm"
              disabled={submitting}
              onClick={() => void establishServerSession({ demoRole: 'admin' })}
            >
              <Shield className="h-3.5 w-3.5" />
              <span>Admin → /admin</span>
            </Button>
          </div>
        </div>
      )}
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
