'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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

export interface ThemeEngineState {
  theme: BaseTheme;
  accent: AccentPreset;
  palettePreset: TriColorPresetId;
  customPalette: TriColorPalette;
  motionMode: MotionPreference;
  hapticsEnabled: boolean;
  density: UiDensity;
}

export const THEME_STORAGE_KEY = 'dd_oodle_workspace_v1';

export const DEFAULT_THEME_ENGINE_STATE: ThemeEngineState = {
  theme: 'obsidian',
  accent: 'cyan',
  palettePreset: 'volt_precision',
  customPalette: DEFAULT_CUSTOM_PALETTE,
  motionMode: 'fluid',
  hapticsEnabled: true,
  density: 'comfortable',
};

interface ThemeEngineContextValue {
  themeState: ThemeEngineState;
  hydrated: boolean;
  resolvedLightMode: boolean;
  activePalette: TriColorPalette;
  setTheme: (theme: BaseTheme) => void;
  setAccent: (accent: AccentPreset) => void;
  setPalettePreset: (preset: TriColorPresetId) => void;
  setCustomPalette: (palette: TriColorPalette) => void;
  setMotionMode: (mode: MotionPreference) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setDensity: (density: UiDensity) => void;
  resetThemeState: () => void;
}

const ThemeEngineContext = createContext<ThemeEngineContextValue | null>(null);

function readStoredThemeState(): ThemeEngineState {
  if (typeof window === 'undefined') return DEFAULT_THEME_ENGINE_STATE;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_THEME_ENGINE_STATE;
    const parsed = JSON.parse(raw) as Partial<ThemeEngineState>;
    return {
      theme: parsed.theme ?? DEFAULT_THEME_ENGINE_STATE.theme,
      accent: parsed.accent ?? DEFAULT_THEME_ENGINE_STATE.accent,
      palettePreset: parsed.palettePreset ?? DEFAULT_THEME_ENGINE_STATE.palettePreset,
      customPalette: {
        ...DEFAULT_CUSTOM_PALETTE,
        ...(parsed.customPalette ?? {}),
      },
      motionMode: parsed.motionMode ?? DEFAULT_THEME_ENGINE_STATE.motionMode,
      hapticsEnabled:
        typeof parsed.hapticsEnabled === 'boolean'
          ? parsed.hapticsEnabled
          : DEFAULT_THEME_ENGINE_STATE.hapticsEnabled,
      density: parsed.density ?? DEFAULT_THEME_ENGINE_STATE.density,
    };
  } catch {
    return DEFAULT_THEME_ENGINE_STATE;
  }
}

function mergeStoredThemePatch(state: ThemeEngineState) {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const merged = {
      ...existing,
      theme: state.theme,
      accent: state.accent,
      palettePreset: state.palettePreset,
      customPalette: state.customPalette,
      motionMode: state.motionMode,
      hapticsEnabled: state.hapticsEnabled,
      density: state.density,
    };
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent('ddoodle:theme-sync', { detail: state }));
  } catch {
    // Ignore storage restrictions
  }
}

export function ThemeEngineProvider({ children }: { children: React.ReactNode }) {
  const [themeState, setThemeState] = useState<ThemeEngineState>(DEFAULT_THEME_ENGINE_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [systemPrefersLight, setSystemPrefersLight] = useState(false);

  useEffect(() => {
    const media =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: light)')
        : null;

    const timer = window.setTimeout(() => {
      setThemeState(readStoredThemeState());
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

  useEffect(() => {
    setGlobalHapticsEnabled(themeState.hapticsEnabled);
    if (!hydrated) return;
    mergeStoredThemePatch(themeState);
  }, [themeState, hydrated]);

  const resolvedLightMode =
    themeState.theme === 'alabaster' ||
    (themeState.theme === 'system' && systemPrefersLight);

  const activePalette = useMemo(
    () =>
      resolveActivePalette(
        themeState.palettePreset,
        themeState.customPalette,
        resolvedLightMode
      ),
    [themeState.palettePreset, themeState.customPalette, resolvedLightMode]
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.dataset.theme = themeState.theme;
    root.dataset.accent = themeState.accent;
    root.dataset.palette = themeState.palettePreset;
    root.dataset.density = themeState.density;
    root.dataset.motion = themeState.motionMode;

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
  }, [themeState, activePalette, resolvedLightMode]);

  const setTheme = useCallback((theme: BaseTheme) => {
    setThemeState((prev) => ({ ...prev, theme }));
  }, []);

  const setAccent = useCallback((accent: AccentPreset) => {
    setThemeState((prev) => ({ ...prev, accent }));
  }, []);

  const setPalettePreset = useCallback((palettePreset: TriColorPresetId) => {
    setThemeState((prev) => ({ ...prev, palettePreset }));
  }, []);

  const setCustomPalette = useCallback((customPalette: TriColorPalette) => {
    setThemeState((prev) => ({ ...prev, palettePreset: 'custom', customPalette }));
  }, []);

  const setMotionMode = useCallback((motionMode: MotionPreference) => {
    setThemeState((prev) => ({ ...prev, motionMode }));
  }, []);

  const setHapticsEnabled = useCallback((hapticsEnabled: boolean) => {
    setThemeState((prev) => ({ ...prev, hapticsEnabled }));
  }, []);

  const setDensity = useCallback((density: UiDensity) => {
    setThemeState((prev) => ({ ...prev, density }));
  }, []);

  const resetThemeState = useCallback(() => {
    setThemeState(DEFAULT_THEME_ENGINE_STATE);
  }, []);

  const value = useMemo<ThemeEngineContextValue>(
    () => ({
      themeState,
      hydrated,
      resolvedLightMode,
      activePalette,
      setTheme,
      setAccent,
      setPalettePreset,
      setCustomPalette,
      setMotionMode,
      setHapticsEnabled,
      setDensity,
      resetThemeState,
    }),
    [
      themeState,
      hydrated,
      resolvedLightMode,
      activePalette,
      setTheme,
      setAccent,
      setPalettePreset,
      setCustomPalette,
      setMotionMode,
      setHapticsEnabled,
      setDensity,
      resetThemeState,
    ]
  );

  return <ThemeEngineContext.Provider value={value}>{children}</ThemeEngineContext.Provider>;
}

export function useThemeEngine() {
  const ctx = useContext(ThemeEngineContext);
  if (!ctx) {
    throw new Error('useThemeEngine must be used within a ThemeEngineProvider');
  }
  return ctx;
}
