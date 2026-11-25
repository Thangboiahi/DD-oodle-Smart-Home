'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Car,
  Cpu,
  CreditCard,
  ExternalLink,
  Home,
  KeyRound,
  LayoutGrid,
  Moon,
  Palette,
  Play,
  PlusCircle,
  Search,
  Settings,
  Sliders,
  Sparkles,
  Store,
  Sun,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  countVisibleWidgetsInSubtree,
  flattenContainersWithMeta,
  getDisplayTitle,
} from '@/lib/layout/tree';
import { LAN_TRANSPORT } from '@/lib/protocol/transports';
import { simulatorEngine } from '@/lib/simulator/engine';
import { useWorkspace } from '@/components/workspace/WorkspaceProvider';
import { EmptyState } from './EmptyState';

interface CommandItem {
  id: string;
  group: 'Navigation' | 'Rooms' | 'Devices' | 'Quick Actions' | 'Workspace';
  label: string;
  subtitle?: string;
  icon: React.ReactNode;
  shortcut?: string;
  onSelect: () => void;
}

function fuzzyMatch(text: string, query: string): boolean {
  const hay = text.toLowerCase();
  const needle = query.toLowerCase().trim();
  if (!needle) return true;
  if (hay.includes(needle)) return true;
  // Subsequence fuzzy match
  let ni = 0;
  for (let hi = 0; hi < hay.length && ni < needle.length; hi++) {
    if (hay[hi] === needle[ni]) ni++;
  }
  return ni === needle.length;
}

