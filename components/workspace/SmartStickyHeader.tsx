'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  ArrowLeft,
  Bell,
  Box,
  Check,
  ChevronDown,
  CreditCard,
  Home,
  Keyboard,
  LayoutGrid,
  MoreHorizontal,
  Moon,
  Search,
  ShieldAlert,
  Sun,
  Volume2,
} from 'lucide-react';
import { simulatorEngine } from '@/lib/simulator/engine';
import {
  HomeSummary,
  useWorkspace,
} from '@/components/workspace/WorkspaceProvider';
import {
  TRI_COLOR_PRESETS,
  TriColorPresetId,
} from '@/components/theme/triColor';
import { StatusPill } from '@/components/connectivity/StatusPill';
import { DDoodleLogo } from '@/components/brand/DDoodleLogo';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface SmartStickyHeaderProps {
  homes: HomeSummary[];
  activeHome: HomeSummary;
  onSelectHome: (homeId: string) => void;
  unreadAlertsCount: number;
  hasActiveFaultOrCritical: boolean;
  lastSyncTs: number;
  onOpenAlertInbox: () => void;
  onOpenCommandPalette: () => void;
  onOpenShortcuts: () => void;
}

export const SmartStickyHeader: React.FC<SmartStickyHeaderProps> = ({
  homes,
  activeHome,
  onSelectHome,
  unreadAlertsCount,
  hasActiveFaultOrCritical,
  lastSyncTs,
  onOpenAlertInbox,
  onOpenCommandPalette,
  onOpenShortcuts,
}) => {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const {
    prefs,
    setTheme,
    setPalettePreset,
    snapshot,
    editLayoutMode,
    setEditLayoutMode,
    setDockPanelState,
    getDockPanelState,
  } = useWorkspace();

  // Scroll-direction hysteresis state:
  // Stay pinned near top (< 72px); only condense/tuck after continuous downward scroll >= 56px;
  // reveal after continuous upward scroll >= 36px. Never vanishes completely.
  const [condensed, setCondensed] = useState(false);
  const lastScrollYRef = useRef<number>(0);
  const downAccumRef = useRef<number>(0);
  const upAccumRef = useRef<number>(0);

  // Dropdown states
  const [homeMenuOpen, setHomeMenuOpen] = useState(false);
  const [quickToolsOpen, setQuickToolsOpen] = useState(false);
  const homeMenuRef = useRef<HTMLDivElement>(null);
  const quickToolsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = (targetY: number) => {
      const y = Math.max(0, targetY);
      const delta = y - lastScrollYRef.current;
      lastScrollYRef.current = y;

      // Always un-condense near the top of the page
      if (y < 72) {
        downAccumRef.current = 0;
        upAccumRef.current = 0;
        setCondensed(false);
        return;
      }

      // Ignore micro-jitter (< 3px)
      if (Math.abs(delta) < 3) return;

      if (delta > 0) {
        downAccumRef.current += delta;
        upAccumRef.current = 0;
        if (downAccumRef.current >= 56) {
          setCondensed(true);
        }
      } else {
        upAccumRef.current += Math.abs(delta);
        downAccumRef.current = 0;
        if (upAccumRef.current >= 36) {
          setCondensed(false);
        }
      }
    };

    const onWindowScroll = () => {
      const winY =
        window.scrollY ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0;
      handleScroll(winY);
    };

    const mainEl = document.getElementById('main-workspace');
    const onMainScroll = () => {
      if (mainEl && mainEl.scrollTop > 0) {
        handleScroll(mainEl.scrollTop);
      }
    };

    window.addEventListener('scroll', onWindowScroll, { passive: true });
    mainEl?.addEventListener('scroll', onMainScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onWindowScroll);
      mainEl?.removeEventListener('scroll', onMainScroll);
    };
  }, []);

  // Close popovers on outside click
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (homeMenuRef.current && !homeMenuRef.current.contains(e.target as Node)) {
        setHomeMenuOpen(false);
      }
      if (quickToolsRef.current && !quickToolsRef.current.contains(e.target as Node)) {
        setQuickToolsOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const isNestedRoute =
    (pathname.startsWith('/devices/') && pathname !== '/devices') ||
    (pathname.startsWith('/vehicles/') && pathname !== '/vehicles');

  const simWorkbenchDock = getDockPanelState('home_sim_workbench');
  const isEcoMotion = prefs.motionMode === 'eco';

  return (
    <header
      className={cn(
        'sticky top-0 z-40 w-full bg-[var(--dd-surface-0)]/96 backdrop-blur-md border-b border-border/80 transition-all duration-200',
        condensed ? 'h-12 shadow-md' : 'h-[54px] md:h-14'
      )}
    >
      <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between gap-1.5 sm:gap-2 px-2.5 sm:px-5">
        {/* LEFT: Back Button (on nested route), Mobile Brand Mark & Home Switcher Dropdown */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          {isNestedRoute ? (
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Go back"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-surface-elevated text-foreground-secondary hover:text-foreground transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <Link href="/" className="md:hidden flex items-center shrink-0">
              <DDoodleLogo size="sm" animated={!isEcoMotion} />
            </Link>
          )}

          {/* Home Switcher Dropdown (includes Plan Tier badge & link to /billing) */}
          <div ref={homeMenuRef} className="relative min-w-0 flex-1 max-w-[140px] sm:max-w-[260px]">
            <button
              type="button"
              onClick={() => setHomeMenuOpen((v) => !v)}
              aria-expanded={homeMenuOpen}
              aria-label="Switch active home"
              className="inline-flex h-9 w-full min-w-0 items-center gap-1.5 rounded-lg border border-border/70 bg-surface-elevated px-2 sm:px-2.5 text-xs font-medium text-foreground hover:border-border-strong transition-colors cursor-pointer"
            >
              <Home className="h-3.5 w-3.5 text-accent shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{activeHome.name}</span>
              <ChevronDown className="h-3.5 w-3.5 text-foreground-muted shrink-0" />
            </button>

            {homeMenuOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-64 rounded-xl border border-border bg-surface shadow-2xl p-1.5 z-50 space-y-1">
                <div className="px-2.5 py-1.5 flex items-center justify-between border-b border-border/60">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-foreground-muted">
                    Select Residence
                  </span>
                  <Badge variant="accent" className="text-[10px]">
                    PLUS · 78d Trial
                  </Badge>
                </div>

                {homes.map((h) => {
                  const selected = h.id === activeHome.id;
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => {
                        onSelectHome(h.id);
                        setHomeMenuOpen(false);
                      }}
                      className={cn(
                        'w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors cursor-pointer',
                        selected
                          ? 'bg-accent-soft text-accent font-semibold'
                          : 'text-foreground hover:bg-surface-elevated'
                      )}
                    >
                      <div className="min-w-0">
                        <div className="truncate">{h.name}</div>
                        <div className="text-[10px] font-mono text-foreground-muted">
                          {h.location} · {h.hubStatus === 'online' ? 'LIVE' : 'LAN'}
                        </div>
                      </div>
                      {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  );
                })}

                <div className="pt-1 border-t border-border/60">
                  <Link
                    href="/billing"
                    onClick={() => setHomeMenuOpen(false)}
                    className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-foreground-secondary hover:bg-surface-elevated hover:text-foreground"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <CreditCard className="h-3.5 w-3.5 text-accent" />
                      <span>Manage Plan &amp; Core Guarantee</span>
                    </span>
                    <span className="font-mono text-[10px] text-accent">→</span>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Slim Primary Controls (Connectivity Pill, Command Search, Alert Bell, Quick Tools `...`) */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* 1. Compact 4-Tier Connectivity Status Pill */}
          <StatusPill
            transport={snapshot.activeTransport}
            homeId={snapshot.home_id}
            lastSyncTs={lastSyncTs}
            onModeSelect={(mode) => simulatorEngine.setTransportModeOverride(mode)}
          />

          {/* 2. Search / Command Palette Trigger */}
          <button
            type="button"
            onClick={onOpenCommandPalette}
            aria-label="Search devices, rooms, and commands (Cmd+K)"
            title="Command Palette (⌘K)"
            className="shrink-0 inline-flex h-9 w-9 sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-surface-elevated px-0 sm:px-2.5 text-xs text-foreground-secondary hover:text-foreground hover:border-border-strong transition-colors cursor-pointer"
          >
            <Search className="h-4 w-4 sm:h-3.5 sm:w-3.5 text-accent shrink-0" />
            <span className="hidden lg:inline text-[11px]">Search</span>
            <kbd className="hidden sm:inline-block rounded border border-border bg-surface px-1 py-0.5 font-mono text-[10px] text-foreground-muted">
              ⌘K
            </kbd>
          </button>

          {/* 3. Alert Bell / Emergency Beacon Trigger */}
          <button
            type="button"
            onClick={() => {
              if (hasActiveFaultOrCritical) {
                window.dispatchEvent(new CustomEvent('ddoodle:open-emergency-sheet'));
              } else {
                onOpenAlertInbox();
              }
            }}
            aria-label={`Alerts and Faults (${unreadAlertsCount})`}
            title="Alerts & Diagnostics"
            className={cn(
              'shrink-0 relative inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors cursor-pointer',
              hasActiveFaultOrCritical
                ? 'border-danger/70 bg-danger/15 text-danger'
                : 'border-border/70 bg-surface-elevated text-foreground-secondary hover:text-foreground'
            )}
          >
            <Bell className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            {unreadAlertsCount > 0 && (
              <span
                className={cn(
                  'absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-mono font-bold text-white tabular-nums',
                  hasActiveFaultOrCritical ? 'bg-danger' : 'bg-accent text-[var(--dd-accent-fg)]'
                )}
              >
                {unreadAlertsCount}
              </span>
            )}
          </button>

          {/* 4. Single `...` Quick Tools Dropdown (Customize Layout, 2D/3D View, Theme, Diagnostics, Voice) */}
          <div ref={quickToolsRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setQuickToolsOpen((v) => !v)}
              aria-expanded={quickToolsOpen}
              aria-label="Quick workspace tools"
              title="Quick Tools & Workspace Options"
              className={cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors cursor-pointer',
                quickToolsOpen || editLayoutMode
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-border/70 bg-surface-elevated text-foreground-secondary hover:text-foreground'
              )}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>

            {quickToolsOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-64 rounded-xl border border-border bg-surface shadow-2xl p-1.5 z-50 space-y-1 text-xs">
                <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-foreground-muted">
                  Quick Workspace Tools
                </div>

                {/* Customize 2D Layout Toggle */}
                <button
                  type="button"
                  onClick={() => {
                    setEditLayoutMode(!editLayoutMode);
                    setQuickToolsOpen(false);
                    if (pathname !== '/') router.push('/');
                  }}
                  className={cn(
                    'w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors cursor-pointer',
                    editLayoutMode
                      ? 'bg-accent-soft text-accent font-semibold'
                      : 'text-foreground hover:bg-surface-elevated'
                  )}
                >
                  <span className="inline-flex items-center gap-2">
                    <LayoutGrid className="h-3.5 w-3.5 text-accent" />
                    <span>{editLayoutMode ? 'Finish Layout Editing' : 'Customize Room Layout'}</span>
                  </span>
                  {editLayoutMode && <Badge variant="accent">ON</Badge>}
                </button>

                {/* Switch 2D / 3D Home Twin Mode */}
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('ddoodle:toggle-home-view-mode'));
                    setQuickToolsOpen(false);
                    if (pathname !== '/') router.push('/');
                  }}
                  className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-foreground hover:bg-surface-elevated transition-colors cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2">
                    <Box className="h-3.5 w-3.5 text-accent" />
                    <span>Toggle 2D Grid / 3D Home Twin</span>
                  </span>
                  <span className="text-[10px] font-mono text-foreground-muted">PLUS</span>
                </button>

                {/* Voice C2C Modal Trigger */}
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('ddoodle:open-voice-modal'));
                    setQuickToolsOpen(false);
                    if (pathname !== '/') router.push('/');
                  }}
                  className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-foreground hover:bg-surface-elevated transition-colors cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2">
                    <Volume2 className="h-3.5 w-3.5 text-accent" />
                    <span>Voice Assistants (C2C)</span>
                  </span>
                  <span className="text-[10px] font-mono text-foreground-muted">G-Home/Alexa</span>
                </button>

                {/* Protocol v1.4 Diagnostics Workbench */}
                <button
                  type="button"
                  onClick={() => {
                    setDockPanelState('home_sim_workbench', {
                      open: !simWorkbenchDock.open,
                      collapsed: false,
                    });
                    setQuickToolsOpen(false);
                    if (pathname !== '/') router.push('/');
                  }}
                  className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-foreground hover:bg-surface-elevated transition-colors cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5 text-accent" />
                    <span>v1.4 Protocol Simulator Deck</span>
                  </span>
                  {simWorkbenchDock.open && <Badge variant="accent">OPEN</Badge>}
                </button>

                {/* Alert Inbox History */}
                <button
                  type="button"
                  onClick={() => {
                    onOpenAlertInbox();
                    setQuickToolsOpen(false);
                  }}
                  className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-foreground hover:bg-surface-elevated transition-colors cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2">
                    <ShieldAlert className="h-3.5 w-3.5 text-accent" />
                    <span>Alert Inbox &amp; Event Log</span>
                  </span>
                  <span className="font-mono text-[10px] text-foreground-muted">
                    {unreadAlertsCount}
                  </span>
                </button>

                {/* Keyboard Shortcuts Guide */}
                <button
                  type="button"
                  onClick={() => {
                    onOpenShortcuts();
                    setQuickToolsOpen(false);
                  }}
                  className="hidden sm:flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-foreground hover:bg-surface-elevated transition-colors cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2">
                    <Keyboard className="h-3.5 w-3.5 text-accent" />
                    <span>Keyboard Shortcuts</span>
                  </span>
                  <kbd className="rounded border border-border bg-surface px-1 py-0.5 font-mono text-[10px] text-foreground-muted">
                    ?
                  </kbd>
                </button>

                {/* Quick Theme & Tri-Color Palette Switcher */}
                <div className="pt-1.5 mt-1 border-t border-border/60 px-2.5 py-1.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase text-foreground-muted">
                      Surface Theme
                    </span>
                    <div className="inline-flex rounded-lg border border-border bg-surface-elevated p-0.5">
                      <button
                        type="button"
                        onClick={() => setTheme('obsidian')}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium cursor-pointer',
                          prefs.theme === 'obsidian'
                            ? 'bg-accent text-[var(--dd-accent-fg)]'
                            : 'text-foreground-secondary'
                        )}
                      >
                        <Moon className="h-2.5 w-2.5" />
                        <span>Dark</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTheme('alabaster')}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium cursor-pointer',
                          prefs.theme === 'alabaster'
                            ? 'bg-accent text-[var(--dd-accent-fg)]'
                            : 'text-foreground-secondary'
                        )}
                      >
                        <Sun className="h-2.5 w-2.5" />
                        <span>Light</span>
                      </button>
                    </div>
                  </div>

                  {/* Quick Tri-Color Swatches */}
                  <div className="flex items-center justify-between gap-1">
                    {Object.values(TRI_COLOR_PRESETS).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setPalettePreset(preset.id)}
                        title={preset.name}
                        className={cn(
                          'flex items-center gap-0.5 rounded-full border p-1 transition-transform cursor-pointer',
                          prefs.palettePreset === preset.id
                            ? 'border-accent scale-110 ring-1 ring-accent'
                            : 'border-border opacity-75 hover:opacity-100'
                        )}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: preset.dark.primary }}
                        />
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: preset.dark.secondary }}
                        />
                      </button>
                    ))}
                    <Link
                      href="/settings"
                      onClick={() => setQuickToolsOpen(false)}
                      className="text-[10px] font-mono text-accent hover:underline"
                    >
                      Studio →
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
