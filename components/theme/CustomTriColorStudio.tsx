'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Check,
  Monitor,
  Moon,
  Palette,
  Power,
  ShieldCheck,
  Sliders,
  Sun,
} from 'lucide-react';
import {
  TRI_COLOR_PRESETS,
  TriColorPalette,
  TriColorPresetId,
  evaluatePaletteContrast,
  isValidHex,
  normalizeHex,
} from './triColor';
import { useWorkspace, BaseTheme } from '@/components/workspace/WorkspaceProvider';
import { Badge, Button, SegmentedControl } from '@/components/ui';
import { cn } from '@/lib/utils';

const PRESET_LIST = [
  TRI_COLOR_PRESETS.volt_precision,
  TRI_COLOR_PRESETS.solar_obsidian,
  TRI_COLOR_PRESETS.bio_circuit,
];

export const CustomTriColorStudio: React.FC = () => {
  const {
    prefs,
    resolvedLightMode,
    activePalette,
    setTheme,
    setPalettePreset,
    setCustomPalette,
  } = useWorkspace();

  const [previewSwitchOn, setPreviewSwitchOn] = useState(true);
  const [hexDraft, setHexDraft] = useState<TriColorPalette>(prefs.customPalette);

  const contrastReport = evaluatePaletteContrast(activePalette, resolvedLightMode);

  const handleCustomColorPick = (channel: keyof TriColorPalette, rawHex: string) => {
    const nextDraft = { ...hexDraft, [channel]: rawHex };
    setHexDraft(nextDraft);
    const norm = normalizeHex(rawHex);
    if (norm) {
      setCustomPalette({
        ...prefs.customPalette,
        [channel]: norm,
      });
    }
  };

  const selectPreset = (presetId: Exclude<TriColorPresetId, 'custom'>) => {
    const meta = TRI_COLOR_PRESETS[presetId];
    const pal = resolvedLightMode ? meta.light : meta.dark;
    setPalettePreset(presetId);
    setHexDraft(pal);
  };

  return (
    <div className="space-y-5">
      {/* Base Surface Mode */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-foreground-secondary">Base Surface Theme</div>
        <SegmentedControl<BaseTheme>
          fullWidth
          ariaLabel="Base Surface Theme"
          value={prefs.theme}
          onChange={setTheme}
          options={[
            { value: 'obsidian', label: 'Obsidian Slate', icon: <Moon className="h-3.5 w-3.5" /> },
            { value: 'alabaster', label: 'Alabaster Daylight', icon: <Sun className="h-3.5 w-3.5" /> },
            { value: 'system', label: 'System Auto', icon: <Monitor className="h-3.5 w-3.5" /> },
          ]}
        />
      </div>

      {/* Curated Tri-Color Presets */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-foreground-secondary">
            Curated Tri-Color Presets
          </span>
          <Badge variant="mono">
            {prefs.palettePreset === 'custom' ? 'CUSTOM PALETTE' : prefs.palettePreset.toUpperCase()}
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {PRESET_LIST.map((preset) => {
            const active = prefs.palettePreset === preset.id;
            const pal = resolvedLightMode ? preset.light : preset.dark;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => selectPreset(preset.id)}
                className={cn(
                  'min-h-[68px] flex flex-col justify-between rounded-[var(--dd-radius-control)] border p-3 text-left transition-colors cursor-pointer',
                  active
                    ? 'border-primary-border bg-primary-soft'
                    : 'border-border bg-surface-elevated hover:border-border-strong'
                )}
              >
                <div className="flex items-center justify-between gap-2 w-full">
                  <span className="text-xs font-semibold text-foreground">{preset.name}</span>
                  {active && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                </div>

                {/* Tri-Color Swatch Strip */}
                <div className="flex items-center gap-1.5 mt-2">
                  <span
                    className="h-2.5 flex-1 rounded-full border border-black/15"
                    style={{ backgroundColor: pal.primary }}
                    title={`Primary: ${pal.primary}`}
                  />
                  <span
                    className="h-2.5 flex-1 rounded-full border border-black/15"
                    style={{ backgroundColor: pal.secondary }}
                    title={`Secondary: ${pal.secondary}`}
                  />
                  <span
                    className="h-2.5 flex-1 rounded-full border border-black/15"
                    style={{ backgroundColor: pal.tertiary }}
                    title={`Tertiary: ${pal.tertiary}`}
                  />
                </div>
                <div className="text-[10px] text-foreground-muted mt-1.5 truncate">
                  {preset.tagline}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Tri-Color Studio */}
      <div className="rounded-[var(--dd-radius-card)] border border-border bg-surface-elevated p-3.5 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-primary" />
            <div>
              <div className="text-xs font-semibold text-foreground">Custom Tri-Color Studio</div>
              <div className="text-[11px] text-foreground-muted">
                Auto-derives readable text, soft surfaces &amp; focus rings with WCAG contrast guard.
              </div>
            </div>
          </div>
          <Button
            variant={prefs.palettePreset === 'custom' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setCustomPalette(hexDraft)}
          >
            {prefs.palettePreset === 'custom' ? 'Custom Active' : 'Enable Custom'}
          </Button>
        </div>

        {/* 3 Color Pickers + Hex Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(
            [
              {
                key: 'primary' as const,
                title: '1 · Primary',
                role: 'Actions & Active States',
                ratio: contrastReport.ratios.primary,
              },
              {
                key: 'secondary' as const,
                title: '2 · Secondary',
                role: 'Telemetry & Structure',
                ratio: contrastReport.ratios.secondary,
              },
              {
                key: 'tertiary' as const,
                title: '3 · Tertiary',
                role: 'Status & Highlights',
                ratio: contrastReport.ratios.tertiary,
              },
            ]
          ).map((ch) => {
            const currentHex =
              prefs.palettePreset === 'custom'
                ? hexDraft[ch.key]
                : activePalette[ch.key];
            const valid = isValidHex(currentHex);
            return (
              <div
                key={ch.key}
                className="rounded-[var(--dd-radius-control)] border border-border bg-surface p-2.5 space-y-2"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-foreground">{ch.title}</span>
                  <span className="font-mono text-[10px] text-foreground-muted tabular-nums">
                    {ch.ratio}:1
                  </span>
                </div>
                <div className="text-[10px] text-foreground-muted">{ch.role}</div>

                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={`${ch.title} color picker`}
                    value={normalizeHex(currentHex) ?? activePalette[ch.key]}
                    onChange={(e) => handleCustomColorPick(ch.key, e.target.value)}
                    className="h-9 w-10 rounded border border-border bg-transparent cursor-pointer shrink-0 p-0.5"
                  />
                  <input
                    type="text"
                    aria-label={`${ch.title} hex value`}
                    value={currentHex}
                    onChange={(e) => handleCustomColorPick(ch.key, e.target.value)}
                    maxLength={7}
                    className={cn(
                      'flex-1 min-w-0 h-9 rounded border bg-surface-elevated px-2 font-mono text-xs uppercase text-foreground focus:outline-none',
                      valid ? 'border-border focus:border-primary' : 'border-danger'
                    )}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Automatic Contrast Warning */}
        {!contrastReport.isAdequate && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-[var(--dd-radius-control)] border border-warning/50 bg-warning-soft px-3 py-2 text-xs"
          >
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-semibold text-foreground">Low-Contrast Palette Warning</div>
              <div className="text-[11px] text-foreground-secondary">
                {contrastReport.warnings.join(' ')}
              </div>
            </div>
          </div>
        )}

        {/* Real-Time Live Tri-Color Mini-Preview */}
        <div className="rounded-[var(--dd-radius-control)] border border-border bg-canvas p-3 space-y-2.5">
          <div className="flex items-center justify-between text-[10px] font-mono text-foreground-muted">
            <span>LIVE TRI-COLOR MINI-PREVIEW</span>
            <span className="inline-flex items-center gap-1 text-success">
              <ShieldCheck className="h-3 w-3" /> Safety Tokens Locked
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Switch Card Preview */}
            <div className="rounded-lg border border-border bg-surface p-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-8 w-8 rounded-md bg-primary-soft border border-primary-border text-primary flex items-center justify-center shrink-0">
                  <Power className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">Living Ceiling</div>
                  <div className="text-[10px] font-mono text-tertiary truncate">ACK · 42 W</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewSwitchOn((v) => !v)}
                className={cn(
                  'h-6 w-11 rounded-full border p-0.5 transition-colors cursor-pointer shrink-0 flex items-center',
                  previewSwitchOn
                    ? 'bg-primary border-primary-border justify-end'
                    : 'bg-surface-muted border-border-strong justify-start'
                )}
              >
                <span
                  className={cn(
                    'h-4 w-4 rounded-full',
                    previewSwitchOn ? 'bg-primary-foreground' : 'bg-foreground-secondary'
                  )}
                />
              </button>
            </div>

            {/* Active Nav Pill + Telemetry Bar + Primary Button */}
            <div className="rounded-lg border border-border bg-surface p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium bg-primary-soft text-primary border border-primary-border">
                  Active Nav Pill
                </span>
                <span className="rounded px-2 py-0.5 text-[10px] font-mono bg-tertiary-soft text-tertiary border border-tertiary-border">
                  ONLINE
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-surface-muted overflow-hidden flex">
                <span className="h-full w-1/2 bg-primary" />
                <span className="h-full w-1/4 bg-secondary" />
                <span className="h-full w-1/4 bg-tertiary" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Compact Quick Theme Popover for Top Utility Bar
 */
export const QuickThemePopover: React.FC = () => {
  const { prefs, resolvedLightMode, activePalette, setTheme, setPalettePreset } = useWorkspace();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Quick theme and tri-color palette switcher"
        title="Theme & Tri-Color Palette"
        className="inline-flex items-center gap-1.5 h-8 px-2 rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated hover:border-border-strong text-xs text-foreground-secondary hover:text-foreground transition-colors cursor-pointer"
      >
        <Palette className="h-3.5 w-3.5 text-primary" />
        <span className="hidden xl:flex items-center gap-0.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: activePalette.primary }} />
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: activePalette.secondary }} />
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: activePalette.tertiary }} />
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-[var(--dd-radius-card)] border border-border-strong bg-surface p-3 shadow-2xl z-50 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-xs font-semibold text-foreground">Quick Tri-Color Theme</span>
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="text-[11px] font-mono text-primary hover:underline"
            >
              Color Studio →
            </Link>
          </div>

          <SegmentedControl<BaseTheme>
            fullWidth
            size="sm"
            ariaLabel="Quick base theme"
            value={prefs.theme}
            onChange={setTheme}
            options={[
              { value: 'obsidian', label: 'Dark' },
              { value: 'alabaster', label: 'Light' },
              { value: 'system', label: 'Auto' },
            ]}
          />

          <div className="space-y-1">
            {PRESET_LIST.map((preset) => {
              const active = prefs.palettePreset === preset.id;
              const pal = resolvedLightMode ? preset.light : preset.dark;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setPalettePreset(preset.id)}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-xs transition-colors cursor-pointer',
                    active
                      ? 'border-primary-border bg-primary-soft text-foreground'
                      : 'border-border bg-surface-elevated text-foreground-secondary hover:text-foreground'
                  )}
                >
                  <span className="font-medium">{preset.name}</span>
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: pal.primary }} />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: pal.secondary }} />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: pal.tertiary }} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
