'use client';

import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from './usePWAInstall';

const INSTALL_DISMISSED_KEY = 'dd_oodle_install_dismissed_v1';

export const PwaLifecycleManager: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      return window.localStorage.getItem(INSTALL_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [iosGuideOpen, setIosGuideOpen] = useState(false);
  const [swUpdateReady, setSwUpdateReady] = useState(false);

  // Listen for Service Worker updatefound / controllerchange events
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    let mounted = true;

    const attach = async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg || !mounted) return;
        if (reg.waiting) setSwUpdateReady(true);
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller && mounted) {
              setSwUpdateReady(true);
            }
          });
        });
      } catch {
        // Ignore if no SW registered in dev
      }
    };
    void attach();

    return () => {
      mounted = false;
    };
  }, []);

  const dismissPrompt = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
    } catch {
      // noop
    }
  };

  return (
    <>
      {/* Non-intrusive Service Worker Update Ready Toast */}
      {swUpdateReady && (
        <div
          role="status"
          className="fixed bottom-20 md:bottom-5 left-4 z-40 flex items-center gap-3 rounded-[var(--dd-radius-card)] border border-primary-border bg-surface px-3.5 py-2.5 shadow-2xl text-xs"
        >
          <RefreshCw className="h-4 w-4 text-primary shrink-0" />
          <span className="font-medium text-foreground">App Update Ready</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-primary text-primary-foreground px-2.5 py-1 font-semibold cursor-pointer"
          >
            Refresh
          </button>
        </div>
      )}

      {/* Dismissible Platform-Aware Install Banner (Android Chrome / iOS Safari) */}
      {!isInstalled && !dismissed && (isInstallable || isIOS) && (
        <div className="fixed bottom-16 md:bottom-5 left-4 right-4 md:left-auto md:right-5 md:max-w-sm z-40 rounded-[var(--dd-radius-card)] border border-border-strong bg-surface p-3.5 shadow-2xl flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-primary-soft border border-primary-border text-primary flex items-center justify-center shrink-0">
              {isIOS ? <Smartphone className="h-4 w-4" /> : <Download className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-foreground truncate">Install DD oodle App</div>
              <div className="text-[11px] text-foreground-muted truncate">
                {isIOS ? 'Share → Add to Home Screen' : 'Instant offline LAN & BLE access'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (isIOS) setIosGuideOpen(true);
                else void install();
              }}
              className="min-h-[34px] rounded-md bg-primary text-primary-foreground px-2.5 py-1 font-semibold cursor-pointer"
            >
              {isIOS ? 'Guide' : 'Install'}
            </button>
            <button
              type="button"
              aria-label="Dismiss install prompt"
              onClick={dismissPrompt}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border text-foreground-muted hover:text-foreground cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {iosGuideOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
          onMouseDown={() => setIosGuideOpen(false)}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-[var(--dd-radius-card)] border border-border-strong bg-surface p-5 shadow-2xl space-y-3 text-xs"
          >
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <span className="text-sm font-semibold text-foreground">Install on iOS Safari</span>
              <button
                type="button"
                onClick={() => setIosGuideOpen(false)}
                className="h-7 w-7 inline-flex items-center justify-center rounded border border-border text-foreground-muted cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <ol className="space-y-2 text-foreground-secondary list-decimal pl-4">
              <li>Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.</li>
              <li>Select <strong>Add to Home Screen</strong>.</li>
              <li>Launch DD oodle anytime—even offline with Port 80 Local Control.</li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
};
