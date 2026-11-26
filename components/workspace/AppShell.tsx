'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Car,
  ChevronRight,
  CreditCard,
  Home,
  Keyboard,
  KeyRound,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PlusCircle,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Store,
  Sun,
  Wrench,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SessionPayload } from '@/lib/auth/session';
import { useWorkspace } from './WorkspaceProvider';
import { StatusPill } from '@/components/connectivity/StatusPill';
import { OfflineBanner } from '@/components/connectivity/OfflineBanner';
import { CrashSosModal, CriticalLifeSafetyAlert } from '@/components/safety/CrashSosModal';
import { CommandPalette, Dropdown } from '@/components/ui';
import { KeyboardShortcutsModal } from '@/components/ui/KeyboardShortcutsModal';
import { DDoodleLogo } from '@/components/brand/DDoodleLogo';
import { AppBootSplash } from '@/components/brand/AppBootSplash';
import { QuickThemePopover } from '@/components/theme/CustomTriColorStudio';
import { PwaLifecycleManager } from '@/components/pwa/PwaLifecycleManager';
import { AlertInboxDrawer, AlertInboxEntry } from './AlertInboxDrawer';
import { SmartStickyHeader } from './SmartStickyHeader';
import { FloatingEmergencyAlert } from '@/components/safety/FloatingEmergencyAlert';
import { simulatorEngine } from '@/lib/simulator/engine';
import { IframeTokenSyncBridge, performCleanSignOut } from '@/components/auth/IframeSessionBridge';

interface NavEntry {
  href: string;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  match: (pathname: string) => boolean;
  group: 'primary' | 'secondary';
  adminOnly?: boolean;
}

const NAV_ITEMS: NavEntry[] = [
  {
    href: '/console',
    label: 'Home Dashboard',
    shortLabel: 'Home',
    icon: Home,
    match: (p) => p === '/console' || p.startsWith('/console/devices'),
    group: 'primary',
  },
  {
    href: '/console/vehicles',
    label: 'Vehicles & Safety',
    shortLabel: 'Vehicles',
    icon: Car,
    match: (p) => p.startsWith('/console/vehicles'),
    group: 'primary',
  },
  {
    href: '/console/automations',
    label: 'Automations',
    shortLabel: 'Rules',
    icon: Sparkles,
    match: (p) => p.startsWith('/console/automations'),
    group: 'primary',
  },
  {
    href: '/console/setup',
    label: 'Device Setup',
    shortLabel: 'Setup',
    icon: PlusCircle,
    match: (p) => p.startsWith('/console/setup'),
    group: 'secondary',
  },
  {
    href: '/console/billing',
    label: 'Billing & Core Floor',
    shortLabel: 'Billing',
    icon: CreditCard,
    match: (p) => p.startsWith('/console/billing'),
    group: 'secondary',
  },
  {
    href: '/console/settings',
    label: 'Settings',
    shortLabel: 'Settings',
    icon: Settings,
    match: (p) => p.startsWith('/console/settings'),
    group: 'secondary',
  },
  {
    href: '/?showcase=1',
    label: 'Explore Store & Demos',
    shortLabel: 'Store',
    icon: Store,
    match: () => false,
    group: 'secondary',
  },
  {
    href: '/admin',
    label: 'Admin Command',
    shortLabel: 'Admin',
    icon: Wrench,
    match: (p) => p.startsWith('/admin'),
    group: 'secondary',
    adminOnly: true,
  },
  {
    href: '/auth',
    label: 'Switch Account',
    shortLabel: 'Account',
    icon: KeyRound,
    match: (p) => p.startsWith('/auth'),
    group: 'secondary',
  },
];

function buildBreadcrumbs(pathname: string): Array<{ label: string; href: string }> {
  if (pathname === '/console' || pathname === '/') return [{ label: 'Console', href: '/console' }];
  const segments = pathname.split('/').filter(Boolean);
  const crumbs: Array<{ label: string; href: string }> = [];
  let acc = '';
  for (const seg of segments) {
    acc += `/${seg}`;
    const labelMap: Record<string, string> = {
      console: 'Console',
      devices: 'Devices',
      vehicles: 'Vehicles',
      automations: 'Automations',
      setup: 'Provisioning',
      billing: 'Billing',
      settings: 'Settings',
      admin: 'Admin Command',
      auth: 'Sign In',
    };
    crumbs.push({
      label: labelMap[seg] ?? decodeURIComponent(seg),
      href: acc,
    });
  }
  return crumbs;
}

