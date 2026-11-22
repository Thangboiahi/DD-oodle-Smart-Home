'use client';

import React from 'react';
import { AlertOctagon, ShieldAlert } from 'lucide-react';
import { AlertType } from '@/lib/protocol/contract';
import { cn } from '@/lib/utils';

export interface LatchedFaultBannerProps {
  fault: AlertType | null;
  moduleCode?: string;
  className?: string;
}

const FAULT_GUIDANCE: Record<string, string> = {
  OVERLOAD: 'Excessive current detected. Unplug or inspect the connected appliance before resetting.',
  OVERPOWER: 'Power ceiling exceeded. Verify appliance wattage rating before resetting.',
  RUNTIME_LIMIT: 'Maximum continuous runtime ceiling reached (45-min thermal guard). Verify geyser/load safety.',
  OVERTEMP: 'Internal relay/board temperature exceeded safe threshold. Allow module to cool down.',
  METER_FAULT: 'Energy metering IC fault detected. Inspect wiring and power supply.',
  DRY_RUN_FAULT: 'Pump ran without water flow. Check sump water level and suction pipe prime.',
  TANK_LINK_LOST: 'Overhead tank telemetry link lost. Inspect terrace unit power and RF path.',
  SENSOR_FAULT: 'Hardware sensor reading out of valid range. Check sensor probe connection.',
};

/**
 * G10 Global Latched Fault Lock Banner
 * Strictly prohibits remote clearing: NEVER renders a remote clear button.
 */
export const LatchedFaultBanner: React.FC<LatchedFaultBannerProps> = ({
  fault,
  moduleCode,
  className,
}) => {
  if (!fault) return null;

  const guidance =
    FAULT_GUIDANCE[fault] ??
    'Hardware protection cutoff engaged. Physically inspect the connected load or pump.';

  return (
    <div
      role="alert"
      className={cn(
        'rounded-[var(--dd-radius-control)] border border-danger/60 bg-danger-soft p-3 space-y-2',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-danger uppercase tracking-wide">
          <AlertOctagon className="h-4 w-4 shrink-0 animate-pulse" />
          <span>Latched Fault: {fault}</span>
        </div>
        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono bg-danger/20 text-danger border border-danger/40">
          <ShieldAlert className="h-3 w-3" />
          <span>G10 HARD-LOCKED{moduleCode ? ` · ${moduleCode}` : ''}</span>
        </span>
      </div>

      <p className="text-[11px] text-foreground leading-relaxed">{guidance}</p>

      <div className="rounded-md border border-danger/30 bg-surface/80 px-2.5 py-2 text-[11px] text-foreground-secondary leading-snug">
        <strong className="text-foreground">Physical Reset Required:</strong> All power/load-ON
        toggles are hard-locked OFF. Physically inspect the load/pump and{' '}
        <strong className="text-foreground">hold the device&apos;s physical button for 3 seconds</strong>{' '}
        to clear this fault. Remote clearing is disabled by life-safety policy.
      </div>
    </div>
  );
};
