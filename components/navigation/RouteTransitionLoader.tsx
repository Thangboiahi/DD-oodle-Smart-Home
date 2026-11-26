'use client';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { DDoodleLogo } from '@/components/brand/DDoodleLogo';
import { useThemeEngine } from '@/components/theme/ThemeEngineProvider';
import { simulatorEngine } from '@/lib/simulator/engine';

export interface RouteStartEventDetail {
  href?: string;
  label?: string;
  immediateVeil?: boolean;
}

const IMMEDIATE_CRITICAL_TYPES = new Set([
  'CRASH_DETECTED',
  'SOS_MANUAL',
  'EXT_POWER_LOST',
  'GAS_LEAK',
  'SMOKE_FIRE',
  'FALL_DETECTED',
  'PANIC_SOS',
]);

/**
 * Helper to trigger the global theme-synced route transition loader programmatically
 * (including before `window.location.assign` jumps across `/auth`, `/console`, `/installer`, `/admin`).
 */
export function dispatchRouteStart(detail?: RouteStartEventDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<RouteStartEventDetail>('dd:route-start', { detail }));
}

export function resolveRouteTransitionLabel(rawHref?: string | null, explicitLabel?: string): string {
  if (explicitLabel && explicitLabel.trim().length > 0) {
    return explicitLabel.trim();
  }
  const path = (rawHref || '/').split('?')[0].split('#')[0] || '/';

  if (path.startsWith('/admin')) return 'Verifying Admin Access...';
  if (path.startsWith('/installer')) return 'Syncing Installer Dispatch...';
  if (path.startsWith('/shop')) return 'Loading Module Shop...';
  if (path.startsWith('/auth')) return 'Opening Authentication Portal...';
  if (path.startsWith('/console/twin')) return 'Initializing 3D Architectural Twin...';
  if (path.startsWith('/console/vehicles')) return 'Syncing MapLibre Vehicle GPS...';
  if (path.startsWith('/console/automations')) return 'Loading Hybrid Automation Engine...';
  if (path.startsWith('/console/analytics')) return 'Compiling Energy & Water Telemetry...';
  if (path.startsWith('/console/security')) return 'Syncing Shield Security & Locks...';
  if (path.startsWith('/console/billing')) return 'Loading 5-Tier Entitlements...';
  if (path.startsWith('/console/settings')) return 'Opening Theme & Motion Studio...';
  if (path.startsWith('/console/rooms')) return 'Loading 2D Room Grid...';
  if (path.startsWith('/console/help')) return 'Opening Field Guide & Protocols...';
  if (path.startsWith('/console')) return 'Opening Customer Console...';
  return 'Opening DD oodle Storefront...';
}

function isCrossPortalPath(fromPath: string, toPath: string): boolean {
  const getPortalGroup = (p: string) => {
    if (p.startsWith('/admin')) return 'admin';
    if (p.startsWith('/installer')) return 'installer';
    if (p.startsWith('/console')) return 'console';
    if (p.startsWith('/auth')) return 'auth';
    if (p.startsWith('/shop')) return 'shop';
    return 'public';
  };
  return getPortalGroup(fromPath) !== getPortalGroup(toPath);
}

function isCriticalLifeSafetyCurrentlyActive(): boolean {
  try {
    const snap = simulatorEngine.getSnapshot();
    if (snap.activeCrashSos) {
      return true;
    }
    for (const dev of Object.values(snap.devices)) {
      if (dev.last_alert && IMMEDIATE_CRITICAL_TYPES.has(dev.last_alert.type)) {
        return true;
      }
    }
  } catch {
    // Ignore if simulator not initialized yet
  }
  return false;
}

