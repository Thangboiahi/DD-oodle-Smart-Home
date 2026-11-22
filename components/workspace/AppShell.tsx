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
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PlusCircle,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Sun,
  Wrench,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { simulatorEngine } from '@/lib/simulator/engine';

interface NavEntry {
  href: string;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  match: (pathname: string) => boolean;
  group: 'primary' | 'secondary';
}

const NAV_ITEMS: NavEntry[] = [
  {
    href: '/',
    label: 'Home Dashboard',
    shortLabel: 'Home',
    icon: Home,
    match: (p) => p === '/' || p.startsWith('/devices'),
    group: 'primary',
  },
  {
    href: '/vehicles',
    label: 'Vehicles & Safety',
    shortLabel: 'Vehicles',
    icon: Car,
    match: (p) => p.startsWith('/vehicles'),
    group: 'primary',
  },
  {
    href: '/automations',
    label: 'Automations',
    shortLabel: 'Rules',
    icon: Sparkles,
    match: (p) => p.startsWith('/automations'),
    group: 'primary',
  },
  {
    href: '/setup',
    label: 'Device Setup',
    shortLabel: 'Setup',
    icon: PlusCircle,
    match: (p) => p.startsWith('/setup'),
    group: 'secondary',
  },
  {
    href: '/billing',
    label: 'Billing & Core Floor',
    shortLabel: 'Billing',
    icon: CreditCard,
    match: (p) => p.startsWith('/billing'),
    group: 'secondary',
  },
  {
    href: '/settings',
    label: 'Settings',
    shortLabel: 'Settings',
    icon: Settings,
    match: (p) => p.startsWith('/settings'),
    group: 'secondary',
  },
  {
    href: '/admin',
    label: 'Installer Admin',
    shortLabel: 'Admin',
    icon: Wrench,
    match: (p) => p.startsWith('/admin'),
    group: 'secondary',
  },
  {
    href: '/auth',
    label: 'Account & Auth',
    shortLabel: 'Auth',
    icon: KeyRound,
    match: (p) => p.startsWith('/auth'),
    group: 'secondary',
  },
];