export const CommandPalette: React.FC = () => {
  const router = useRouter();
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    snapshot,
    prefs,
    setTheme,
    setPalettePreset,
    setDensity,
    setEditLayoutMode,
  } = useWorkspace();

  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);

  const closeAnd = (fn: () => void) => () => {
    setCommandPaletteOpen(false);
    setQuery('');
    fn();
  };

  const pwr01 = snapshot.devices['dd_pwr01_a1b2c3'];
  const livingLightOn = Boolean(pwr01?.state.state.ch1);

  const items: CommandItem[] = [
    // Navigation Routes
    {
      id: 'nav-home',
      group: 'Navigation',
      label: 'Home Dashboard',
      subtitle: 'Rooms, Universal Layout Studio & 3D Twin',
      icon: <Home className="h-4 w-4" />,
      shortcut: 'G H',
      onSelect: closeAnd(() => router.push('/console')),
    },
    {
      id: 'nav-vehicles',
      group: 'Navigation',
      label: 'Vehicles & Safety',
      subtitle: 'Live MapLibre GPS, Crash SOS & Immobilizer',
      icon: <Car className="h-4 w-4" />,
      shortcut: 'G V',
      onSelect: closeAnd(() => router.push('/console/vehicles')),
    },
    {
      id: 'nav-automations',
      group: 'Navigation',
      label: 'Automations',
      subtitle: '1-Tap Indian Recipes & G17 Pro Logic',
      icon: <Sparkles className="h-4 w-4" />,
      shortcut: 'G A',
      onSelect: closeAnd(() => router.push('/console/automations')),
    },
    {
      id: 'nav-setup',
      group: 'Navigation',
      label: 'Device Setup Wizard',
      subtitle: 'QR / SoftAP 192.168.4.1 / Direct BLE',
      icon: <PlusCircle className="h-4 w-4" />,
      onSelect: closeAnd(() => router.push('/console/setup')),
    },
    {
      id: 'nav-billing',
      group: 'Navigation',
      label: 'Billing & Core Floor',
      subtitle: '90-Day Trial, UPI Renewal & Anti-Bricking Floor',
      icon: <CreditCard className="h-4 w-4" />,
      onSelect: closeAnd(() => router.push('/console/billing')),
    },
    {
      id: 'nav-settings',
      group: 'Navigation',
      label: 'Settings & Tri-Color Studio',
      subtitle: 'Themes, Haptics, Family Roles & Voice C2C',
      icon: <Settings className="h-4 w-4" />,
      onSelect: closeAnd(() => router.push('/console/settings')),
    },
    {
      id: 'nav-store-showcase',
      group: 'Navigation',
      label: 'Explore Store & Live Demos',
      subtitle: 'Interactive module sandboxes & WhatsApp Quote Shop',
      icon: <Store className="h-4 w-4" />,
      onSelect: closeAnd(() => router.push('/?showcase=1')),
    },
    {
      id: 'nav-auth',
      group: 'Navigation',
      label: 'Sign In / Switch Account',
      subtitle: 'Phone OTP (+91) & Email/Google Auth',
      icon: <KeyRound className="h-4 w-4" />,
      onSelect: closeAnd(() => router.push('/auth')),
    },

    // Rooms & Nested Containers from layout_tree
    ...flattenContainersWithMeta(prefs.layout2D.layout_tree, prefs.layout2D.customTitles)
      .filter(({ container }) => !prefs.layout2D.hiddenContainers.includes(container.id))
      .map(({ container, pathLabel }) => ({
        id: `room-${container.id}`,
        group: 'Rooms' as const,
        label: pathLabel,
        subtitle: `${countVisibleWidgetsInSubtree(
          container,
          prefs.layout2D.hiddenItems,
          prefs.layout2D.hiddenContainers
        )} widgets/modules · ${container.kind.toUpperCase()}`,
        icon: <LayoutGrid className="h-4 w-4" />,
        onSelect: closeAnd(() => router.push('/console')),
      })),

    // Quick Inline Hardware & Scene Actions
    {
      id: 'act-toggle-living-ch1',
      group: 'Quick Actions',
      label: livingLightOn ? 'Turn OFF Living Room Light (Ch1)' : 'Turn ON Living Room Light (Ch1)',
      subtitle: 'Inline command · dd_pwr01_a1b2c3',
      icon: <Zap className="h-4 w-4" />,
      onSelect: closeAnd(() =>
        simulatorEngine.sendCommand('dd_pwr01_a1b2c3', { ch1: !livingLightOn }, 'pwa_cloud')
      ),
    },
    {
      id: 'act-scene-inverter',
      group: 'Quick Actions',
      label: 'Run Scene: Inverter Saver (Cut Geyser)',
      subtitle: 'Deterministic local rule trigger',
      icon: <Play className="h-4 w-4" />,
      onSelect: closeAnd(() =>
        simulatorEngine.sendCommand('dd_pwr03_g7h8i9', { ch1: false }, 'rule')
      ),
    },
    {
      id: 'act-scene-tank',
      group: 'Quick Actions',
      label: 'Run Scene: Fill Overhead Tank (WAT-01)',
      subtitle: 'Dry-run guard active',
      icon: <Play className="h-4 w-4" />,
      onSelect: closeAnd(() =>
        simulatorEngine.sendCommand('dd_wat01_j1k2l3', { pump_on: true }, 'rule')
      ),
    },
    {
      id: 'act-local-port80',
      group: 'Quick Actions',
      label: 'Open Local Control (Hub Port 80)',
      subtitle: LAN_TRANSPORT.HUB_LOCAL_URL,
      icon: <ExternalLink className="h-4 w-4" />,
      onSelect: closeAnd(() => {
        if (typeof window !== 'undefined') {
          window.open(LAN_TRANSPORT.HUB_LOCAL_URL, '_blank', 'noreferrer');
        }
      }),
    },

    // Devices
    ...Object.values(snapshot.devices).map((dev) => ({
      id: `dev-${dev.device_id}`,
      group: 'Devices' as const,
      label: getDisplayTitle(prefs.layout2D.customTitles, dev.device_id, dev.name),
      subtitle: `${dev.module_code} · ${dev.device_id} · ${dev.state.rssi} dBm`,
      icon: <Cpu className="h-4 w-4" />,
      onSelect: closeAnd(() =>
        router.push(
          dev.module_code === 'VEH-01'
            ? `/console/vehicles/${dev.device_id}`
            : `/console/devices/${dev.device_id}`
        )
      ),
    })),

    // Workspace & Tri-Color Presets
    {
      id: 'ws-edit-layout',
      group: 'Workspace',
      label: 'Toggle Customize Layout / Edit Mode',
      subtitle: 'Cross-room & cross-container drag-and-drop',
      icon: <LayoutGrid className="h-4 w-4" />,
      shortcut: 'E',
      onSelect: closeAnd(() => {
        setEditLayoutMode((e) => !e);
        router.push('/console');
      }),
    },
    {
      id: 'preset-volt',
      group: 'Workspace',
      label: 'Palette: Volt Precision',
      icon: <Palette className="h-4 w-4" />,
      onSelect: closeAnd(() => setPalettePreset('volt_precision')),
    },
    {
      id: 'preset-solar',
      group: 'Workspace',
      label: 'Palette: Solar Obsidian',
      icon: <Palette className="h-4 w-4" />,
      onSelect: closeAnd(() => setPalettePreset('solar_obsidian')),
    },
    {
      id: 'preset-bio',
      group: 'Workspace',
      label: 'Palette: Bio Circuit',
      icon: <Palette className="h-4 w-4" />,
      onSelect: closeAnd(() => setPalettePreset('bio_circuit')),
    },
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

  const filtered = query.trim()
    ? items.filter((item) =>
        fuzzyMatch(`${item.group} ${item.label} ${item.subtitle ?? ''}`, query)
      )
    : items;

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
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-xs p-4 pt-[10vh]"
      onMouseDown={() => setCommandPaletteOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick Jump Command Palette"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-[var(--dd-radius-card)] border border-border-strong bg-surface shadow-2xl overflow-hidden"
      >
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
            placeholder="Fuzzy search rooms, 42+ modules, scenes, presets, or /admin..."
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

        <div className="max-h-[56vh] overflow-y-auto p-2 dd-scroll">
          {filtered.length === 0 ? (
            <EmptyState
              compact
              icon={<Search className="h-4 w-4" />}
              title="No matching results"
              description={`Nothing matched "${query}". Try a module code (PWR-01, WAT-01), room, or route.`}
            />
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
                    'w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors cursor-pointer',
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
          <span>↑↓ Navigate · ↵ Run · Esc Close</span>
          <span>DD oodle v1.4</span>
        </div>
      </div>
    </div>
  );
};
