'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  Box,
  Cpu,
  Droplets,
  Fan,
  Flame,
  Lightbulb,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import { useUnifiedWorkspace } from '@/lib/data/unifiedStore';
import { FloorFilter } from '@/lib/twin/architectureBlueprints';

const MiniTwinCanvas = dynamic(() => import('./MiniTwinCanvas'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[360px] sm:h-[430px] rounded-xl border border-slate-800 bg-slate-950/90 flex flex-col items-center justify-center gap-2 text-xs font-mono text-slate-400">
      <div className="w-5 h-5 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
      <span>Initializing Architectural 3D Home Twin Engine...</span>
    </div>
  ),
});

export const TwinTeaserSection: React.FC = () => {
  const state = useUnifiedWorkspace();
  const dfyPriceInr = state.storeConfig.dfy3dPriceInr;
  const plusPriceInr = state.storeConfig.tierPrices.plus;

  const [ecoFallback, setEcoFallback] = useState(false);
  const [lampOn, setLampOn] = useState(true);
  const [fanSpeed, setFanSpeed] = useState<number>(3);
  const [geyserOn, setGeyserOn] = useState(true);
  const [pumpOn, setPumpOn] = useState(true);
  const [tankLevelPct, setTankLevelPct] = useState<number>(74);
  const [activeFloor, setActiveFloor] = useState<FloorFilter>('all');
  const [xrayWiring, setXrayWiring] = useState(false);

  // Smoothly animate rooftop water tank level when WAT-01 pump is running
  useEffect(() => {
    if (!pumpOn) return;
    const timer = window.setInterval(() => {
      setTankLevelPct((prev) => {
        const next = prev + 2;
        return next > 96 ? 62 : next;
      });
    }, 900);
    return () => window.clearInterval(timer);
  }, [pumpOn]);

  const handleCycleFan = (explicitSpeed?: number) => {
    if (typeof explicitSpeed === 'number') {
      setFanSpeed(Math.max(0, Math.min(4, explicitSpeed)));
      return;
    }
    setFanSpeed((prev) => (prev === 0 ? 2 : prev === 2 ? 4 : 0));
  };

  return (
    <div className="rounded-xl border border-slate-800/90 bg-slate-900/50 p-5 sm:p-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono mb-2">
            <Box className="w-3.5 h-3.5" /> Interactive 3D Home Twin + Eco 2D Fallback
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Architectural Dollhouse 3D Twin — or 1-Tap Eco 2D Grid
          </h3>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
            Included with <strong className="text-white">Plus</strong> (₹
            {plusPriceInr.toLocaleString('en-IN')}/yr) or as our{' '}
            <strong className="text-cyan-300">
              ₹{dfyPriceInr.toLocaleString('en-IN')} Done-For-You 3D Setup
            </strong>
            . Orbit the real 2BHK residence, inspect procedural 3D switchboards, spinning ceiling
            fans, bath geyser OLEDs, and the translucent rooftop water tank—or switch to Eco 2D to
            release WebGL memory immediately.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setEcoFallback((v) => !v)}
            className={`px-3.5 py-2 rounded-lg text-xs font-mono font-semibold border transition-all flex items-center gap-2 ${
              ecoFallback
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            {ecoFallback
              ? 'Eco 2D Active (WebGL Unmounted)'
              : 'Preview Eco 2D Fallback'}
          </button>

          <Link
            href="/shop"
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-all flex items-center gap-1.5"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            Add ₹{dfyPriceInr.toLocaleString('en-IN')} DFY 3D Setup
          </Link>
        </div>
      </div>

      {/* Live 4-Device Hardware Toggle Strip (Synced Bidirectionally with 3D Raycast & Eco 2D) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <button
          type="button"
          onClick={() => setLampOn((v) => !v)}
          className={`px-3 py-2 rounded-lg text-xs font-mono border flex items-center justify-between gap-2 transition-all ${
            lampOn
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700'
          }`}
        >
          <span className="inline-flex items-center gap-1.5 truncate">
            <Lightbulb className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Ceiling LED</span>
          </span>
          <span className="font-bold tabular-nums">{lampOn ? 'ON' : 'OFF'}</span>
        </button>

        <button
          type="button"
          onClick={() => handleCycleFan()}
          className={`px-3 py-2 rounded-lg text-xs font-mono border flex items-center justify-between gap-2 transition-all ${
            fanSpeed > 0
              ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
              : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700'
          }`}
        >
          <span className="inline-flex items-center gap-1.5 truncate">
            <Fan className={`w-3.5 h-3.5 shrink-0 ${fanSpeed > 0 ? 'animate-spin' : ''}`} />
            <span className="truncate">Ceiling Fan</span>
          </span>
          <span className="font-bold tabular-nums">
            {fanSpeed > 0 ? `SPD ${fanSpeed}/4` : 'OFF'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setGeyserOn((v) => !v)}
          className={`px-3 py-2 rounded-lg text-xs font-mono border flex items-center justify-between gap-2 transition-all ${
            geyserOn
              ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
              : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700'
          }`}
        >
          <span className="inline-flex items-center gap-1.5 truncate">
            <Flame className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Bath Geyser</span>
          </span>
          <span className="font-bold tabular-nums">{geyserOn ? '2025W' : 'OFF'}</span>
        </button>

        <button
          type="button"
          onClick={() => setPumpOn((v) => !v)}
          className={`px-3 py-2 rounded-lg text-xs font-mono border flex items-center justify-between gap-2 transition-all ${
            pumpOn
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700'
          }`}
        >
          <span className="inline-flex items-center gap-1.5 truncate">
            <Droplets className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Water Pump</span>
          </span>
          <span className="font-bold tabular-nums">
            {pumpOn ? `ON · ${tankLevelPct}%` : `IDLE · ${tankLevelPct}%`}
          </span>
        </button>
      </div>

      {/* Either Real Architectural WebGL 3D Twin OR Zero-GPU Eco 2D Room Grid */}
      {!ecoFallback ? (
        <MiniTwinCanvas
          lampOn={lampOn}
          fanSpeed={fanSpeed}
          geyserOn={geyserOn}
          pumpOn={pumpOn}
          tankLevelPct={tankLevelPct}
          activeFloor={activeFloor}
          xrayWiring={xrayWiring}
          onFloorChange={setActiveFloor}
          onToggleXray={() => setXrayWiring((v) => !v)}
          onToggleLamp={() => setLampOn((v) => !v)}
          onCycleFan={handleCycleFan}
          onToggleGeyser={() => setGeyserOn((v) => !v)}
          onTogglePump={() => setPumpOn((v) => !v)}
        />
      ) : (
        <div className="w-full min-h-[360px] rounded-xl border border-emerald-500/30 bg-slate-950/90 p-5 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-mono font-bold text-emerald-300">
                ECO 2D ROOM GRID (0 MB WebGL GPU Heap · Core Free-Forever Floor)
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              renderer.forceContextLoss() + .dispose() executed
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 my-4">
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span className="font-mono">Living · PWR-01</span>
                <Lightbulb className={`w-4 h-4 ${lampOn ? 'text-amber-400' : 'text-slate-600'}`} />
              </div>
              <div className="text-sm font-bold text-white mb-2">4-Gang Switchboard</div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-400">
                  CH1 Ceiling LED: {lampOn ? 'ON' : 'OFF'}
                </span>
                <button
                  type="button"
                  onClick={() => setLampOn((v) => !v)}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-mono text-cyan-300"
                >
                  Toggle
                </button>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span className="font-mono">Master Bed · PWR-02</span>
                <Fan className={`w-4 h-4 ${fanSpeed > 0 ? 'text-cyan-400 animate-spin' : 'text-slate-600'}`} />
              </div>
              <div className="text-sm font-bold text-white mb-2">Hum-Free Fan Regulator</div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                  Speed: {fanSpeed > 0 ? `Step ${fanSpeed} / 4` : '0 (OFF)'}
                </span>
                <button
                  type="button"
                  onClick={() => handleCycleFan()}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-mono text-cyan-300"
                >
                  Step
                </button>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span className="font-mono">Master Bath · PWR-03</span>
                <Flame className={`w-4 h-4 ${geyserOn ? 'text-rose-400' : 'text-slate-600'}`} />
              </div>
              <div className="text-sm font-bold text-white mb-2">16A Geyser + G9 OLED</div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                  {geyserOn ? '2024.8W · 45m cutoff' : '0.0W · Standby'}
                </span>
                <button
                  type="button"
                  onClick={() => setGeyserOn((v) => !v)}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-mono text-cyan-300"
                >
                  Toggle
                </button>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span className="font-mono">Roof Terrace · WAT-01</span>
                <Droplets className={`w-4 h-4 ${pumpOn ? 'text-emerald-400' : 'text-slate-600'}`} />
              </div>
              <div className="text-sm font-bold text-white mb-2">Overhead Tank & Pump</div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                  Level: {tankLevelPct}% · {pumpOn ? '18.4 L/m' : '0.0 L/m'}
                </span>
                <button
                  type="button"
                  onClick={() => setPumpOn((v) => !v)}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-mono text-cyan-300"
                >
                  Pump
                </button>
              </div>
            </div>
          </div>

          <div className="text-[11px] font-mono text-slate-400 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
            <span>Works smoothly on budget Android devices &amp; 2G/local LAN fallback</span>
            <button
              type="button"
              onClick={() => setEcoFallback(false)}
              className="text-cyan-400 hover:text-cyan-300 underline"
            >
              Re-enable 3D Architectural Twin →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
export default TwinTeaserSection;
