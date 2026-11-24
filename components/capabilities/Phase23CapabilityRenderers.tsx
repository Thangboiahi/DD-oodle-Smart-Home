'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Fingerprint,
  HeartPulse,
  KeyRound,
  Lock,
  Pill,
  ShieldAlert,
  Unlock,
} from 'lucide-react';
import { FullscreenStage } from '@/components/workspace/FullscreenStage';
import { Badge } from '@/components/ui/Badge';
import { PrecisionSlider } from '@/components/ui/PrecisionSlider';
import { SegmentedControl } from '@/components/ui/SegmentedControl';

/**
 * Phase 2/3 Registry Readiness: Smart Lock (`lock_state`)
 * Slide-to-unlock, PIN/NFC/FP credential summary, and recent access log.
 */
export const SmartLockCapabilityRenderer: React.FC<{
  label: string;
  locked: boolean;
  disabled?: boolean;
  onUnlockToggle: (nextLocked: boolean) => void;
}> = ({ label, locked, disabled = false, onUnlockToggle }) => {
  const [slideVal, setSlideVal] = useState(0);

  return (
    <div className="rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-foreground">
          {locked ? (
            <Lock className="h-4 w-4 text-accent" />
          ) : (
            <Unlock className="h-4 w-4 text-warning" />
          )}
          <span>{label}</span>
        </div>
        <Badge variant={locked ? 'success' : 'warning'} dot>
          {locked ? 'LOCKED' : 'UNLOCKED'}
        </Badge>
      </div>

      {locked ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] font-mono text-foreground-muted">
            <span>SLIDE TO UNLOCK</span>
            <span className="tabular-nums">{slideVal}%</span>
          </div>
          <PrecisionSlider
            compact
            unit="%"
            min={0}
            max={100}
            step={1}
            value={slideVal}
            disabled={disabled}
            ariaLabel={`Slide to unlock ${label}`}
            onChange={(v) => {
              setSlideVal(v);
              if (v >= 95) {
                onUnlockToggle(false);
                setSlideVal(0);
              }
            }}
            onRelease={(v) => {
              if (v < 95) setSlideVal(0);
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onUnlockToggle(true)}
          className="w-full min-h-[40px] rounded-[var(--dd-radius-control)] border border-accent-border bg-accent-soft text-accent text-xs font-medium cursor-pointer"
        >
          Tap to Re-Lock Deadbolt
        </button>
      )}

      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border/60 text-[10px] font-mono text-foreground-muted">
        <span className="inline-flex items-center gap-1">
          <KeyRound className="h-3 w-3" /> PIN · NFC · <Fingerprint className="h-3 w-3" /> FP Ready
        </span>
        <span>Last: Owner FP · 08:14</span>
      </div>
    </div>
  );
};

/**
 * Phase 2/3 Registry Readiness: Video Stream (`video_stream`)
 * Snapshot / MJPEG / WebRTC switcher with FullscreenStage toggle.
 */
export const VideoStreamCapabilityRenderer: React.FC<{
  label: string;
  deviceId: string;
}> = ({ label, deviceId }) => {
  const [streamMode, setStreamMode] = useState<'snapshot' | 'mjpeg' | 'webrtc'>('snapshot');

  return (
    <FullscreenStage
      title={label}
      subtitle={`${deviceId} · ${streamMode.toUpperCase()} Stream`}
      toolbar={
        <SegmentedControl
          size="sm"
          ariaLabel="Video stream mode"
          value={streamMode}
          onChange={setStreamMode}
          options={[
            { value: 'snapshot', label: 'Snap' },
            { value: 'mjpeg', label: 'MJPEG' },
            { value: 'webrtc', label: 'WebRTC' },
          ]}
        />
      }
    >
      <div className="aspect-video w-full bg-canvas flex flex-col items-center justify-center gap-2 p-4 text-center">
        <Camera className="h-7 w-7 text-foreground-muted" />
        <div className="text-xs font-medium text-foreground">
          {streamMode === 'snapshot'
            ? 'Low-Bandwidth Snapshot Feed (LAN / 4G Ready)'
            : streamMode === 'mjpeg'
            ? 'Local LAN MJPEG Stream Active'
            : 'Encrypted WebRTC P2P Stream Ready'}
        </div>
        <span className="text-[10px] font-mono text-foreground-muted">
          1080p · H.264 · Local SD Ring Buffer
        </span>
      </div>
    </FullscreenStage>
  );
};

/**
 * Phase 2/3 Registry Readiness: Assisted Wellness (`vitals` | `fall_alert` | `pill_dispenser`)
 * Always includes mandatory non-medical wellness disclaimer banner.
 */
export const AssistedWellnessCapabilityRenderer: React.FC<{
  type: 'vitals' | 'fall_alert' | 'pill_dispenser';
  label: string;
  statusValue?: string | number | boolean;
}> = ({ type, label, statusValue }) => {
  const Icon = type === 'vitals' ? HeartPulse : type === 'fall_alert' ? ShieldAlert : Pill;

  return (
    <div className="rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-foreground">
          <Icon className="h-4 w-4 text-accent shrink-0" />
          <span>{label}</span>
        </div>
        <Badge variant={type === 'fall_alert' && statusValue ? 'danger' : 'mono'}>
          {statusValue !== undefined ? String(statusValue) : 'STANDBY'}
        </Badge>
      </div>

      {/* Mandatory Non-Medical Wellness Disclaimer */}
      <div className="flex items-start gap-2 rounded-md border border-warning/35 bg-warning-soft px-2.5 py-2 text-[10px] text-foreground leading-snug">
        <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
        <span>
          <strong>Non-Medical Wellness Indicator:</strong> For general home awareness only. Not a
          certified medical device and not intended for diagnosis, treatment, or emergency clinical
          monitoring.
        </span>
      </div>
    </div>
  );
};
