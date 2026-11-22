'use client';

import React, { useSyncExternalStore } from 'react';
import { WifiOff, Wifi, Bluetooth, ArrowRight } from 'lucide-react';
import { ActiveTransportTier } from '@/lib/protocol/transports';
import { OperationMode } from '@/lib/protocol/contract';

interface OfflineBannerProps {
  activeTransport: ActiveTransportTier;
  onSelectMode?: (mode: OperationMode) => void;
  selectedDeviceId?: string;
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
}) => {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // If online and on cloud, nothing to warn
  if (isOnline && activeTransport === 'CLOUD') {
    return null;
  }

  const slug = selectedDeviceId.toLowerCase().replace(/_/g, '-');
  const localUrl = `http://ddoodle-${slug}.local/`;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`w-full border-b transition-colors ${
        !isOnline
          ? 'bg-amber-950/40 border-amber-500/30 text-amber-200'
          : 'bg-sky-950/30 border-sky-500/20 text-sky-200'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          {!isOnline ? (
            <div className="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <WifiOff className="w-3.5 h-3.5" />
            </div>
          ) : (
            <div className="w-6 h-6 rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Wifi className="w-3.5 h-3.5" />
            </div>
          )}
          <div>
            <span className="font-semibold">
              {!isOnline ? 'Offline Mode Active' : `Local Access Active (${activeTransport})`}
            </span>
            <span className="opacity-80 ml-2 hidden sm:inline">
              Core 4-Tier fail-safe control & 2D room switches are 100% operational locally.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px]">
          <a
            href={localUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-medium transition"
          >
            <span>Local Portal (Port 80)</span>
            <ArrowRight className="w-3 h-3" />
          </a>

          {onSelectMode && activeTransport !== 'DIRECT_BLE' && (
            <button
              type="button"
              onClick={() => onSelectMode('BLE_ONLY')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition"
            >
              <Bluetooth className="w-3 h-3 text-amber-400" />
              <span>BLE Mode</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
