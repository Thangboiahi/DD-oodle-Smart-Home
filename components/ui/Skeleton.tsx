'use client';

import React, { useEffect, useState } from 'react';
import { ArrowRight, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  rounded?: 'sm' | 'md' | 'lg' | 'full';
}

const ROUNDED_MAP = {
  sm: 'rounded',
  md: 'rounded-[var(--dd-radius-control)]',
  lg: 'rounded-[var(--dd-radius-card)]',
  full: 'rounded-full',
};

/**
 * Low-Contrast Theme-Aware Shimmer Skeleton Primitive
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  className,
  rounded = 'md',
  ...props
}) => {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'dd-shimmer border border-border/40',
        ROUNDED_MAP[rounded],
        className
      )}
      {...props}
    />
  );
};

export interface OfflineSafeSkeletonGateProps {
  loading: boolean;
  timeoutMs?: number;
  deviceId?: string;
  skeleton: React.ReactNode;
  offlineFallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Offline-Safe Skeleton Gate (~2.5s timeout):
 * Ensures cloud RTDB skeletons NEVER spin indefinitely offline.
 * Resolves to cached/offline fallback + Port 80 / BLE connectivity trigger.
 */
export const OfflineSafeSkeletonGate: React.FC<OfflineSafeSkeletonGateProps> = ({
  loading,
  timeoutMs = 2500,
  deviceId = 'dd_pwr01_a1b2c3',
  skeleton,
  offlineFallback,
  children,
}) => {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => {
      setTimedOut(true);
    }, timeoutMs);
    return () => window.clearTimeout(timer);
  }, [loading, timeoutMs]);

  if (!loading) {
    return <>{children}</>;
  }

  if (timedOut) {
    if (offlineFallback) return <>{offlineFallback}</>;
    const slug = deviceId.toLowerCase().replace(/_/g, '-');
    return (
      <div className="rounded-[var(--dd-radius-card)] border border-warning/40 bg-warning-soft p-4 space-y-2.5 text-xs">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <WifiOff className="h-4 w-4 text-warning shrink-0" />
          <span>Cloud Sync Timed Out — Switching to Offline Local Mode</span>
        </div>
        <p className="text-foreground-secondary">
          Unable to reach cloud RTDB within {(timeoutMs / 1000).toFixed(1)}s. Use Direct LAN or Web
          Bluetooth via the Connectivity Pill for instant local control.
        </p>
        <a
          href={`http://ddoodle-${slug}.local/`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-[var(--dd-radius-control)] bg-primary text-primary-foreground px-3 py-2 font-semibold"
        >
          <span>Open Local Control (Port 80)</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
    );
  }

  return <>{skeleton}</>;
};
