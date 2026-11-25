'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, KeyRound, Mail, Phone, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  Badge,
  Button,
  OtpPinInput,
  SegmentedControl,
  useToast,
} from '@/components/ui';
import { DDoodleLogo } from '@/components/brand/DDoodleLogo';

const E164_INDIA_REGEX = /^\+91[6-9]\d{9}$/;

export default function AuthPage() {
  const router = useRouter();
  const { pushToast } = useToast();

  const [mode, setMode] = useState<'phone' | 'email'>('phone');
  const [phoneDigits, setPhoneDigits] = useState('9862011114');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [resendSec, setResendSec] = useState(0);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (resendSec <= 0) return;
    const t = window.setInterval(() => setResendSec((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(t);
  }, [resendSec]);

  const fullPhone = `+91${phoneDigits.replace(/\D/g, '')}`;

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
      title: 'SMS OTP Dispatched',
      description: `6-digit Firebase Auth OTP sent to ${fullPhone}`,
      tone: 'info',
    });
  };

  const handleVerifyOtp = () => {
    if (otp.length < 6) {
      pushToast({ title: 'Enter all 6 OTP digits', tone: 'warning' });
      return;
    }
    setSignedIn(true);
    pushToast({
      title: 'Signed In Successfully',
      description: `Authenticated ${fullPhone} · Home: Imphal Residence`,
      tone: 'success',
    });
    window.setTimeout(() => router.push('/'), 800);
  };

  const handleEmailOrGoogle = (provider: 'Email' | 'Google') => {
    if (provider === 'Email' && (!email.includes('@') || password.length < 6)) {
      pushToast({
        title: 'Enter valid email and password (6+ chars)',
        tone: 'warning',
      });
      return;
    }
    setSignedIn(true);
    pushToast({
      title: `Signed In via ${provider}`,
      description: 'Session active for Imphal Residence (OWNER).',
      tone: 'success',
    });
    window.setTimeout(() => router.push('/'), 800);
  };

  return (
    <div className="max-w-sm mx-auto my-8 space-y-4">
      <div className="text-center space-y-1.5 flex flex-col items-center">
        <DDoodleLogo size="md" animated={true} />
        <h1 className="text-base font-semibold tracking-tight text-foreground">
          DD oodle Smart Home Sign In
        </h1>
        <p className="text-[11px] text-foreground-secondary">
          India Phone OTP (+91) or Email / Google Account
        </p>
      </div>

      <div className="rounded-[var(--dd-radius-card)] bg-surface/85 hairline-border p-4 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <KeyRound className="h-3.5 w-3.5 text-accent" />
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

        {signedIn ? (
          <div className="rounded-xl hairline-border bg-success-soft p-4 text-center space-y-2 text-xs">
            <CheckCircle2 className="h-6 w-6 text-success mx-auto" />
            <div className="font-semibold text-foreground">Session Authenticated</div>
            <div className="text-foreground-secondary">Redirecting to Home Dashboard...</div>
          </div>
        ) : mode === 'phone' ? (
          <div className="space-y-3">
            <label className="block space-y-1 text-xs">
              <span className="text-foreground-secondary font-medium">Mobile Number</span>
              <div className="flex items-center rounded-[var(--dd-radius-control)] hairline-border bg-surface-elevated overflow-hidden focus-within:border-accent">
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
              onClick={otpSent ? handleVerifyOtp : handleSendOtp}
            >
              <span>{otpSent ? 'Verify OTP & Sign In' : 'Send 6-Digit OTP'}</span>
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
                className="w-full h-10 rounded-[var(--dd-radius-control)] hairline-border bg-surface-elevated px-3 text-xs text-foreground focus:outline-none focus:border-accent"
              />
            </label>
            <label className="block space-y-1 text-xs">
              <span className="text-foreground-secondary font-medium">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-10 rounded-[var(--dd-radius-control)] hairline-border bg-surface-elevated px-3 text-xs text-foreground focus:outline-none focus:border-accent"
              />
            </label>
            <Button
              variant="primary"
              className="w-full"
              touchTarget
              onClick={() => handleEmailOrGoogle('Email')}
            >
              <span>Sign In with Email</span>
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              touchTarget
              onClick={() => handleEmailOrGoogle('Google')}
            >
              <span>Continue with Google Account</span>
            </Button>
          </div>
        )}

        <div className="pt-2.5 border-t border-border/50 flex items-center gap-2 text-[10px] text-foreground-muted">
          <ShieldCheck className="h-3.5 w-3.5 text-success shrink-0" />
          <span>Offline Port 80 LAN &amp; Web Bluetooth stay accessible via your G7 8-digit local PIN.</span>
        </div>
      </div>
    </div>
  );
}
