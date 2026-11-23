'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { simulatorEngine } from '@/lib/simulator/engine';
import { SimulatorSnapshot } from '@/lib/simulator/types';
import {
  buildTriColorCssVars,
  DEFAULT_CUSTOM_PALETTE,
  MotionPreference,
  resolveActivePalette,
  TriColorPalette,
  TriColorPresetId,
} from '@/components/theme/triColor';
import { setGlobalHapticsEnabled } from '@/components/ui/haptics';

export type BaseTheme = 'obsidian' | 'alabaster' | 'system';
export type AccentPreset = 'cyan' | 'emerald' | 'amber' | 'steel';
export type UiDensity = 'comfortable' | 'compact';
export type WidgetSize = 'compact' | 'standard' | 'wide' | 'tall';
export type LayoutItemSize = 'S' | 'M' | 'L' | 'Full';
export type DockPosition = 'left' | 'right' | 'bottom' | 'float';

export interface LayoutContainer {
  id: string;
  title: string;
  kind: 'room' | 'custom';
  roomId?: string;
  itemIds: string[];
}

export interface Layout2DGraph {
  containers: LayoutContainer[];
  itemSizes: Record<string, LayoutItemSize>;
  hiddenItems: string[];
  deviceRoomOverrides: Record<string, string>;
}

export interface DockPanelState {
  open: boolean;
  position: DockPosition;
  collapsed: boolean;
  fullscreen: boolean;
  width: number;
  height: number;
  floatX: number;
  floatY: number;
}

export interface HomeSummary {
  id: string;
  name: string;
  location: string;
  hubStatus: 'online' | 'local';
}

export interface WorkspacePreferences {
  theme: BaseTheme;
  accent: AccentPreset;
  palettePreset: TriColorPresetId;
  customPalette: TriColorPalette;
  motionMode: MotionPreference;
  hapticsEnabled: boolean;
  density: UiDensity;
  sidebarCollapsed: boolean;
  activeHomeId: string;
  tariffInr: number;
  eco2DDefault: boolean;
  scrollbarAlwaysVisible: boolean;
  hubEnabled: boolean;
  hubIp: string;
  userRole: 'OWNER' | 'MEMBER';
  collapsedSections: Record<string, boolean>;
  widgetSizes: Record<string, WidgetSize>;
  orderMaps: Record<string, string[]>;
  dockPanels: Record<string, DockPanelState>;
  splitSizes: Record<string, number>;
  layout2D: Layout2DGraph;
}

const STORAGE_KEY = 'dd_oodle_workspace_v1';

const CRITICAL_ALERT_CODES = new Set<string>([
  'CRASH_DETECTED',
  'GAS_LEAK',
  'SMOKE_FIRE',
  'FALL_DETECTED',
  'PANIC_SOS',
  'SOS_MANUAL',
]);

export const DEFAULT_LAYOUT_2D: Layout2DGraph = {
  containers: [
    {
      id: 'zone_monitors',
      title: 'Telemetry & Quick Scenes',
      kind: 'custom',
      itemIds: ['mon_energy', 'mon_water', 'mon_hub', 'mon_vehicle', 'mon_scenes'],
    },
    {
      id: 'room_living',
      title: 'Living Room',
      kind: 'room',
      roomId: 'room_living',
      itemIds: ['dd_pwr01_a1b2c3', 'dd_hub01_u7v8w9'],
    },
    {
      id: 'room_bedroom',
      title: 'Master Bedroom',
      kind: 'room',
      roomId: 'room_bedroom',
      itemIds: ['dd_pwr02_d4e5f6'],
    },
    {
      id: 'room_bath',
      title: 'Master Bath',
      kind: 'room',
      roomId: 'room_bath',
      itemIds: ['dd_pwr03_g7h8i9'],
    },
    {
      id: 'room_terrace',
      title: 'Terrace & Tank',
      kind: 'room',
      roomId: 'room_terrace',
      itemIds: ['dd_wat01_j1k2l3'],
    },
    {
      id: 'room_garage',
      title: 'Garage & Vehicle',
      kind: 'room',
      roomId: 'room_garage',
      itemIds: ['dd_veh01_m4n5p6'],
    },
  ],
  itemSizes: {
    mon_scenes: 'Full',
  },
  hiddenItems: ['mon_faults', 'mon_analytics'],
  deviceRoomOverrides: {},
};