const IMMEDIATE_CRITICAL_TYPES = new Set([
  'SOS_MANUAL',
  'EXT_POWER_LOST',
  'GAS_LEAK',
  'SMOKE_FIRE',
  'FALL_DETECTED',
  'PANIC_SOS',
]);

export const AppShell: React.FC<{
  children: React.ReactNode;
  session?: SessionPayload | null;
}> = ({ children, session }) => {
  const pathname = usePathname() || '/console';
  const router = useRouter();
  const {
    prefs,
    snapshot,
    lastSyncTs,
    homes,
    activeHome,
    isLifeSafetyActive,
    lifeSafetyReason,
    setActiveHomeId,
    setSidebarCollapsed,
    setTheme,
    setCommandPaletteOpen,
    setEditLayoutMode,
  } = useWorkspace();

  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [readAlertIds, setReadAlertIds] = useState<string[]>([]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isTyping || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen((s) => !s);
      } else if (e.key.toLowerCase() === 'e' && pathname === '/console') {
        e.preventDefault();
        setEditLayoutMode((m) => !m);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pathname, setEditLayoutMode]);

  const breadcrumbs = buildBreadcrumbs(pathname);
  const isNestedRoute = breadcrumbs.length > 2;

  const activeAlerts: AlertInboxEntry[] = [];
  if (snapshot.activeCrashSos && snapshot.activeCrashSos.status !== 'cancelled_by_user') {
    const sosDev = snapshot.devices[snapshot.activeCrashSos.device_id];
    activeAlerts.push({
      id: snapshot.activeCrashSos.incident_id,
      deviceId: snapshot.activeCrashSos.device_id,
      deviceName: sosDev?.name ?? snapshot.activeCrashSos.device_id,
      moduleCode: sosDev?.module_code ?? 'VEH-01',
      type: 'CRASH_DETECTED',
      severity: 'CRITICAL',
      detail:
        snapshot.activeCrashSos.status === 'countdown'
          ? `SOS Countdown: ${snapshot.activeCrashSos.remaining_sec}s remaining`
          : 'Emergency escalation dispatched',
      ts: snapshot.activeCrashSos.started_at_ms,
    });
  }
  for (const dev of Object.values(snapshot.devices)) {
    if (dev.state.fault) {
      activeAlerts.push({
        id: `${dev.device_id}-fault`,
        deviceId: dev.device_id,
        deviceName: dev.name,
        moduleCode: dev.module_code,
        type: dev.state.fault,
        severity: 'HIGH',
        detail: `Latched hardware fault on ${dev.module_code}. Requires 3s physical device hold.`,
        ts: dev.state.ts,
      });
    }
    if (dev.last_alert) {
      const sev: AlertInboxEntry['severity'] =
        dev.last_alert.severity === 'CRITICAL'
          ? 'CRITICAL'
          : dev.last_alert.severity === 'WARNING'
          ? 'WARNING'
          : 'INFO';
      activeAlerts.push({
        id: `${dev.device_id}-${dev.last_alert.ts}`,
        deviceId: dev.device_id,
        deviceName: dev.name,
        moduleCode: dev.module_code,
        type: dev.last_alert.type,
        severity: sev,
        detail: dev.last_alert.message ?? `Alert on ${dev.module_code}`,
        ts: dev.last_alert.ts,
      });
    }
  }
  const unreadAlertsCount = activeAlerts.filter((a) => !readAlertIds.includes(a.id)).length;

  let activeCriticalAlert: CriticalLifeSafetyAlert | null = null;
  for (const dev of Object.values(snapshot.devices)) {
    if (dev.last_alert && IMMEDIATE_CRITICAL_TYPES.has(dev.last_alert.type)) {
      activeCriticalAlert = {
        deviceId: dev.device_id,
        deviceName: dev.name,
        alert: dev.last_alert,
        contacts: dev.config.sos?.contacts,
      };
      break;
    }
  }

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || session?.role === 'admin'
  );
  const primaryNav = visibleNavItems.filter((i) => i.group === 'primary');
  const secondaryNav = visibleNavItems.filter((i) => i.group === 'secondary');

  const handleSignOut = async () => {
    await performCleanSignOut('/auth');
  };

  const cycleTheme = () => {
    const next = prefs.theme === 'obsidian' ? 'alabaster' : prefs.theme === 'alabaster' ? 'system' : 'obsidian';
    setTheme(next);
  };

  const isEcoMotion = prefs.motionMode === 'eco';

  return (
    <MotionConfig reducedMotion={prefs.motionMode === 'fluid' ? 'user' : 'always'}>
      <div className="min-h-screen bg-canvas text-foreground flex flex-col">
        <React.Suspense fallback={null}>
          <IframeTokenSyncBridge />
        </React.Suspense>
        {/* Cold PWA Boot Splash (0ms bypass when Life-Safety Critical is active) */}
        <AppBootSplash />

        {/* Global Command Palette */}
        <CommandPalette />

        {/* Desktop Keyboard Shortcuts Guide (?) */}
        <KeyboardShortcutsModal
          open={shortcutsOpen}
          onClose={() => setShortcutsOpen(false)}
        />

        {/* Global Alert Center Slide-Over Drawer */}
        <AlertInboxDrawer
          open={alertsOpen}
          onClose={() => setAlertsOpen(false)}
          alerts={activeAlerts}
          readIds={readAlertIds}
          onMarkRead={(id) =>
            setReadAlertIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
          }
          onMarkAllRead={() => setReadAlertIds(activeAlerts.map((a) => a.id))}
        />

        {/* PWA Service Worker Update & Install Prompt */}
        <PwaLifecycleManager />

      {/* Global Crash SOS & Critical Life-Safety Modal */}
      <CrashSosModal
        session={snapshot.activeCrashSos}
        criticalAlert={activeCriticalAlert}
        emergencyContacts={snapshot.devices['dd_veh01_m4n5p6']?.config.sos?.contacts}
        onCancelSos={() => simulatorEngine.cancelCrashSos()}
      />

      <div className="flex flex-1 min-h-0">
        {/* Desktop & Tablet Navigation Sidebar / Rail + Mobile Landscape Rail */}
        <aside
          aria-label="Primary Navigation"
          className={cn(
            'hidden md:flex [@media(max-height:500px)_and_(orientation:landscape)]:flex flex-col border-r border-border bg-surface sticky top-0 h-screen shrink-0 transition-[width] duration-200 z-30',
            prefs.sidebarCollapsed
              ? 'w-16'
              : 'w-16 lg:w-60 [@media(max-height:500px)_and_(orientation:landscape)]:w-14'
          )}
        >
          {/* Brand Header */}
          <div className="h-14 flex items-center justify-between gap-2 px-3 border-b border-border shrink-0">
            <Link href="/console" className="flex items-center gap-2.5 min-w-0">
              <DDoodleLogo
                size="sm"
                showWordmark={!prefs.sidebarCollapsed}
                animated={!isEcoMotion}
              />
            </Link>

            <button
              type="button"
              onClick={() => setSidebarCollapsed(!prefs.sidebarCollapsed)}
              aria-label={prefs.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={prefs.sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
              className="hidden lg:inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground-muted hover:text-foreground hover:bg-surface-muted transition-colors cursor-pointer shrink-0"
            >
              {prefs.sidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Nav Links */}
          <nav className="flex-1 overflow-y-auto p-2 space-y-4 dd-scroll">
            <div className="space-y-0.5">
              {!prefs.sidebarCollapsed && (
                <div className="hidden lg:block px-2.5 pb-1 text-[10px] font-mono uppercase tracking-wider text-foreground-muted">
                  Workspace
                </div>
              )}
              {primaryNav.map((item) => {
                const Icon = item.icon;
                const active = item.match(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    className={cn(
                      'flex items-center gap-2.5 rounded-[var(--dd-radius-control)] px-2.5 h-10 text-xs font-medium transition-colors border',
                      active
                        ? 'bg-accent-soft text-accent border-accent-border'
                        : 'text-foreground-secondary hover:text-foreground hover:bg-surface-muted border-transparent',
                      prefs.sidebarCollapsed ? 'justify-center px-0' : 'justify-center lg:justify-start'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!prefs.sidebarCollapsed && (
                      <span className="hidden lg:inline truncate">{item.label}</span>
                    )}
                  </Link>
                );
              })}
            </div>

            <div className="space-y-0.5 pt-2 border-t border-border/70">
              {!prefs.sidebarCollapsed && (
                <div className="hidden lg:block px-2.5 pb-1 text-[10px] font-mono uppercase tracking-wider text-foreground-muted">
                  System & Fleet
                </div>
              )}
              {secondaryNav.map((item) => {
                const Icon = item.icon;
                const active = item.match(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    className={cn(
                      'flex items-center gap-2.5 rounded-[var(--dd-radius-control)] px-2.5 h-9 text-xs font-medium transition-colors border',
                      active
                        ? 'bg-accent-soft text-accent border-accent-border'
                        : 'text-foreground-secondary hover:text-foreground hover:bg-surface-muted border-transparent',
                      prefs.sidebarCollapsed ? 'justify-center px-0' : 'justify-center lg:justify-start'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!prefs.sidebarCollapsed && (
                      <span className="hidden lg:inline truncate">{item.label}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Bottom Sidebar Footer */}
          <div className="border-t border-border p-2 space-y-1 shrink-0">
            {!prefs.sidebarCollapsed && session && (
              <div className="hidden lg:flex items-center justify-between px-2.5 py-1 text-[10px] font-mono text-foreground-muted">
                <span className="truncate">{session.name}</span>
                <span className="uppercase text-accent">{session.role === 'family_member' ? 'FAMILY' : session.role}</span>
              </div>
            )}
            <button
              type="button"
              onClick={cycleTheme}
              title={`Theme: ${prefs.theme} (click to switch)`}
              className={cn(
                'w-full flex items-center gap-2.5 rounded-[var(--dd-radius-control)] px-2.5 h-9 text-xs text-foreground-secondary hover:text-foreground hover:bg-surface-muted transition-colors cursor-pointer',
                prefs.sidebarCollapsed ? 'justify-center px-0' : 'justify-center lg:justify-start'
              )}
            >
              {prefs.theme === 'alabaster' ? (
                <Sun className="h-4 w-4 shrink-0 text-warning" />
              ) : (
                <Moon className="h-4 w-4 shrink-0 text-accent" />
              )}
              {!prefs.sidebarCollapsed && (
                <span className="hidden lg:inline truncate capitalize font-mono text-[11px]">
                  {prefs.theme === 'obsidian'
                    ? 'Obsidian Slate'
                    : prefs.theme === 'alabaster'
                    ? 'Alabaster Day'
                    : 'System Auto'}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              title="Sign Out"
              className={cn(
                'w-full flex items-center gap-2.5 rounded-[var(--dd-radius-control)] px-2.5 h-9 text-xs text-foreground-secondary hover:text-danger hover:bg-danger-soft/50 transition-colors cursor-pointer',
                prefs.sidebarCollapsed ? 'justify-center px-0' : 'justify-center lg:justify-start'
              )}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {!prefs.sidebarCollapsed && (
                <span className="hidden lg:inline truncate text-[11px] font-medium">Sign Out</span>
              )}
            </button>
          </div>
        </aside>

        {/* Phase 8: Floating + Auto-Docking Emergency Alert System & Cause/Recovery Sheet */}
        <FloatingEmergencyAlert />

        {/* Main Column */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Phase 8: Rock-Solid Low-Sensitivity Scroll-Aware Sticky Header */}
          <SmartStickyHeader
            homes={homes}
            activeHome={activeHome}
            onSelectHome={setActiveHomeId}
            unreadAlertsCount={unreadAlertsCount}
            hasActiveFaultOrCritical={isLifeSafetyActive || activeAlerts.length > 0}
            lastSyncTs={lastSyncTs}
            session={session}
            onOpenAlertInbox={() => setAlertsOpen(true)}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            onOpenShortcuts={() => setShortcutsOpen(true)}
          />

          {/* Offline / Local Access Banner */}
          <OfflineBanner
            activeTransport={snapshot.activeTransport}
            onSelectMode={(mode) => simulatorEngine.setTransportModeOverride(mode)}
          />

          {/* Page Content with non-blocking GPU-composited entrance & generous bottom clearance */}
          <motion.main
            id="main-workspace"
            key={pathname}
            initial={isEcoMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={isEcoMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
            className="flex-1 w-full max-w-[1440px] mx-auto px-3 sm:px-5 lg:px-6 py-3 sm:py-4 pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-8 [@media(max-height:500px)_and_(orientation:landscape)]:pb-4"
          >
            {children}
          </motion.main>
        </div>
      </div>

      {/* Mobile Portrait Persistent Bottom Navigation Bar (hidden on md+ and mobile landscape) */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden [@media(max-height:500px)_and_(orientation:landscape)]:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/80 bg-[var(--dd-surface-0)]/96 backdrop-blur-md pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.22)]"
      >
        <div className="grid grid-cols-4 h-14 px-1">
          {primaryNav.map((item) => {
            const Icon = item.icon;
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
                  active ? 'text-accent' : 'text-foreground-secondary'
                )}
              >
                {active && (
                  <motion.span
                    layoutId="mobile-bottom-nav-active"
                    transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                    className="absolute inset-x-2 inset-y-1.5 rounded-lg bg-accent-soft border border-accent-border"
                  />
                )}
                <Icon className="relative z-10 h-4 w-4" />
                <span className="relative z-10">{item.shortLabel}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setMoreDrawerOpen(true)}
            className={cn(
              'relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors cursor-pointer',
              moreDrawerOpen || secondaryNav.some((i) => i.match(pathname))
                ? 'text-accent'
                : 'text-foreground-secondary'
            )}
          >
            {secondaryNav.some((i) => i.match(pathname)) && (
              <motion.span
                layoutId="mobile-bottom-nav-active"
                transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                className="absolute inset-x-2 inset-y-1.5 rounded-lg bg-accent-soft border border-accent-border"
              />
            )}
            <Menu className="relative z-10 h-4 w-4" />
            <span className="relative z-10">More</span>
          </button>
        </div>
      </nav>

      {/* Mobile "More" Drawer */}
      <AnimatePresence>
        {moreDrawerOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-[2px]"
              onClick={() => setMoreDrawerOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              className="relative z-10 rounded-t-2xl border-t border-border-strong bg-surface p-4 pb-safe shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-accent" />
                  <span className="text-sm font-semibold">DD oodle Menu</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMoreDrawerOpen(false)}
                  aria-label="Close menu"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border text-foreground-secondary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {secondaryNav.map((item) => {
                  const Icon = item.icon;
                  const active = item.match(pathname);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMoreDrawerOpen(false)}
                      className={cn(
                        'flex items-center gap-2.5 min-h-[44px] rounded-[var(--dd-radius-control)] border px-3 py-2 text-xs font-medium',
                        active
                          ? 'bg-accent-soft text-accent border-accent-border'
                          : 'bg-surface-elevated text-foreground border-border'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={cycleTheme}
                  className="flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated text-xs font-medium cursor-pointer"
                >
                  {prefs.theme === 'alabaster' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  <span>Theme: {prefs.theme}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMoreDrawerOpen(false);
                    setCommandPaletteOpen(true);
                  }}
                  className="flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-[var(--dd-radius-control)] border border-accent-border bg-accent-soft text-accent text-xs font-medium cursor-pointer"
                >
                  <Search className="h-4 w-4" />
                  <span>Quick Jump</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMoreDrawerOpen(false);
                    void handleSignOut();
                  }}
                  className="min-h-[44px] px-3 flex items-center justify-center gap-1.5 rounded-[var(--dd-radius-control)] border border-danger/40 bg-danger-soft/50 text-danger text-xs font-medium cursor-pointer"
                  aria-label="Sign Out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </div>
    </MotionConfig>
  );
};
