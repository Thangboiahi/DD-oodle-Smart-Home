'use client';

import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  PhoneCall,
  MessageSquare,
  ShieldAlert,
  MapPin,
  Volume2,
} from 'lucide-react';
import { ActiveCrashSosSession } from '@/lib/simulator/types';

interface CrashSosModalProps {
  session: ActiveCrashSosSession | null;
  onCancelSos: () => void;
  onDismiss?: () => void;
}

export const CrashSosModal: React.FC<CrashSosModalProps> = ({
  session,
  onCancelSos,
  onDismiss,
}) => {
  if (!session) return null;

  const isCountdown = session.status === 'countdown';
  const isCancelled = session.status === 'cancelled_by_user';
  const isEscalated = session.status === 'escalated';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`w-full max-w-md rounded-2xl border p-6 text-center shadow-2xl transition-all duration-300 ${
          isCancelled
            ? 'border-emerald-500/50 bg-slate-900 text-slate-100'
            : isEscalated
            ? 'border-rose-600 bg-slate-950 text-slate-100 shadow-[0_0_50px_rgba(225,29,72,0.4)]'
            : 'border-rose-500 bg-rose-950/90 text-white shadow-[0_0_60px_rgba(239,68,68,0.5)]'
        }`}
      >
        {/* Pulsing Alert Icon */}
        <div className="mx-auto flex items-center justify-center">
          {isCancelled ? (
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/40">
              <CheckCircle2 className="w-10 h-10" />
            </div>
          ) : (
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-rose-500/30 flex items-center justify-center animate-ping absolute inset-0" />
              <div className="w-20 h-20 rounded-full bg-rose-600 text-white flex items-center justify-center relative shadow-lg">
                <AlertTriangle className="w-10 h-10 animate-bounce" />
              </div>
            </div>
          )}
        </div>

        {/* Title */}
        <h2 className="mt-4 text-xl font-bold tracking-tight">
          {isCancelled
            ? 'Crash SOS Cancelled — User Confirmed Safe'
            : isEscalated
            ? 'EMERGENCY ESCALATION FIRED'
            : 'CRITICAL CRASH DETECTED!'}
        </h2>

        {/* Countdown Timer or Status Message */}
        {isCountdown && (
          <div className="my-5 space-y-2">
            <div className="text-6xl font-black font-mono tracking-tighter text-white animate-pulse">
              00:{session.remaining_sec.toString().padStart(2, '0')}
            </div>
            <p className="text-xs text-rose-200 uppercase tracking-widest font-semibold flex items-center justify-center gap-1.5">
              <Volume2 className="w-4 h-4 animate-spin" />
              <span>Emergency contacts will be called in {session.remaining_sec}s</span>
            </p>
          </div>
        )}

        {isEscalated && (
          <div className="my-4 rounded-xl bg-rose-900/40 border border-rose-500/50 p-3 text-xs text-rose-200 text-left space-y-2 font-mono">
            <p className="font-bold flex items-center gap-1.5 text-rose-300">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>Escalated to 5 Emergency Channels:</span>
            </p>
            <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-300">
              <li>High-Priority Automated Voice Call (MSG91 / Twilio)</li>
              <li>WhatsApp Emergency Broadcast with Live Map link</li>
              <li>SMS Blast to configured emergency contacts</li>
              <li>FCM Critical Push to family members</li>
              <li>Live Incident Ticket opened in /admin fleet dispatch</li>
            </ul>
          </div>
        )}

        {isCancelled && (
          <p className="my-4 text-xs text-slate-300">
            Emergency dispatch halted. Your vehicle hardware buzzer and siren have returned to normal standby.
          </p>
        )}

        {/* Impact Telemetry Card */}
        <div className="my-4 rounded-xl bg-slate-950/80 border border-slate-800 p-3 text-xs text-slate-300 text-left space-y-1.5 font-mono">
          <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
            <span className="text-slate-400">Device ID:</span>
            <span className="font-bold text-slate-200">{session.device_id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Peak G-Force:</span>
            <span className="font-bold text-rose-400">{session.alert.g_force} G</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Tilt Angle:</span>
            <span className="font-bold text-amber-400">{session.alert.tilt_deg}°</span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
            <span className="text-slate-400 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-rose-400" /> Coordinates:
            </span>
            <span className="text-slate-200">
              {session.alert.lat !== undefined ? session.alert.lat.toFixed(4) : '24.8170'}°N,{' '}
              {session.alert.lng !== undefined ? session.alert.lng.toFixed(4) : '93.9368'}°E
            </span>
          </div>
        </div>

        {/* Primary Action Button */}
        {isCountdown && (
          <button
            onClick={onCancelSos}
            className="w-full py-4 rounded-xl bg-white text-rose-950 font-black text-sm uppercase tracking-wider shadow-lg hover:bg-slate-100 active:scale-95 transition"
          >
            I&apos;m Safe — Cancel SOS
          </button>
        )}

        {(isCancelled || isEscalated) && (
          <button
            onClick={onDismiss}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs transition"
          >
            Dismiss Alert Overlay
          </button>
        )}
      </div>
    </div>
  );
};
