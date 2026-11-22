'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  MapPin,
  PhoneCall,
  ShieldAlert,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ActiveCrashSosSession } from '@/lib/simulator/types';
import { DeviceAlertPayload } from '@/lib/protocol/contract';

export interface CriticalLifeSafetyAlert {
  deviceId: string;
  deviceName: string;
  alert: DeviceAlertPayload;
  contacts?: string[];
}

interface CrashSosModalProps {
  session: ActiveCrashSosSession | null;
  criticalAlert?: CriticalLifeSafetyAlert | null;
  emergencyContacts?: string[];
  onCancelSos: () => void;
  onDismiss?: () => void;
}

/**
 * Global Life-Safety Alert & 20-Second Crash SOS Modal (G13a–d)
 * Handles CRASH_DETECTED (20s cancel countdown), SOS_MANUAL (immediate escalation),
 * EXT_POWER_LOST, GAS_LEAK, SMOKE_FIRE, FALL_DETECTED, and PANIC_SOS.
 */
export const CrashSosModal: React.FC<CrashSosModalProps> = ({
  session,
  criticalAlert,
  emergencyContacts = ['+919862011114', '+919862022282'],
  onCancelSos,
  onDismiss,
}) => {
  const [muted, setMuted] = useState(false);
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  const activeIncidentId = session
    ? `${session.incident_id}_${session.status}`
    : criticalAlert
    ? `${criticalAlert.deviceId}_${criticalAlert.alert.ts}`
    : null;

  const isCountdown = session?.status === 'countdown';
  const isCancelled = session?.status === 'cancelled_by_user';
  const isEscalated = session?.status === 'escalated';

  // Audible Web Audio alert beep during active countdown / immediate critical alert (with visual fallback)
  useEffect(() => {
    const shouldBeep =
      !muted &&
      activeIncidentId !== dismissedId &&
      (isCountdown || (!session && Boolean(criticalAlert)));
    if (!shouldBeep || typeof window === 'undefined') return;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    let ctx: AudioContext | null = null;
    const playPulse = () => {
      try {
        ctx = ctx ?? new AudioCtx();
        if (ctx.state === 'suspended') return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = 880;
        gain.gain.value = 0.06;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.16);
      } catch {
        // Browser audio policy blocked — visual high-contrast override remains active
      }
    };

    const timer = window.setInterval(playPulse, 1500);
    return () => {
      window.clearInterval(timer);
      if (ctx) void ctx.close().catch(() => {});
    };
  }, [muted, isCountdown, session, criticalAlert, activeIncidentId, dismissedId]);

  if (!session && !criticalAlert) return null;
  if (activeIncidentId && activeIncidentId === dismissedId && !isCountdown) return null;

  const handleDismiss = () => {
    if (activeIncidentId) setDismissedId(activeIncidentId);
    onDismiss?.();
  };

  // Mode B: Non-Crash Critical Life-Safety Alert (SOS_MANUAL, GAS_LEAK, SMOKE_FIRE, FALL_DETECTED, etc.)
  if (!session && criticalAlert) {
    const { alert, deviceName, deviceId } = criticalAlert;
    const contacts = criticalAlert.contacts ?? emergencyContacts;
    const lat = alert.lat ?? 24.817;
    const lng = alert.lng ?? 93.9368;
    const mapHref = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
        <div
          role="alertdialog"
          aria-modal="true"
          className="w-full max-w-md rounded-2xl border-2 border-danger bg-[#1e050a] text-white p-6 space-y-4 shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded bg-danger px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wider">
              <ShieldAlert className="h-3.5 w-3.5 animate-pulse" />
              <span>CRITICAL LIFE-SAFETY ALERT</span>
            </span>
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? 'Unmute siren' : 'Mute siren'}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-white/20 bg-white/10 text-white cursor-pointer"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight">{alert.type}</h2>
            <p className="text-xs text-rose-200 font-mono">
              {deviceName} ({deviceId}) · Event TS: {alert.ts}
            </p>
            {alert.message && <p className="text-xs text-white/90 pt-1">{alert.message}</p>}
          </div>

          <div className="rounded-xl border border-rose-500/40 bg-black/40 p-3 space-y-2 text-xs font-mono">
            <div className="text-rose-300 font-semibold">Immediate Escalation Contacts:</div>
            <div className="flex flex-wrap gap-1.5">
              {contacts.map((c) => (
                <span key={c} className="rounded bg-white/10 px-2 py-0.5 text-[11px] tabular-nums">
                  {c}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <a
              href="tel:112"
              className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-danger text-white font-semibold text-xs hover:brightness-110"
            >
              <PhoneCall className="h-4 w-4" />
              <span>Call 112 Emergency</span>
            </a>
            <a
              href={mapHref}
              target="_blank"
              rel="noreferrer"
              className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 text-white font-semibold text-xs hover:bg-white/20"
            >
              <MapPin className="h-4 w-4" />
              <span>Open Live Map</span>
            </a>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="w-full min-h-[40px] rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-xs font-medium text-rose-100 cursor-pointer"
          >
            Acknowledge &amp; Close Overlay
          </button>
        </div>
      </div>
    );
  }

  // Mode A: G13a CRASH_DETECTED 20-Second Countdown / Cancelled / Escalated
  if (!session) return null;

  const lat = session.alert.lat ?? 24.817;
  const lng = session.alert.lng ?? 93.9368;
  const mapHref = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
      <div
        role="alertdialog"
        aria-modal="true"
        className={`w-full max-w-md rounded-2xl border-2 p-6 text-center shadow-2xl space-y-4 ${
          isCancelled
            ? 'border-emerald-500/60 bg-slate-950 text-slate-100'
            : 'border-rose-500 bg-[#22060c] text-white'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-black/40 border border-white/15">
            ID: {session.incident_id} · TS {session.alert.ts}
          </span>
          {!isCancelled && (
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? 'Unmute alert sound' : 'Mute alert sound'}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-white/20 bg-white/10 text-white cursor-pointer"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          )}
        </div>

        {/* Status Icon */}
        <div className="mx-auto flex items-center justify-center">
          {isCancelled ? (
            <div className="h-14 w-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/40">
              <CheckCircle2 className="h-8 w-8" />
            </div>
          ) : (
            <div className="h-16 w-16 rounded-full bg-rose-600 text-white flex items-center justify-center animate-pulse">
              <AlertTriangle className="h-9 w-9" />
            </div>
          )}
        </div>

        <h2 className="text-xl font-bold tracking-tight">
          {isCancelled
            ? 'Crash SOS Cancelled — User Safe'
            : isEscalated
            ? 'EMERGENCY ESCALATION DISPATCHED'
            : 'CRITICAL CRASH DETECTED (G13a)'}
        </h2>

        {isCountdown && (
          <div className="space-y-1">
            <div className="text-6xl font-black font-mono tracking-tighter text-white tabular-nums">
              00:{session.remaining_sec.toString().padStart(2, '0')}
            </div>
            <p className="text-xs text-rose-200 font-mono">
              Auto-escalating to SMS, WhatsApp, Voice Call &amp; Fleet Dispatch in {session.remaining_sec}s
            </p>
          </div>
        )}

        {isEscalated && (
          <div className="rounded-xl bg-black/40 border border-rose-500/50 p-3 text-xs text-left space-y-2 font-mono">
            <div className="font-semibold text-rose-300 flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4" />
              <span>Escalated (`escalated: true`) to Contacts:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {emergencyContacts.map((c) => (
                <span key={c} className="rounded bg-white/10 px-2 py-0.5 text-[11px] tabular-nums">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {isCancelled && (
          <p className="text-xs text-slate-300 font-mono">
            Status: <span className="text-emerald-400">cancelled: true</span> · Hardware buzzer &amp; escalation halted.
          </p>
        )}

        {/* Impact Telemetry */}
        <div className="rounded-xl bg-black/45 border border-white/15 p-3 text-xs text-left space-y-1.5 font-mono tabular-nums">
          <div className="flex justify-between">
            <span className="text-white/60">Peak G-Force</span>
            <span className="font-bold text-rose-300">{session.alert.g_force ?? 6.4} G</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/60">Tilt Angle</span>
            <span className="font-bold text-amber-300">{session.alert.tilt_deg ?? 78}°</span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-white/10">
            <span className="text-white/60 inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-rose-400" /> GPS
            </span>
            <a
              href={mapHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sky-300 hover:underline"
            >
              <span>
                {lat.toFixed(4)}°N, {lng.toFixed(4)}°E
              </span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Massive Thumb-Friendly Cancel Button */}
        {isCountdown && (
          <button
            type="button"
            onClick={onCancelSos}
            className="w-full min-h-[56px] py-4 rounded-xl bg-white text-rose-950 font-black text-sm uppercase tracking-wider shadow-lg hover:bg-rose-50 active:scale-[0.98] transition cursor-pointer"
          >
            I&apos;m Safe — Cancel SOS
          </button>
        )}

        {isEscalated && (
          <div className="grid grid-cols-2 gap-2">
            <a
              href="tel:112"
              className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 text-white font-semibold text-xs"
            >
              <PhoneCall className="h-4 w-4" />
              <span>Call 112</span>
            </a>
            <a
              href={mapHref}
              target="_blank"
              rel="noreferrer"
              className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/25 bg-white/10 text-white font-semibold text-xs"
            >
              <MapPin className="h-4 w-4" />
              <span>Open Map</span>
            </a>
          </div>
        )}

        {(isCancelled || isEscalated) && (
          <button
            type="button"
            onClick={handleDismiss}
            className="w-full min-h-[40px] rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-xs transition cursor-pointer"
          >
            Dismiss Alert Overlay
          </button>
        )}
      </div>
    </div>
  );
};