function RouteTransitionLoaderInner() {
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const searchKey = searchParams ? searchParams.toString() : '';
  const { themeState } = useThemeEngine();

  const [active, setActive] = useState(false);
  const [showVeil, setShowVeil] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusLabel, setStatusLabel] = useState('Opening Customer Console...');
  const [osReducedMotion, setOsReducedMotion] = useState(false);
  const [lifeSafetyBypass, setLifeSafetyBypass] = useState(false);

  const veilTimerRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const failsafeTimerRef = useRef<number | null>(null);
  const startedAtMsRef = useRef<number>(0);
  const lastRouteKeyRef = useRef<string>(`${pathname}?${searchKey}`);

  const clearTimers = useCallback(() => {
    if (veilTimerRef.current) {
      window.clearTimeout(veilTimerRef.current);
      veilTimerRef.current = null;
    }
    if (settleTimerRef.current) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    if (failsafeTimerRef.current) {
      window.clearTimeout(failsafeTimerRef.current);
      failsafeTimerRef.current = null;
    }
  }, []);

  // Track OS prefers-reduced-motion
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setOsReducedMotion(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setOsReducedMotion(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // Subscribe to simulator life-safety state so Crash SOS / critical modal immediately bypasses any loader
  useEffect(() => {
    const checkSafety = () => {
      const unsafe = isCriticalLifeSafetyCurrentlyActive();
      setLifeSafetyBypass(unsafe);
      if (unsafe) {
        clearTimers();
        setActive(false);
        setShowVeil(false);
      }
    };
    checkSafety();
    const unsub = simulatorEngine.subscribe(checkSafety);
    return () => unsub();
  }, [clearTimers]);

  const startTransition = useCallback(
    (detail?: RouteStartEventDetail) => {
      if (isCriticalLifeSafetyCurrentlyActive()) {
        setLifeSafetyBypass(true);
        return;
      }

      clearTimers();
      startedAtMsRef.current = performance.now();

      const targetHref = detail?.href || '/';
      const label = resolveRouteTransitionLabel(targetHref, detail?.label);
      const crossPortal =
        Boolean(detail?.immediateVeil) ||
        Boolean(detail?.label) ||
        isCrossPortalPath(pathname, targetHref);

      setStatusLabel(label);
      setActive(true);
      setProgress(crossPortal ? 42 : 28);

      const isEco = themeState.motionMode === 'eco' || osReducedMotion;
      if (isEco) {
        setShowVeil(false);
      } else if (crossPortal) {
        setShowVeil(true);
      } else {
        setShowVeil(false);
        veilTimerRef.current = window.setTimeout(() => {
          setShowVeil(true);
          setProgress(68);
        }, 150);
      }

      // Safe fallback timeout so the bar/veil can NEVER get stuck if a route change is aborted
      failsafeTimerRef.current = window.setTimeout(() => {
        setProgress(100);
        setShowVeil(false);
        setActive(false);
      }, 2600);
    },
    [clearTimers, osReducedMotion, pathname, themeState.motionMode]
  );

  // Settle & complete smoothly whenever pathname or searchParams updates
  useEffect(() => {
    const currentKey = `${pathname}?${searchKey}`;
    if (lastRouteKeyRef.current === currentKey) return;
    lastRouteKeyRef.current = currentKey;

    if (!active) return;

    if (veilTimerRef.current) {
      window.clearTimeout(veilTimerRef.current);
      veilTimerRef.current = null;
    }
    if (failsafeTimerRef.current) {
      window.clearTimeout(failsafeTimerRef.current);
      failsafeTimerRef.current = null;
    }

    setProgress(100);
    const elapsed = performance.now() - startedAtMsRef.current;
    const minDisplayMs = showVeil ? Math.max(90, 260 - elapsed) : 110;

    settleTimerRef.current = window.setTimeout(() => {
      setShowVeil(false);
      setActive(false);
      setProgress(0);
    }, minDisplayMs);
  }, [pathname, searchKey, active, showVeil]);

  // Listen for custom `dd:route-start`, internal `<Link>` clicks, and programmatic `router.push`
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onCustomRouteStart = (ev: Event) => {
      const customEv = ev as CustomEvent<RouteStartEventDetail>;
      startTransition(customEv.detail);
    };

    const onDocumentClick = (ev: MouseEvent) => {
      if (
        ev.defaultPrevented ||
        ev.button !== 0 ||
        ev.metaKey ||
        ev.ctrlKey ||
        ev.shiftKey ||
        ev.altKey
      ) {
        return;
      }

      const target = ev.target as HTMLElement | null;
      const anchor = target?.closest('a');
      if (!anchor) return;

      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      const rawHref = anchor.getAttribute('href');
      if (!rawHref || !rawHref.startsWith('/') || rawHref.startsWith('//')) return;

      try {
        const nextUrl = new URL(rawHref, window.location.origin);
        const curPath = window.location.pathname;
        const curSearch = window.location.search;

        // Ignore pure in-page hash jumps on the exact same pathname + search
        if (nextUrl.pathname === curPath && nextUrl.search === curSearch) {
          return;
        }

        startTransition({
          href: `${nextUrl.pathname}${nextUrl.search}`,
          immediateVeil: isCrossPortalPath(curPath, nextUrl.pathname),
        });
      } catch {
        // Ignore malformed hrefs
      }
    };

    window.addEventListener('dd:route-start', onCustomRouteStart);
    document.addEventListener('click', onDocumentClick, true);

    return () => {
      window.removeEventListener('dd:route-start', onCustomRouteStart);
      document.removeEventListener('click', onDocumentClick, true);
      clearTimers();
    };
  }, [clearTimers, startTransition]);

  if (lifeSafetyBypass) return null;

  const isEcoMotion = themeState.motionMode === 'eco' || osReducedMotion;

  return (
    <>
      {/* Stage 1: Instant 0ms 2.5px Luminous Tri-Color Top Hairline Beam */}
      <AnimatePresence>
        {active && (
          <motion.div
            key="dd-top-progress-beam"
            aria-hidden="true"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: isEcoMotion ? 0.05 : 0.22 }}
            className="pointer-events-none fixed top-0 inset-x-0 z-[95] h-[2.5px] overflow-hidden"
          >
            {isEcoMotion ? (
              <div
                className="h-full w-full"
                style={{
                  background:
                    'linear-gradient(90deg, var(--dd-color-1) 0%, var(--dd-color-2) 52%, var(--dd-color-3) 100%)',
                }}
              />
            ) : (
              <motion.div
                className="h-full rounded-r-full"
                style={{
                  background:
                    'linear-gradient(90deg, var(--dd-color-1) 0%, var(--dd-color-2) 52%, var(--dd-color-3) 100%)',
                  boxShadow:
                    '0 0 14px var(--dd-color-1), 0 0 6px var(--dd-color-3)',
                }}
                initial={{ width: '16%' }}
                animate={{ width: `${Math.max(22, progress)}%` }}
                transition={{
                  type: 'spring',
                  stiffness: 260,
                  damping: 30,
                }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stage 2: Branded Frosted-Glass Floating Transition Pill (Load > 150ms or Portal Handoff) */}
      <AnimatePresence>
        {active && showVeil && !isEcoMotion && (
          <motion.div
            key="dd-route-transition-pill"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{
              type: 'spring',
              stiffness: 420,
              damping: 30,
            }}
            className="pointer-events-none fixed top-16 left-1/2 -translate-x-1/2 z-[94] flex items-center gap-3 rounded-2xl border border-primary-border bg-[var(--dd-surface-0)]/92 px-3.5 py-2 shadow-2xl backdrop-blur-xl"
            style={{
              boxShadow:
                '0 12px 32px -8px rgba(0, 0, 0, 0.48), 0 0 0 1px var(--dd-color-1-soft)',
            }}
          >
            <DDoodleLogo size="sm" variant="loading" animated />
            <div className="pr-1">
              <div className="text-xs font-semibold tracking-tight text-foreground whitespace-nowrap">
                {statusLabel}
              </div>
              <div className="text-[10px] font-mono text-foreground-muted flex items-center gap-1.5">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: 'var(--dd-color-3)' }}
                />
                <span>DD oodle v1.4 · Syncing State</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export const RouteTransitionLoader: React.FC = () => {
  return (
    <Suspense fallback={null}>
      <RouteTransitionLoaderInner />
    </Suspense>
  );
};

export default RouteTransitionLoader;
