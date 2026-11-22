'use client';

import React, { useState, useSyncExternalStore } from 'react';
import { ArrowRight, Bluetooth, Check, Copy, Eye, EyeOff, Wifi, WifiOff } from 'lucide-react';
import { ActiveTransportTier } from '@/lib/protocol/transports';
import { OperationMode } from '@/lib/protocol/contract';
import { cn } from '@/lib/utils';

interface OfflineBannerProps {
  activeTransport: ActiveTransportTier;
  onSelectMode?: (mode: OperationMode) => void;
  selectedDeviceId?: string;
  localPin?: string;
}

function subscribe(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

function getServerSnapshot() {
  return true;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({
  activeTransport,
  onSelectMode,
  selectedDeviceId = 'dd_pwr01_a1b2c3',
  localPin = '48291034',
}) => {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [revealPin, setRevealPin] = useState(false);
  const [copied, setCopied] = useState(false);

  if (isOnline && activeTransport === 'CLOUD') {
    return null;
  }

  const slug = selectedDeviceId.toLowerCase().replace(/_/g, '-');
  const localUrl = `http://ddoodle-${slug}.local/`;

  const copyPin = () => {
    navigator.clipboard.writeText(localPin);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'w-full border-b transition-colors',
        !isOnline
          ? 'bg-warning-soft border-warning/35 text-foreground'
          : 'bg-accent-soft/60 border-accent-border text-foreground'
      )}
    >
      <div className="max-w-[1440px] mx-auto px-3 sm:px-5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {!isOnline ? (
            <WifiOff className="h-3.5 w-3.5 text-warning shrink-0" />
          ) : (
            <Wifi className="h-3.5 w-3.5 text-accent shrink-0" />
          )}
          <span className="font-semibold">
            {!isOnline ? 'Offline Mode Active' : `Local Transport: ${activeTransport}`}
          </span>
          <span className="hidden md:inline text-foreground-secondary">
            · Core 4-Tier fail-safe control remains 100% operational locally.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
          <button
            type="button"
            onClick={() => setRevealPin((r) => !r)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-surface text-foreground-secondary hover:text-foreground cursor-pointer tabular-nums"
          >
            {revealPin ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            <span>PIN: {revealPin ? localPin : '••••••••'}</span>
          </button>

          <button
            type="button"
            onClick={copyPin}
            aria-label="Copy local PIN"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-surface text-foreground-secondary hover:text-foreground cursor-pointer"
          >
            {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
          </button>

          <a
            href={localUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-accent text-accent-foreground font-semibold hover:brightness-110 transition"
          >
            <span>Open Local Control</span>
            <ArrowRight className="h-3 w-3" />
          </a>

          {onSelectMode && activeTransport !== 'DIRECT_BLE' && (
            <button
              type="button"
              onClick={() => onSelectMode('BLE_ONLY')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-surface text-foreground-secondary hover:text-foreground cursor-pointer"
            >
              <Bluetooth className="h-3 w-3 text-warning" />
              <span>BLE</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
