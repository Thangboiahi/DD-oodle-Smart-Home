'use client';

import React from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  MapPin,
  MessageSquareWarning,
  Minimize2,
  PhoneCall,
  ShieldAlert,
} from 'lucide-react';
import { DeviceAlertPayload } from '@/lib/protocol/contract';
import { ActiveCrashSosSession } from '@/lib/simulator/types';
import { Button, Badge } from '@/components/ui';

export interface CriticalLifeSafetyAlert {
  deviceId: string;
  deviceName: string;
  alert: DeviceAlertPayload;
  contacts?: string[];
}

export interface CrashSosModalProps {
  session: ActiveCrashSosSession | null;
  criticalAlert?: CriticalLifeSafetyAlert | null;
  emergencyContacts?: string[];
  onCancelSos: () => void;
  onAcknowledgeEscalated?: () => void;
}

/**
 * G13a / G13b Life-Safety Exception:
 * Keeps the 20-second `CRASH_DETECTED` "I'm Safe — Cancel SOS" countdown modal and immediate `SOS_MANUAL`
 * escalation prominent for occupant life safety. Never auto-hides an active uncancelled 20-second crash countdown.
 * Once escalated, the user can dock it into the corner FloatingEmergencyAlert beacon.
 */
export const CrashSosModal: React.FC<CrashSosModalProps> = ({
  session,
  emergencyContacts = ['+919876543210'],
  onCancelSos,
  onAcknowledgeEscalated,
}) => {
  const [dockedIncidentId, setDockedIncidentId] = React.useState<string | null>(null);

  if (!session || session.status === 'cancelled_by_user') {
    return null;
  }

  // Once escalated, allow the user to dock the modal into the FloatingEmergencyAlert corner beacon
  if (session.status === 'escalated' && dockedIncidentId === session.incident_id) {
    return null;
  }

  const isManual = session.alert.type === 'SOS_MANUAL';
  const isEscalated = session.status === 'escalated';

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="crash-sos-title"
      aria-describedby="crash-sos-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
    >
      <div className="w-full max-w-md rounded-2xl border-2 border-danger bg-surface p-5 shadow-2xl space-y-4">
        {/* Top Critical Badge */}
        <div className="flex items-center justify-between gap-2">
          <Badge variant="danger" dot className="text-xs px-2.5 py-1">
            {isManual ? 'SOS_MANUAL · IMMEDIATE DISPATCH (G13b)' : 'CRASH_DETECTED · LIFE SAFETY (G13a)'}
          </Badge>
          <span className="font-mono text-xs text-danger font-semibold tabular-nums">
            {session.alert.g_force ? `${session.alert.g_force.toFixed(1)} G` : 'PANIC BUTTON'}
          </span>
        </div>

        {/* Title & Countdown Ring */}
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-2 border-danger bg-danger/15 text-danger font-mono text-2xl font-bold tabular-nums">
            {isEscalated ? <AlertOctagon className="h-8 w-8" /> : `${session.remaining_sec}s`}
          </div>
          <div>
            <h2 id="crash-sos-title" className="text-base font-bold text-foreground">
              {isEscalated
                ? 'Emergency Escalation Dispatched'
                : 'Vehicle Impact Detected — Are You Safe?'}
            </h2>
            <p id="crash-sos-desc" className="text-xs text-foreground-secondary mt-1">
              {isEscalated
                ? 'SMS, WhatsApp & Automated Voice Call sent with live GPS coordinates to your E.164 emergency contacts.'
                : `Auto-dispatching SMS + WhatsApp + Voice Call in ${session.remaining_sec} seconds unless cancelled.`}
            </p>
          </div>
        </div>

        {/* Telemetry Box */}
        <div className="rounded-xl border border-border bg-surface-elevated p-3 font-mono text-xs space-y-1.5 tabular-nums">
          <div className="flex items-center justify-between text-foreground-secondary">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-danger" />
              <span>GPS Coordinates</span>
            </span>
            <span className="text-foreground font-semibold">
              {session.alert.lat?.toFixed(4)}° N, {session.alert.lng?.toFixed(4)}° E
            </span>
          </div>
          {session.alert.tilt_deg !== undefined && (
            <div className="flex items-center justify-between text-foreground-secondary">
              <span>Roll / Tilt Angle</span>
              <span className="text-foreground font-semibold">
                {session.alert.tilt_deg}°
              </span>
            </div>
          )}
          <div className="flex items-center justify-between text-foreground-secondary">
            <span>Device ID</span>
            <span className="text-foreground">{session.device_id}</span>
          </div>
        </div>

        {/* Escalation Channels Status */}
        {isEscalated && (
          <div className="space-y-1.5 rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs">
            <div className="font-semibold text-danger flex items-center gap-1.5">
              <PhoneCall className="h-3.5 w-3.5" />
              <span>Active Escalation Channels (G14 E.164 Contacts)</span>
            </div>
            <ul className="space-y-1 text-[11px] font-mono text-foreground-secondary">
              <li className="flex items-center justify-between">
                <span>1. MSG91 / Twilio Priority SMS</span>
                <span className="text-success font-semibold">DELIVERED</span>
              </li>
              <li className="flex items-center justify-between">
                <span>2. WhatsApp Location Pin</span>
                <span className="text-success font-semibold">DELIVERED</span>
              </li>
              <li className="flex items-center justify-between">
                <span>3. Automated Voice Call</span>
                <span className="text-warning font-semibold">
                  DIALING ({emergencyContacts[0] ?? '+919876543210'})
                </span>
              </li>
            </ul>
          </div>
        )}

        {/* Action Buttons */}
        {!isEscalated ? (
          <Button
            variant="primary"
            size="lg"
            touchTarget
            onClick={onCancelSos}
            className="w-full bg-success text-slate-950 hover:bg-success/90 font-bold text-sm py-3"
          >
            <CheckCircle2 className="h-5 w-5" />
            <span>I&apos;m Safe — Cancel SOS ({session.remaining_sec}s)</span>
          </Button>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              variant="secondary"
              size="md"
              touchTarget
              onClick={() => {
                setDockedIncidentId(session.incident_id);
                onAcknowledgeEscalated?.();
              }}
              className="w-full"
            >
              <Minimize2 className="h-4 w-4" />
              <span>Dock to Corner Beacon</span>
            </Button>
            <Button
              variant="danger"
              size="md"
              touchTarget
              onClick={() => {
                setDockedIncidentId(session.incident_id);
                onCancelSos();
              }}
              className="w-full"
            >
              <MessageSquareWarning className="h-4 w-4" />
              <span>Send &quot;All Clear&quot; &amp; Dock</span>
            </Button>
          </div>
        )}

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-foreground-muted font-mono">
          <ShieldAlert className="h-3.5 w-3.5 text-danger" />
          <span>Core Free-Forever Life-Safety Guarantee · Zero Subscription Gate</span>
        </div>
      </div>
    </div>
  );
};