export const DEFAULT_HOMES: HomeSummary[] = [
  {
    id: 'home_imphal_001',
    name: 'Imphal Residence',
    location: 'Manipur · IST',
    hubStatus: 'online',
  },
  {
    id: 'home_guwahati_002',
    name: 'Guwahati Studio',
    location: 'Assam · Standby',
    hubStatus: 'local',
  },
];

export const DEFAULT_PREFERENCES: WorkspacePreferences = {
  theme: 'obsidian',
  accent: 'cyan',
  palettePreset: 'volt_precision',
  customPalette: DEFAULT_CUSTOM_PALETTE,
  motionMode: 'fluid',
  hapticsEnabled: true,
  density: 'comfortable',
  sidebarCollapsed: false,
  activeHomeId: 'home_imphal_001',
  tariffInr: 7.5,
  eco2DDefault: false,
  scrollbarAlwaysVisible: false,
  hubEnabled: true,
  hubIp: '192.168.1.50',
  userRole: 'OWNER',
  collapsedSections: {},
  widgetSizes: {},
  orderMaps: {},
  dockPanels: {},
  splitSizes: {},
  layout2D: DEFAULT_LAYOUT_2D,
};

interface WorkspaceContextValue {
  prefs: WorkspacePreferences;
  hydrated: boolean;
  resolvedLightMode: boolean;
  activePalette: TriColorPalette;
  snapshot: SimulatorSnapshot;
  lastSyncTs: number;
  editLayoutMode: boolean;
  setEditLayoutMode: React.Dispatch<React.SetStateAction<boolean>>;
  homes: HomeSummary[];
  activeHome: HomeSummary;
  isLifeSafetyActive: boolean;
  lifeSafetyReason: string | null;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  setTheme: (theme: BaseTheme) => void;
  setAccent: (accent: AccentPreset) => void;
  setPalettePreset: (preset: TriColorPresetId) => void;
  setCustomPalette: (palette: TriColorPalette) => void;
  setMotionMode: (mode: MotionPreference) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setDensity: (density: UiDensity) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setActiveHomeId: (homeId: string) => void;
  updateWorkspacePrefs: (patch: Partial<WorkspacePreferences>) => void;
  setLayout2D: (next: Layout2DGraph) => void;
  resetLayout2D: () => void;
  toggleSectionCollapsed: (sectionId: string, defaultCollapsed?: boolean) => void;
  isSectionCollapsed: (sectionId: string, defaultCollapsed?: boolean) => boolean;
  setWidgetSize: (widgetId: string, size: WidgetSize) => void;
  getWidgetSize: (widgetId: string, fallback?: WidgetSize) => WidgetSize;
  setOrderList: (listId: string, order: string[]) => void;
  getOrderList: (listId: string) => string[] | undefined;
  setDockPanelState: (panelId: string, patch: Partial<DockPanelState>) => void;
  getDockPanelState: (panelId: string, defaults?: Partial<DockPanelState>) => DockPanelState;
  setSplitSize: (splitId: string, size: number) => void;
  getSplitSize: (splitId: string, fallback: number) => number;
  resetWorkspacePreferences: () => void;
}

