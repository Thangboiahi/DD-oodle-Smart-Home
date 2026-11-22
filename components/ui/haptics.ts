export type HapticPattern = 'tap' | 'step' | 'drag' | 'fault' | 'sos';

const PATTERN_MS: Record<HapticPattern, number | number[]> = {
  tap: 10,
  step: 14,
  drag: [12, 18, 12],
  fault: [45, 35, 65],
  sos: [80, 40, 80, 40, 120],
};

let globalHapticsEnabled = true;

export function setGlobalHapticsEnabled(enabled: boolean): void {
  globalHapticsEnabled = enabled;
}

/**
 * Optional Android/Web Vibration API haptic feedback.
 * Safely no-ops on unsupported browsers (iOS Safari, desktop) or when disabled.
 */
export function triggerHaptic(pattern: HapticPattern = 'tap', enabled?: boolean): void {
  const active = enabled !== undefined ? enabled : globalHapticsEnabled;
  if (!active || typeof navigator === 'undefined') return;
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(PATTERN_MS[pattern]);
    }
  } catch {
    // Ignore vibration errors in restricted contexts
  }
}