function buildBreadcrumbs(pathname: string): Array<{ label: string; href: string }> {
  if (pathname === '/') return [{ label: 'Home', href: '/' }];
  const segments = pathname.split('/').filter(Boolean);
  const crumbs: Array<{ label: string; href: string }> = [{ label: 'Home', href: '/' }];
  let acc = '';
  for (const seg of segments) {
    acc += `/${seg}`;
    const labelMap: Record<string, string> = {
      devices: 'Devices',
      vehicles: 'Vehicles',
      automations: 'Automations',
      setup: 'Provisioning',
      billing: 'Billing',
      settings: 'Settings',
      admin: 'Installer Admin',
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

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname() || '/';
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
      } else if (e.key.toLowerCase() === 'e' && pathname === '/') {
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

  const primaryNav = NAV_ITEMS.filter((i) => i.group === 'primary');
  const secondaryNav = NAV_ITEMS.filter((i) => i.group === 'secondary');

  const cycleTheme = () => {
    const next = prefs.theme === 'obsidian' ? 'alabaster' : prefs.theme === 'alabaster' ? 'system' : 'obsidian';
    setTheme(next);
  };

  const isEcoMotion = prefs.motionMode === 'eco';

  return (
    <MotionConfig reducedMotion={prefs.motionMode === 'fluid' ? 'user' : 'always'}>
      <div className="min-h-screen bg-canvas text-foreground flex flex-col">
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
            <Link href="/" className="flex items-center gap-2.5 min-w-0">
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
          <div className="border-t border-border p-2 shrink-0">
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
          </div>
        </aside>

        {/* Main Column */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Compact Sticky Top Utility Bar */}
          <header className="sticky top-0 z-30 h-14 border-b border-border dd-glass px-3 sm:px-5 flex items-center justify-between gap-2">
            {/* Left: Mobile Brand / Back / Breadcrumbs / Home Switcher */}
            <div className="flex items-center gap-2 min-w-0">
              {isNestedRoute && (
                <button
                  type="button"
                  onClick={() => router.back()}
                  aria-label="Go back"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface-elevated text-foreground-secondary hover:text-foreground cursor-pointer shrink-0"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}

              {/* Mobile Brand Mark */}
              <Link href="/" className="md:hidden flex items-center shrink-0">
                <DDoodleLogo size="sm" animated={!isEcoMotion} />
              </Link>

              {/* Home Switcher Dropdown */}
              <Dropdown
                ariaLabel="Select active home"
                value={activeHome.id}
                onChange={setActiveHomeId}
                triggerClassName="h-8 min-h-0 px-2.5 text-xs max-w-[155px] sm:max-w-[200px]"
                options={homes.map((h) => ({
                  value: h.id,
                  label: h.name,
                  description: h.location,
                  badge: h.hubStatus === 'online' ? 'LIVE' : 'LAN',
                  icon: <Home className="h-3.5 w-3.5" />,
                }))}
              />

              {/* Tablet/Desktop Breadcrumbs */}
              <nav aria-label="Breadcrumb" className="hidden md:flex items-center gap-1 text-xs text-foreground-muted ml-1 min-w-0">
                {breadcrumbs.map((crumb, idx) => {
                  const isLast = idx === breadcrumbs.length - 1;
                  return (
                    <React.Fragment key={crumb.href}>
                      {idx > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />}
                      {isLast ? (
                        <span className="font-medium text-foreground truncate max-w-[160px]">
                          {crumb.label}
                        </span>
                      ) : (
                        <Link
                          href={crumb.href}
                          className="hover:text-foreground transition-colors truncate"
                        >
                          {crumb.label}
                        </Link>
                      )}
                    </React.Fragment>
                  );
                })}
              </nav>
            </div>

            {/* Right: Quick-Jump Search, Connectivity Pill, Alert Bell */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Command Palette Trigger */}
              <button
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
                aria-label="Open quick search"
                className="inline-flex items-center gap-2 h-8 px-2 sm:px-2.5 rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated hover:border-border-strong text-xs text-foreground-secondary hover:text-foreground transition-colors cursor-pointer"
              >
                <Search className="h-3.5 w-3.5" />
                <span className="hidden xl:inline text-[11px]">Quick Jump</span>
                <kbd className="hidden sm:inline-flex rounded border border-border bg-surface px-1 py-0.2 font-mono text-[10px] text-foreground-muted">
                  ⌘K
                </kbd>
              </button>

              {/* Desktop Keyboard Shortcuts Button (?) */}
              <button
                type="button"
                onClick={() => setShortcutsOpen(true)}
                aria-label="Keyboard shortcuts"
                title="Keyboard Shortcuts (?)"
                className="hidden lg:inline-flex items-center justify-center h-8 w-8 rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated hover:border-border-strong text-foreground-secondary hover:text-foreground transition-colors cursor-pointer"
              >
                <Keyboard className="h-3.5 w-3.5" />
              </button>

              {/* Quick Tri-Color Theme Popover */}
              <QuickThemePopover />

              {/* 4-Tier Connectivity Status Pill */}
              <StatusPill
                transport={snapshot.activeTransport}
                homeId={snapshot.home_id}
                lastSyncTs={lastSyncTs}
                onModeSelect={(mode) => simulatorEngine.setTransportModeOverride(mode)}
              />

              {/* Alert Bell -> Slide-Over Alert Inbox Drawer */}
              <button
                type="button"
                onClick={() => setAlertsOpen(true)}
                aria-label="Open Alert Center"
                className={cn(
                  'relative inline-flex h-8 w-8 items-center justify-center rounded-[var(--dd-radius-control)] border transition-colors cursor-pointer',
                  isLifeSafetyActive
                    ? 'border-danger bg-danger-soft text-danger'
                    : 'border-border bg-surface-elevated text-foreground-secondary hover:text-foreground hover:border-border-strong'
                )}
              >
                <Bell className="h-4 w-4" />
                {unreadAlertsCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-danger text-white font-mono text-[9px] font-bold flex items-center justify-center tabular-nums">
                    {unreadAlertsCount}
                  </span>
                )}
              </button>
            </div>
          </header>

          {/* Life-Safety High-Contrast Emergency Override Bar */}
          {isLifeSafetyActive && (
            <div
              role="alert"
              className="w-full bg-danger text-white px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold border-b border-white/20"
            >
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0 animate-pulse" />
                <span>HIGH-CONTRAST LIFE-SAFETY OVERRIDE ACTIVE</span>
                {lifeSafetyReason && (
                  <span className="font-mono text-[11px] bg-black/30 px-2 py-0.5 rounded">
                    {lifeSafetyReason}
                  </span>
                )}
              </div>
              <Link
                href="/vehicles"
                className="underline font-mono text-[11px] hover:opacity-90"
              >
                Inspect Safety Console →
              </Link>
            </div>
          )}

          {/* Offline / Local Access Banner */}
          <OfflineBanner
            activeTransport={snapshot.activeTransport}
            onSelectMode={(mode) => simulatorEngine.setTransportModeOverride(mode)}
          />

          {/* Page Content with non-blocking GPU-composited entrance */}
          <motion.main
            key={pathname}
            initial={isEcoMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={isEcoMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
            className="flex-1 w-full max-w-[1440px] mx-auto px-3 sm:px-5 lg:px-6 py-4 pb-24 md:pb-6 [@media(max-height:500px)_and_(orientation:landscape)]:pb-4"
          >
            {children}
          </motion.main>
        </div>
      </div>

      {/* Mobile Portrait Persistent Bottom Navigation Bar (hidden on md+ and mobile landscape) */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden [@media(max-height:500px)_and_(orientation:landscape)]:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border dd-glass pb-safe"
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
                  className="flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated text-xs font-medium"
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
                  className="flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-[var(--dd-radius-control)] border border-accent-border bg-accent-soft text-accent text-xs font-medium"
                >
                  <Search className="h-4 w-4" />
                  <span>Quick Jump</span>
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
