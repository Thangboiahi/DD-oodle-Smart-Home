export type TriColorPresetId = 'volt_precision' | 'solar_obsidian' | 'bio_circuit' | 'custom';
export type MotionPreference = 'fluid' | 'reduced' | 'eco';

export interface TriColorPalette {
  primary: string;
  secondary: string;
  tertiary: string;
}

export interface TriColorPresetMeta {
  id: Exclude<TriColorPresetId, 'custom'>;
  name: string;
  tagline: string;
  dark: TriColorPalette;
  light: TriColorPalette;
}

export const TRI_COLOR_PRESETS: Record<
  Exclude<TriColorPresetId, 'custom'>,
  TriColorPresetMeta
> = {
  volt_precision: {
    id: 'volt_precision',
    name: 'Volt Precision',
    tagline: 'Electric Cyan · Titanium Slate · Emerald Signal',
    dark: { primary: '#06b6d4', secondary: '#64748b', tertiary: '#10b981' },
    light: { primary: '#0891b2', secondary: '#475569', tertiary: '#059669' },
  },
  solar_obsidian: {
    id: 'solar_obsidian',
    name: 'Solar Obsidian',
    tagline: 'Warm Amber Gold · Graphite Steel · Copper Pulse',
    dark: { primary: '#f59e0b', secondary: '#6b7280', tertiary: '#ea580c' },
    light: { primary: '#d97706', secondary: '#4b5563', tertiary: '#c2410c' },
  },
  bio_circuit: {
    id: 'bio_circuit',
    name: 'Bio Circuit',
    tagline: 'Emerald Mint · Petrol Teal · Indigo Spark',
    dark: { primary: '#10b981', secondary: '#0f766e', tertiary: '#6366f1' },
    light: { primary: '#059669', secondary: '#115e59', tertiary: '#4f46e5' },
  },
};

export const DEFAULT_CUSTOM_PALETTE: TriColorPalette = {
  ...TRI_COLOR_PRESETS.volt_precision.dark,
};

export function normalizeHex(input: string): string | null {
  const clean = input.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(clean)) return clean.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(clean)) {
    const r = clean[1];
    const g = clean[2];
    const b = clean[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

export function isValidHex(input: string): boolean {
  return normalizeHex(input) !== null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const norm = normalizeHex(hex) ?? '#06b6d4';
  const intVal = parseInt(norm.slice(1), 16);
  return {
    r: (intVal >> 16) & 255,
    g: (intVal >> 8) & 255,
    b: intVal & 255,
  };
}

export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** WCAG 2.1 relative luminance (0..1) */
export function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG 2.1 contrast ratio between two hex colors (1..21) */
export function computeContrastRatio(hexA: string, hexB: string): number {
  const lumA = getRelativeLuminance(hexA);
  const lumB = getRelativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Picks readable foreground (#090b0f dark ink vs #ffffff white) for a filled color surface */
export function deriveReadableForeground(bgHex: string): string {
  const darkInk = '#090b0f';
  const whiteInk = '#ffffff';
  return computeContrastRatio(bgHex, darkInk) >= computeContrastRatio(bgHex, whiteInk)
    ? darkInk
    : whiteInk;
}

export interface PaletteContrastReport {
  isAdequate: boolean;
  warnings: string[];
  ratios: {
    primary: number;
    secondary: number;
    tertiary: number;
  };
}

export function evaluatePaletteContrast(
  palette: TriColorPalette,
  isLightSurface: boolean
): PaletteContrastReport {
  const surfaceBg = isLightSurface ? '#ffffff' : '#10141c';
  const primary = Number(computeContrastRatio(palette.primary, surfaceBg).toFixed(2));
  const secondary = Number(computeContrastRatio(palette.secondary, surfaceBg).toFixed(2));
  const tertiary = Number(computeContrastRatio(palette.tertiary, surfaceBg).toFixed(2));

  const warnings: string[] = [];
  if (primary < 3.0) {
    warnings.push(`Primary contrast (${primary}:1) is below 3.0:1 against ${isLightSurface ? 'light' : 'dark'} surface.`);
  }
  if (secondary < 2.4) {
    warnings.push(`Secondary contrast (${secondary}:1) may look faint on telemetry/borders.`);
  }
  if (tertiary < 3.0) {
    warnings.push(`Tertiary contrast (${tertiary}:1) is below 3.0:1 for status highlights.`);
  }

  return {
    isAdequate: warnings.length === 0,
    warnings,
    ratios: { primary, secondary, tertiary },
  };
}

export function resolveActivePalette(
  presetId: TriColorPresetId,
  customPalette: TriColorPalette,
  isLightMode: boolean
): TriColorPalette {
  if (presetId === 'custom') {
    return {
      primary: normalizeHex(customPalette.primary) ?? TRI_COLOR_PRESETS.volt_precision.dark.primary,
      secondary: normalizeHex(customPalette.secondary) ?? TRI_COLOR_PRESETS.volt_precision.dark.secondary,
      tertiary: normalizeHex(customPalette.tertiary) ?? TRI_COLOR_PRESETS.volt_precision.dark.tertiary,
    };
  }
  const meta = TRI_COLOR_PRESETS[presetId] ?? TRI_COLOR_PRESETS.volt_precision;
  return isLightMode ? meta.light : meta.dark;
}

export function buildTriColorCssVars(
  palette: TriColorPalette,
  isLightMode: boolean
): Record<string, string> {
  const softAlpha = isLightMode ? 0.11 : 0.14;
  const borderAlpha = isLightMode ? 0.32 : 0.38;

  return {
    '--dd-color-1': palette.primary,
    '--dd-color-1-fg': deriveReadableForeground(palette.primary),
    '--dd-color-1-soft': hexToRgba(palette.primary, softAlpha),
    '--dd-color-1-border': hexToRgba(palette.primary, borderAlpha),

    '--dd-color-2': palette.secondary,
    '--dd-color-2-fg': deriveReadableForeground(palette.secondary),
    '--dd-color-2-soft': hexToRgba(palette.secondary, softAlpha),
    '--dd-color-2-border': hexToRgba(palette.secondary, borderAlpha),

    '--dd-color-3': palette.tertiary,
    '--dd-color-3-fg': deriveReadableForeground(palette.tertiary),
    '--dd-color-3-soft': hexToRgba(palette.tertiary, softAlpha),
    '--dd-color-3-border': hexToRgba(palette.tertiary, borderAlpha),
  };
}
