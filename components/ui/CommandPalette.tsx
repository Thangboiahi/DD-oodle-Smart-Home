'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Car,
  Cpu,
  CreditCard,
  Home,
  KeyRound,
  Moon,
  PlusCircle,
  Search,
  Settings,
  Sliders,
  Sparkles,
  Sun,
  Wrench,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/components/workspace/WorkspaceProvider';

interface CommandItem {
  id: string;
  group: 'Navigation' | 'Devices' | 'Workspace';
  label: string;
  subtitle?: string;
  icon: React.ReactNode;
  shortcut?: string;
  onSelect: () => void;
}

export const CommandPalette: React.FC = () => {
  const router = useRouter();
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    snapshot,
    prefs,
    setTheme,
    setDensity,
  } = useWorkspace();

  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);

  const items = useMemo<CommandItem[]>(() => {
    const closeAnd = (fn: () => void) => () => {
      setCommandPaletteOpen(false);
      setQuery('');
      fn();
    };

    const navItems: CommandItem[] = [
      {
        id: 'nav-home',
        group: 'Navigation',
        label: 'Home Dashboard',
        subtitle: 'Rooms, 3D Twin & live telemetry',
        icon: <Home className="h-4 w-4" />,
        shortcut: 'G H',
        onSelect: closeAnd(() => router.push('/')),
      },
      {
        id: 'nav-vehicles',
        group: 'Navigation',
        label: 'Vehicles & Safety',
        subtitle: 'Live GPS, Crash SOS & Immobilizer',
        icon: <Car className="h-4 w-4" />,
        shortcut: 'G V',
        onSelect: closeAnd(() => router.push('/vehicles')),
      },
      {
        id: 'nav-automations',
        group: 'Navigation',
        label: 'Automations',
        subtitle: 'Hybrid Recipes & Pro Logic Rules',
        icon: <Sparkles className="h-4 w-4" />,
        shortcut: 'G A',
        onSelect: closeAnd(() => router.push('/automations')),
      },
      {
        id: 'nav-setup',
        group: 'Navigation',
        label: 'Device Provisioning Wizard',
        subtitle: 'QR / SoftAP 192.168.4.1 / BLE Setup',
        icon: <PlusCircle className="h-4 w-4" />,
        onSelect: closeAnd(() => router.push('/setup')),
      },
      {
        id: 'nav-billing',
        group: 'Navigation',
        label: 'Billing & Core Floor',
        subtitle: '90-Day Trial, UPI Renewal & Anti-Bricking Floor',
        icon: <CreditCard className="h-4 w-4" />,
        onSelect: closeAnd(() => router.push('/billing')),
      },
      {
        id: 'nav-settings',
        group: 'Navigation',
        label: 'Settings & Workspace',
        subtitle: 'Theme, Density, Family Roles & Voice C2C',
        icon: <Settings className="h-4 w-4" />,
        onSelect: closeAnd(() => router.push('/settings')),
      },
      {
        id: 'nav-admin',
        group: 'Navigation',
        label: 'Installer & Business Portal',
        subtitle: 'Fleet health, diagnostics & SLA',
        icon: <Wrench className="h-4 w-4" />,
        onSelect: closeAnd(() => router.push('/admin')),
      },
      {
        id: 'nav-auth',
        group: 'Navigation',
        label: 'Sign In / Switch Account',
        subtitle: 'Phone OTP & Email/Google Auth',
        icon: <KeyRound className="h-4 w-4" />,
        onSelect: closeAnd(() => router.push('/auth')),
      },
    ];

    const deviceItems: CommandItem[] = Object.values(snapshot.devices).map((dev) => ({
      id: `dev-${dev.device_id}`,
      group: 'Devices',
      label: dev.name,
      subtitle: `${dev.module_code} · ${dev.device_id}`,
      icon: <Cpu className="h-4 w-4" />,
      onSelect: closeAnd(() =>
        router.push(
          dev.module_code === 'VEH-01'
            ? `/vehicles/${dev.device_id}`
            : `/devices/${dev.device_id}`
        )
      ),
    }));

    const workspaceItems: CommandItem[] = [
      {
        id: 'theme-obsidian',
        group: 'Workspace',
        label: 'Theme: Obsidian Slate (Dark)',
        icon: <Moon className="h-4 w-4" />,
        onSelect: closeAnd(() => setTheme('obsidian')),
      },
      {
        id: 'theme-alabaster',
        group: 'Workspace',
        label: 'Theme: Alabaster Daylight (Light)',
        icon: <Sun className="h-4 w-4" />,
        onSelect: closeAnd(() => setTheme('alabaster')),
      },
      {
        id: 'density-toggle',
        group: 'Workspace',
        label:
          prefs.density === 'compact'
            ? 'Switch to Comfortable Density'
            : 'Switch to Compact Density',
        icon: <Sliders className="h-4 w-4" />,
        onSelect: closeAnd(() =>
          setDensity(prefs.density === 'compact' ? 'comfortable' : 'compact')
        ),
      },
    ];

    return [...navItems, ...deviceItems, ...workspaceItems];
  }, [router, snapshot.devices, prefs.density, setTheme, setDensity, setCommandPaletteOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
        item.group.toLowerCase().includes(q)
    );
  }, [items, query]);

  const safeActiveIdx = filtered.length ? Math.min(activeIdx, filtered.length - 1) : 0;

  useEffect(() => {
    if (!commandPaletteOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((idx) => (filtered.length ? (idx + 1) % filtered.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((idx) => (filtered.length ? (idx - 1 + filtered.length) % filtered.length : 0));
      } else if (e.key === 'Enter' && filtered[safeActiveIdx]) {
        e.preventDefault();
        filtered[safeActiveIdx].onSelect();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commandPaletteOpen, filtered, safeActiveIdx, setCommandPaletteOpen]);

  if (!commandPaletteOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-xs p-4 pt-[12vh]"
      onMouseDown={() => setCommandPaletteOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick Jump Command Palette"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-[var(--dd-radius-card)] border border-border-strong bg-surface shadow-2xl overflow-hidden"
      >
        {/* Search Input */}
        <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-3 bg-surface-elevated">
          <Search className="h-4 w-4 text-foreground-muted shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            placeholder="Jump to route, device, theme, or action..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground-muted focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-foreground-muted">
            ESC
          </kbd>
          <button
            type="button"
            aria-label="Close command palette"
            onClick={() => setCommandPaletteOpen(false)}
            className="rounded p-1 text-foreground-muted hover:text-foreground sm:hidden cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[55vh] overflow-y-auto p-1.5 dd-scroll">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-xs text-foreground-muted">
              No matching routes, devices, or commands.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const active = idx === safeActiveIdx;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={item.onSelect}
                  className={cn(
                    'w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors cursor-pointer',
                    active
                      ? 'bg-accent-soft text-foreground border border-accent-border'
                      : 'text-foreground-secondary hover:bg-surface-muted border border-transparent'
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={cn('shrink-0', active ? 'text-accent' : 'text-foreground-muted')}>
                      {item.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-foreground truncate">{item.label}</div>
                      {item.subtitle && (
                        <div className="text-[11px] text-foreground-muted truncate font-mono">
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-foreground-muted">
                      {item.group}
                    </span>
                    {item.shortcut && (
                      <kbd className="hidden sm:inline-flex rounded border border-border bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] text-foreground-muted">
                        {item.shortcut}
                      </kbd>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-surface-elevated px-3.5 py-2 text-[10px] font-mono text-foreground-muted">
          <span>↑↓ Navigate · ↵ Open · Esc Close</span>
          <span>DD oodle v1.4</span>
        </div>
      </div>
    </div>
  );
};
