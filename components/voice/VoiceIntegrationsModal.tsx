'use client';

import React, { useState } from 'react';
import {
  Mic,
  Sparkles,
  Lock,
  ExternalLink,
  CheckCircle,
  Copy,
  Info,
  X,
  Play,
} from 'lucide-react';
import { ResolvedEntitlements } from '@/lib/entitlements/resolver';

interface VoiceIntegrationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  entitlements: ResolvedEntitlements;
  onTestScene: (scene: string) => void;
}

export const VoiceIntegrationsModal: React.FC<VoiceIntegrationsModalProps> = ({
  isOpen,
  onClose,
  entitlements,
  onTestScene,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const isPlus = entitlements.canUseVoiceC2C;

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in font-mono">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-slate-100 space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 text-indigo-400">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white">Phase 1.5 Voice C2C Integration Hub</h3>
                <span className="text-[10px] bg-indigo-950/60 text-indigo-400 px-2 py-0.5 rounded border border-indigo-700/40">
                  Cloud-to-Cloud Bridge
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Google Assistant &bull; Amazon Alexa &bull; Apple Siri Shortcuts
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Entitlement Status Banner */}
        {!isPlus ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-3.5 flex items-start gap-3 text-xs">
            <Lock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-amber-300">Voice Integrations are Gated under Plus:</strong>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Cloud-to-Cloud voice integration with Google Home, Alexa, and Siri requires an active Plus plan.
                Upgrade or enjoy via your automatic 90-Day Free Trial!
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-emerald-300">
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>
                <strong>Voice C2C Active (Plus Tier):</strong> Cloud endpoints are live with real-time state sync.
              </span>
            </div>
            <span className="text-[10px] bg-emerald-900/40 text-emerald-300 px-2 py-0.5 rounded border border-emerald-700/40">
              Authorized
            </span>
          </div>
        )}

        {/* Architectural Disclaimer Notice */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-[11px] text-slate-400 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
          <p>
            <strong>Phase 1.5 C2C Boundary:</strong> Voice control operates strictly via Cloud-to-Cloud
            OAuth &amp; REST bridges. Native on-device Matter / Apple HomeKit commissioning is reserved for
            HUB-01 Phase 2/3 hardware.
          </p>
        </div>

        {/* Three Voice Ecosystem Cards */}
        <div className="space-y-3 text-xs">
          {/* 1. Google Smart Home */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-100 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                <span>Google Assistant &amp; Google Home</span>
              </span>
              <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                Action Live
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Say &ldquo;Hey Google, turn on Living Room lights&rdquo; or &ldquo;Hey Google, turn on the Geyser&rdquo;.
            </p>
            <div className="flex items-center justify-between pt-1 text-[10px] text-slate-500 border-t border-slate-800/60">
              <span>Endpoint: /api/v1/voice/google</span>
              <button
                onClick={() => handleCopy('google', window.location.origin + '/api/v1/voice/google')}
                className="text-sky-400 hover:text-sky-300 flex items-center gap-1 font-bold"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedKey === 'google' ? 'Copied' : 'Copy Webhook'}</span>
              </button>
            </div>
          </div>

          {/* 2. Amazon Alexa */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-100 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                <span>Amazon Alexa Smart Home Skill</span>
              </span>
              <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                Skill Live
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Say &ldquo;Alexa, set ceiling fan to speed 3&rdquo; or &ldquo;Alexa, turn off heavy geyser&rdquo;.
            </p>
            <div className="flex items-center justify-between pt-1 text-[10px] text-slate-500 border-t border-slate-800/60">
              <span>Endpoint: /api/v1/voice/alexa</span>
              <button
                onClick={() => handleCopy('alexa', window.location.origin + '/api/v1/voice/alexa')}
                className="text-sky-400 hover:text-sky-300 flex items-center gap-1 font-bold"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedKey === 'alexa' ? 'Copied' : 'Copy Webhook'}</span>
              </button>
            </div>
          </div>

          {/* 3. Apple Siri Shortcuts */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-100 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
                <span>Apple Siri Shortcuts (iOS)</span>
              </span>
              <span className="text-[10px] text-purple-400 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/40">
                1-Tap iOS Ready
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Works instantly on iPhone, Apple Watch, CarPlay, and HomePod via iOS Shortcuts webhooks.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <button
                onClick={() => onTestScene('inverter_saver')}
                className="p-2.5 rounded-lg border border-slate-800 bg-slate-900 hover:border-purple-500/50 text-left transition space-y-1"
              >
                <span className="font-bold text-purple-300 text-[10px] block">
                  &ldquo;Hey Siri, Inverter Saver&rdquo;
                </span>
                <span className="text-[9px] text-slate-400 block">Cuts 16A Geyser &amp; Loads</span>
              </button>

              <button
                onClick={() => onTestScene('geyser_morning')}
                className="p-2.5 rounded-lg border border-slate-800 bg-slate-900 hover:border-purple-500/50 text-left transition space-y-1"
              >
                <span className="font-bold text-purple-300 text-[10px] block">
                  &ldquo;Hey Siri, Morning Geyser&rdquo;
                </span>
                <span className="text-[9px] text-slate-400 block">Turns ON 45m Geyser</span>
              </button>

              <button
                onClick={() => onTestScene('porch_lights')}
                className="p-2.5 rounded-lg border border-slate-800 bg-slate-900 hover:border-purple-500/50 text-left transition space-y-1"
              >
                <span className="font-bold text-purple-300 text-[10px] block">
                  &ldquo;Hey Siri, Porch Lights&rdquo;
                </span>
                <span className="text-[9px] text-slate-400 block">Toggles Evening Lights</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