const DEFAULT_DOCK_STATE: DockPanelState = {
  open: false,
  position: 'right',
  collapsed: false,
  fullscreen: false,
  width: 380,
  height: 300,
  floatX: 80,
  floatY: 88,
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function loadStoredPreferences(): WorkspacePreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<WorkspacePreferences>;
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      customPalette: {
        ...DEFAULT_CUSTOM_PALETTE,
        ...(parsed.customPalette ?? {}),
      },
      layout2D: parsed.layout2D?.containers?.length
        ? {
            ...DEFAULT_LAYOUT_2D,
            ...parsed.layout2D,
            itemSizes: { ...DEFAULT_LAYOUT_2D.itemSizes, ...(parsed.layout2D.itemSizes ?? {}) },
            hiddenItems: parsed.layout2D.hiddenItems ?? DEFAULT_LAYOUT_2D.hiddenItems,
            deviceRoomOverrides: parsed.layout2D.deviceRoomOverrides ?? {},
          }
        : DEFAULT_LAYOUT_2D,
      collapsedSections: { ...DEFAULT_PREFERENCES.collapsedSections, ...(parsed.collapsedSections ?? {}) },
      widgetSizes: { ...DEFAULT_PREFERENCES.widgetSizes, ...(parsed.widgetSizes ?? {}) },
      orderMaps: { ...DEFAULT_PREFERENCES.orderMaps, ...(parsed.orderMaps ?? {}) },
      dockPanels: { ...DEFAULT_PREFERENCES.dockPanels, ...(parsed.dockPanels ?? {}) },
      splitSizes: { ...DEFAULT_PREFERENCES.splitSizes, ...(parsed.splitSizes ?? {}) },
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function computeLifeSafetyStatus(snapshot: SimulatorSnapshot): {
  isLifeSafetyActive: boolean;
  lifeSafetyReason: string | null;
} {
  if (
    snapshot.activeCrashSos &&
    (snapshot.activeCrashSos.status === 'countdown' || snapshot.activeCrashSos.status === 'escalated')
  ) {
    return {
      isLifeSafetyActive: true,
      lifeSafetyReason: `CRASH_DETECTED · ${snapshot.activeCrashSos.device_id}`,
    };
  }

  for (const dev of Object.values(snapshot.devices)) {
    const alertType = dev.last_alert?.type;
    const severity = dev.last_alert?.severity;
    if (alertType && (CRITICAL_ALERT_CODES.has(alertType) || severity === 'CRITICAL')) {
      if (dev.state.fault || CRITICAL_ALERT_CODES.has(alertType)) {
        return {
          isLifeSafetyActive: true,
          lifeSafetyReason: `${alertType} · ${dev.name}`,
        };
      }
    }
  }

  return { isLifeSafetyActive: false, lifeSafetyReason: null };
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<WorkspacePreferences>(DEFAULT_PREFERENCES);
  const [hydrated, setHydrated] = useState(false);
  const [systemPrefersLight, setSystemPrefersLight] = useState(false);
  const [snapshot, setSnapshot] = useState<SimulatorSnapshot>(() => simulatorEngine.getSnapshot());
  const [lastSyncTs, setLastSyncTs] = useState<number>(() => Date.now());
  const [editLayoutMode, setEditLayoutMode] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Hydrate persisted preferences & system color-scheme listener asynchronously on mount
  useEffect(() => {
    const media =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: light)')
        : null;

    const timer = window.setTimeout(() => {
      setPrefs(loadStoredPreferences());
      if (media) setSystemPrefersLight(media.matches);
      setHydrated(true);
    }, 0);

    const onMediaChange = (ev: MediaQueryListEvent) => setSystemPrefersLight(ev.matches);
    media?.addEventListener('change', onMediaChange);

    return () => {
      window.clearTimeout(timer);
      media?.removeEventListener('change', onMediaChange);
    };
  }, []);

  // Subscribe to simulator engine globally across all routes
  useEffect(() => {
    simulatorEngine.start(1000);
    const unsubscribe = simulatorEngine.subscribe((nextSnap) => {
      setSnapshot(nextSnap);
      setLastSyncTs(Date.now());
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Persist non-sensitive UI preferences to localStorage (and dispatch settings sync event)
  useEffect(() => {
    setGlobalHapticsEnabled(prefs.hapticsEnabled);
    if (!hydrated || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
      window.dispatchEvent(new CustomEvent('ddoodle:prefs-sync', { detail: prefs }));
    } catch {
      // Ignore quota errors in restricted browsing modes
    }
  }, [prefs, hydrated]);

  // Detect active life-safety critical conditions across all devices & crash SOS
  const { isLifeSafetyActive, lifeSafetyReason } = computeLifeSafetyStatus(snapshot);
  const resolvedLightMode =
    prefs.theme === 'alabaster' || (prefs.theme === 'system' && systemPrefersLight);
  const activePalette = resolveActivePalette(
    prefs.palettePreset,
    prefs.customPalette,
    resolvedLightMode
  );

  // Apply theme, tri-color palette, density, motion, and <meta name="theme-color">
  // Phase 8 rule: NEVER override the full viewport with red during alerts; FloatingEmergencyAlert handles alert surfacing cleanly.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.dataset.theme = prefs.theme;
    root.dataset.accent = prefs.accent;
    root.dataset.palette = prefs.palettePreset;
    root.dataset.density = prefs.density;
    root.dataset.motion = prefs.motionMode;

    delete root.dataset.lifeSafety;
    root.classList.remove('life-safety-override');

    const cssVars = buildTriColorCssVars(activePalette, resolvedLightMode);
    for (const [key, val] of Object.entries(cssVars)) {
      root.style.setProperty(key, val);
    }

    const themeColor = resolvedLightMode ? '#f4f6f9' : '#090b0f';
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = themeColor;
  }, [
    prefs.theme,
    prefs.accent,
    prefs.palettePreset,
    prefs.density,
    prefs.motionMode,
    activePalette,
    resolvedLightMode,
  ]);

  // Global Cmd/Ctrl+K shortcut for Command Palette
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const setTheme = useCallback((theme: BaseTheme) => {
    setPrefs((prev) => ({ ...prev, theme }));
  }, []);

  const setAccent = useCallback((accent: AccentPreset) => {
    setPrefs((prev) => ({ ...prev, accent }));
  }, []);

  const setPalettePreset = useCallback((palettePreset: TriColorPresetId) => {
    setPrefs((prev) => ({ ...prev, palettePreset }));
  }, []);

  const setCustomPalette = useCallback((customPalette: TriColorPalette) => {
    setPrefs((prev) => ({ ...prev, palettePreset: 'custom', customPalette }));
  }, []);

  const setMotionMode = useCallback((motionMode: MotionPreference) => {
    setPrefs((prev) => ({ ...prev, motionMode }));
  }, []);

  const setHapticsEnabled = useCallback((hapticsEnabled: boolean) => {
    setPrefs((prev) => ({ ...prev, hapticsEnabled }));
  }, []);

  const setDensity = useCallback((density: UiDensity) => {
    setPrefs((prev) => ({ ...prev, density }));
  }, []);

  const setSidebarCollapsed = useCallback((sidebarCollapsed: boolean) => {
    setPrefs((prev) => ({ ...prev, sidebarCollapsed }));
  }, []);

  const setActiveHomeId = useCallback((activeHomeId: string) => {
    setPrefs((prev) => ({ ...prev, activeHomeId }));
  }, []);

  const updateWorkspacePrefs = useCallback((patch: Partial<WorkspacePreferences>) => {
    setPrefs((prev) => ({ ...prev, ...patch }));
  }, []);

  const setLayout2D = useCallback((layout2D: Layout2DGraph) => {
    setPrefs((prev) => ({ ...prev, layout2D }));
  }, []);

  const resetLayout2D = useCallback(() => {
    setPrefs((prev) => ({ ...prev, layout2D: DEFAULT_LAYOUT_2D }));
  }, []);

  const toggleSectionCollapsed = useCallback((sectionId: string, defaultCollapsed = false) => {
    setPrefs((prev) => {
      const current = prev.collapsedSections[sectionId] ?? defaultCollapsed;
      return {
        ...prev,
        collapsedSections: {
          ...prev.collapsedSections,
          [sectionId]: !current,
        },
      };
    });
  }, []);

  const isSectionCollapsed = useCallback(
    (sectionId: string, defaultCollapsed = false) => {
      return prefs.collapsedSections[sectionId] ?? defaultCollapsed;
    },
    [prefs.collapsedSections]
  );

  const setWidgetSize = useCallback((widgetId: string, size: WidgetSize) => {
    setPrefs((prev) => ({
      ...prev,
      widgetSizes: {
        ...prev.widgetSizes,
        [widgetId]: size,
      },
    }));
  }, []);

  const getWidgetSize = useCallback(
    (widgetId: string, fallback: WidgetSize = 'standard'): WidgetSize => {
      return prefs.widgetSizes[widgetId] ?? fallback;
    },
    [prefs.widgetSizes]
  );

  const setOrderList = useCallback((listId: string, order: string[]) => {
    setPrefs((prev) => ({
      ...prev,
      orderMaps: {
        ...prev.orderMaps,
        [listId]: order,
      },
    }));
  }, []);

  const getOrderList = useCallback(
    (listId: string) => {
      return prefs.orderMaps[listId];
    },
    [prefs.orderMaps]
  );

  const setDockPanelState = useCallback((panelId: string, patch: Partial<DockPanelState>) => {
    setPrefs((prev) => {
      const existing = prev.dockPanels[panelId] ?? DEFAULT_DOCK_STATE;
      return {
        ...prev,
        dockPanels: {
          ...prev.dockPanels,
          [panelId]: { ...existing, ...patch },
        },
      };
    });
  }, []);

  const getDockPanelState = useCallback(
    (panelId: string, defaults?: Partial<DockPanelState>): DockPanelState => {
      return {
        ...DEFAULT_DOCK_STATE,
        ...(defaults ?? {}),
        ...(prefs.dockPanels[panelId] ?? {}),
      };
    },
    [prefs.dockPanels]
  );

  const setSplitSize = useCallback((splitId: string, size: number) => {
    setPrefs((prev) => ({
      ...prev,
      splitSizes: {
        ...prev.splitSizes,
        [splitId]: size,
      },
    }));
  }, []);

  const getSplitSize = useCallback(
    (splitId: string, fallback: number) => {
      return prefs.splitSizes[splitId] ?? fallback;
    },
    [prefs.splitSizes]
  );

  const resetWorkspacePreferences = useCallback(() => {
    setPrefs(DEFAULT_PREFERENCES);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // noop
      }
    }
  }, []);

  const activeHome = useMemo(
    () => DEFAULT_HOMES.find((h) => h.id === prefs.activeHomeId) ?? DEFAULT_HOMES[0],
    [prefs.activeHomeId]
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      prefs,
      hydrated,
      resolvedLightMode,
      activePalette,
      snapshot,
      lastSyncTs,
      editLayoutMode,
      setEditLayoutMode,
      homes: DEFAULT_HOMES,
      activeHome,
      isLifeSafetyActive,
      lifeSafetyReason,
      commandPaletteOpen,
      setCommandPaletteOpen,
      setTheme,
      setAccent,
      setPalettePreset,
      setCustomPalette,
      setMotionMode,
      setHapticsEnabled,
      setDensity,
      setSidebarCollapsed,
      setActiveHomeId,
      updateWorkspacePrefs,
      setLayout2D,
      resetLayout2D,
      toggleSectionCollapsed,
      isSectionCollapsed,
      setWidgetSize,
      getWidgetSize,
      setOrderList,
      getOrderList,
      setDockPanelState,
      getDockPanelState,
      setSplitSize,
      getSplitSize,
      resetWorkspacePreferences,
    }),
    [
      prefs,
      hydrated,
      resolvedLightMode,
      activePalette,
      snapshot,
      lastSyncTs,
      editLayoutMode,
      activeHome,
      isLifeSafetyActive,
      lifeSafetyReason,
      commandPaletteOpen,
      setCommandPaletteOpen,
      setTheme,
      setAccent,
      setPalettePreset,
      setCustomPalette,
      setMotionMode,
      setHapticsEnabled,
      setDensity,
      setSidebarCollapsed,
      setActiveHomeId,
      updateWorkspacePrefs,
      setLayout2D,
      resetLayout2D,
      toggleSectionCollapsed,
      isSectionCollapsed,
      setWidgetSize,
      getWidgetSize,
      setOrderList,
      getOrderList,
      setDockPanelState,
      getDockPanelState,
      setSplitSize,
      getSplitSize,
      resetWorkspacePreferences,
    ]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return ctx;
}
