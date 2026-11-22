'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  Shield,
  Car,
  Home,
  CheckCircle2,
  Clock,
  Layers,
  Info,
} from 'lucide-react';
import {
  DFY_3D_TWIN_ADDON_INR,
  ResolvedEntitlements,
  TIER_CATALOG,
} from '@/lib/entitlements/resolver';

interface PlanBadgeProps {
  entitlements: ResolvedEntitlements;
  onUpgradeRequest?: (tier: string) => void;
}

export const PlanBadge: React.FC<PlanBadgeProps> = ({
  entitlements,
  onUpgradeRequest,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const activeMeta = TIER_CATALOG[entitlements.effectiveTier];

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 px-3 py-1 text-xs font-medium text-purple-300 transition active:scale-95"
      >
        <Sparkles className="w-3.5 h-3.5 text-purple-400" />
        <span className="font-semibold">{activeMeta.displayName}</span>
        {entitlements.isTrialActive && (
          <span className="bg-purple-600/60 text-white text-[10px] px-1.5 py-0.2 rounded-full font-mono">
            {entitlements.trialDaysRemaining}d trial
          </span>
        )}
      </button>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <span>DD oodle Subscriptions &amp; Anti-Bricking Floor</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Current Tier: <strong className="text-purple-400">{activeMeta.displayName}</strong>
                  {entitlements.isTrialActive && ` (90-Day Free Trial: ${entitlements.trialDaysRemaining} days remaining)`}
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Core Anti-Bricking Floor Guarantee (Non-Negotiable) */}
            <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-4 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
                <CheckCircle2 className="w-4 h-4" />
                <span>Hard Anti-Bricking Floor (Core — Free Forever)</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Even if your subscription expires or is cancelled, DD oodle <strong>NEVER</strong> bricks your home.
                Your hardware cutoffs (WAT-01 dry-run, PWR-03 geyser max-runtime), 4-Tier fail-safe control, 2D Room Grid, up to 5 local schedules, and standard push notifications remain <strong>permanently free and operational</strong>.
              </p>
            </div>

            {/* 5-Tier Comparison Matrix */}
            <div className="mt-5 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Available Tiers (India / UPI Renewal)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {Object.values(TIER_CATALOG).map((tier) => {
                  const isCurrent = tier.tier === entitlements.effectiveTier;
                  return (
                    <div
                      key={tier.tier}
                      className={`rounded-xl border p-4 transition ${
                        isCurrent
                          ? 'border-purple-500/60 bg-purple-950/30 ring-1 ring-purple-500/30'
                          : 'border-slate-800 bg-slate-950/60'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h5 className="font-bold text-sm text-slate-100">{tier.displayName}</h5>
                          <p className="text-emerald-400 font-mono font-semibold text-xs mt-0.5">
                            {tier.annualInr === 0 ? 'Free Forever' : `₹${tier.annualInr.toLocaleString('en-IN')}/year`}
                            {tier.monthlyInr > 0 && ` (or ₹${tier.monthlyInr}/mo)`}
                          </p>
                        </div>
                        {isCurrent ? (
                          <span className="text-[10px] font-mono uppercase bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/40">
                            Active
                          </span>
                        ) : (
                          <button
                            onClick={() => onUpgradeRequest?.(tier.tier)}
                            className="text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded transition"
                          >
                            Select
                          </button>
                        )}
                      </div>
                      <p className="mt-2 text-slate-400 text-[11px] leading-relaxed">
                        {tier.summary}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Add-On Callout: ₹999 One-Time DFY 3D Twin */}
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5 flex items-center justify-between text-xs">
                <div>
                  <h5 className="font-semibold text-amber-300">
                    Done-For-You 3D Home Twin (₹{DFY_3D_TWIN_ADDON_INR} One-Time)
                  </h5>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Field technician configures custom 3D floorplan coordinates on-site via /admin installer portal.
                  </p>
                </div>
                <span className="text-[11px] font-mono text-amber-400 font-bold px-2 py-1 rounded bg-amber-900/40 border border-amber-700/50">
                  {entitlements.hasDfy3dTwin ? 'Installed' : 'Add-On'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
