'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowUpRight,
  Car,
  CheckCircle2,
  Droplets,
  Fan,
  Lock,
  Power,
  Radio,
  Router,
  ShieldAlert,
  ToggleRight,
  WifiOff,
  Zap,
} from 'lucide-react';
import {
  evaluateStarterInterlockSafety,
  SAFETY_CONSTANTS,
} from '@/lib/protocol/contract';
import { useLiveStoreCatalog } from '@/lib/catalog/storeSync';
import {
  Badge,
  Button,
  PrecisionSlider,
  SegmentedControl,
  TactileSwitch,
} from '@/components/ui';
import { cn } from '@/lib/utils';

const MiniVeh01Map = dynamic(() => import('./MiniVeh01Map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-44 sm:h-48 rounded-xl border border-slate-800 bg-slate-950/90 flex items-center justify-center text-[11px] font-mono text-slate-400">
      Loading MapLibre GL JS (Churachandpur / Imphal)...
    </div>
  ),
});

export const FlagshipModuleSandboxes: React.FC = () => {
  const { modules } = useLiveStoreCatalog();
  const catalogByCode = useMemo(() => {
    const map: Record<string, (typeof modules)[number]> = {};
    for (const m of modules) {
      map[m.module_code] = m;
    }
    return map;
  }, [modules]);

  const renderModuleFooter = (code: string, physicalSpec: string) => {
    const mod = catalogByCode[code];
    return (
      <div className="pt-2.5 border-t border-border/60 flex items-center justify-between gap-2 text-[11px]">
        <div className="font-mono text-foreground-muted tabular-nums truncate">
          <span>{physicalSpec}</span>
          {mod && (
            <>
              <span aria-hidden="true"> · </span>
              <span className="font-semibold text-foreground">
                ₹{mod.retailInr.toLocaleString('en-IN')}
              </span>
              {mod.installInr > 0 && (
                <span className="text-foreground-muted">
                  {' '}
                  (+₹{mod.installInr} install)
                </span>
              )}
            </>
          )}
        </div>
        <Link
          href={`/shop?highlight=${code}`}
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline shrink-0"
        >
          <span>Shop {code}</span>
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    );
  };

  // 1. PWR-01: 4-Gang Switchboard + manual wall switch override
  const [pwr01, setPwr01] = useState({
    ch1: true,
    ch2: false,
    ch3: true,
    ch4: false,
  });
  const [pwr01Override, setPwr01Override] = useState(false);

  // 2. PWR-02: Hum-free 0-4 Stepped Fan Regulator
  const [fanSpeed, setFanSpeed] = useState<number>(3);
  const [fanLight, setFanLight] = useState<boolean>(true);

  // 3. PWR-03: 16A Meter + G10 Latched Fault + 3s Physical Hold Clear
  const [pwr03On, setPwr03On] = useState<boolean>(true);
  const [pwr03Fault, setPwr03Fault] = useState<string | null>(null);
  const [pwr03HoldPct, setPwr03HoldPct] = useState<number>(0);

  // 4. WAT-01: Overhead Tank + 30s Dry-Run Cutoff
  const [pumpOn, setPumpOn] = useState<boolean>(true);
  const [tankLevel, setTankLevel] = useState<number>(58);
  const [flowLpm, setFlowLpm] = useState<number>(18.4);
  const [watFault, setWatFault] = useState<string | null>(null);
  const [watHoldPct, setWatHoldPct] = useState<number>(0);
  const holdTimersRef = useRef<{ pwr03: number | null; wat: number | null }>({
    pwr03: null,
    wat: null,
  });

  // 5. VEH-01: 6.4G Crash 20s Countdown + G15b Starter Lock
  const [vehSpeed, setVehSpeed] = useState<number>(42);
  const [vehIgnition, setVehIgnition] = useState<boolean>(true);
  const [immobilizeRequested, setImmobilizeRequested] = useState<boolean>(false);
  const [crashSecLeft, setCrashSecLeft] = useState<number | null>(null);
  const [crashEscalated, setCrashEscalated] = useState<boolean>(false);

  // 6. HUB-01: Local Broker & Cut Broadband Offline Rules
  const [hubBroadbandCut, setHubBroadbandCut] = useState<boolean>(false);
  const [hubRulePulseCount, setHubRulePulseCount] = useState<number>(1);

  // Animated water tank level + PWR-03 subtle telemetry shimmer
  useEffect(() => {
    const iv = window.setInterval(() => {
      setTankLevel((prev) => {
        if (pumpOn && !watFault) {
          return prev >= 95 ? 95 : Number((prev + 1.2).toFixed(1));
        }
        return prev <= 25 ? 25 : Number((prev - 0.5).toFixed(1));
      });
    }, 900);
    return () => window.clearInterval(iv);
  }, [pumpOn, watFault]);

  // 20-second Crash SOS Countdown
  useEffect(() => {
    if (crashSecLeft === null || crashSecLeft <= 0) return;
    const t = window.setTimeout(() => {
      if (crashSecLeft <= 1) {
        setCrashSecLeft(0);
        setCrashEscalated(true);
      } else {
        setCrashSecLeft(crashSecLeft - 1);
      }
    }, 1000);
    return () => window.clearTimeout(t);
  }, [crashSecLeft]);

  // Cleanup all hold timers on unmount (strict leak prevention on exit)
  useEffect(() => {
    const timers = holdTimersRef.current;
    return () => {
      if (timers.pwr03) window.clearInterval(timers.pwr03);
      if (timers.wat) window.clearInterval(timers.wat);
    };
  }, []);

  // Physical 3-second hold-to-clear handler for G10 Latched Faults
  const startPhysicalHoldClear = (
    slot: 'pwr03' | 'wat',
    setPct: React.Dispatch<React.SetStateAction<number>>,
    onCleared: () => void
  ) => {
    if (holdTimersRef.current[slot]) {
      window.clearInterval(holdTimersRef.current[slot]!);
    }
    const startedAt = Date.now();
    const holdMs = SAFETY_CONSTANTS.LATCHED_FAULT_CLEAR_HOLD_SEC * 1000;
    holdTimersRef.current[slot] = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.min(100, Math.round((elapsed / holdMs) * 100));
      setPct(pct);
      if (pct >= 100) {
        if (holdTimersRef.current[slot]) {
          window.clearInterval(holdTimersRef.current[slot]!);
        }
        holdTimersRef.current[slot] = null;
        setPct(0);
        onCleared();
      }
    }, 50);
  };

  const cancelPhysicalHold = (
    slot: 'pwr03' | 'wat',
    setPct: React.Dispatch<React.SetStateAction<number>>
  ) => {
    if (holdTimersRef.current[slot]) {
      window.clearInterval(holdTimersRef.current[slot]!);
      holdTimersRef.current[slot] = null;
    }
    setPct(0);
  };

  const fanWatts = fanSpeed === 0 ? 0 : fanSpeed * 18;
  const fanSpinDurationSec = fanSpeed === 0 ? 0 : Math.max(0.32, 2.2 - fanSpeed * 0.44);

  const pwr03Watts = pwr03Fault ? 0 : pwr03On ? 2140 : 0;
  const pwr03Amps = pwr03Fault ? 0 : pwr03On ? 9.3 : 0;
  const pwr03DailyInr = ((pwr03Watts / 1000) * 1.5 * 7.5).toFixed(2);

  const interlockEval = evaluateStarterInterlockSafety(vehSpeed, vehIgnition);
  const effectiveImmobilizeState = !immobilizeRequested
    ? 'RELEASED'
    : interlockEval.targetState;

  return (
    <section id="live-demos" className="py-12 px-3 sm:px-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="text-xs font-mono text-primary tracking-tight">
            01. Phase 1 Flagship 6 · Interactive Hardware Sandboxes · Live v1.4 State Machines
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Test Every Phase 1 Hardware Module Live
          </h2>
          <p className="text-xs sm:text-sm text-foreground-secondary max-w-2xl">
            Every interactive widget below runs the exact Protocol Contract v1.4 state machines:
            G10 physical 3s latch recovery, WAT-01 dry-run protection, G15b vehicle speed interlock,
            and HUB-01 0ms offline rules—with live pricing synced directly from Admin.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* 1. PWR-01: 4-Gang Switchboard */}
        <article className="rounded-2xl border border-border bg-surface p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
              <span className="font-bold text-primary">PWR-01 · CORE-A</span>
              {pwr01Override ? (
                <span className="text-warning font-semibold">wall_switch OVERRIDE</span>
              ) : (
                <span className="text-success font-semibold">SYNCED · 230V AC</span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              4-Gang Switchboard + Wall Sync
            </h3>
            <p className="text-[11px] text-foreground-secondary">
              Toggle rockers remotely or flip a physical Indian wall switch to watch instant state sync.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['ch1', 'Ceiling LED'],
                ['ch2', 'Cove Strip'],
                ['ch3', 'Porch Light'],
                ['ch4', 'TV Socket'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setPwr01Override(false);
                  setPwr01((prev) => ({ ...prev, [key]: !prev[key] }));
                }}
                className={cn(
                  'rounded-xl border p-2.5 text-left transition-all cursor-pointer space-y-1',
                  pwr01[key]
                    ? 'border-primary-border bg-primary-soft/60 text-foreground'
                    : 'border-border bg-surface-elevated text-foreground-secondary'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-foreground-muted">{key.toUpperCase()}</span>
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full',
                      pwr01[key] ? 'bg-primary shadow-[0_0_8px_var(--dd-color-1)]' : 'bg-border-strong'
                    )}
                  />
                </div>
                <div className="text-xs font-medium truncate">{label}</div>
                <div className="font-mono text-[10px] font-bold">
                  {pwr01[key] ? 'ON' : 'OFF'}
                </div>
              </button>
            ))}
          </div>

          <div className="space-y-2.5">
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => {
                setPwr01Override(true);
                setPwr01((prev) => ({ ...prev, ch1: !prev.ch1 }));
              }}
            >
              <ToggleRight className="h-3.5 w-3.5 text-warning" />
              <span>Flip Physical Wall Switch (Ch1)</span>
            </Button>
            {renderModuleFooter('PWR-01', '4M/6M Gang Box')}
          </div>
        </article>

        {/* 2. PWR-02: Hum-Free Stepped Fan Regulator */}
        <article className="rounded-2xl border border-border bg-surface p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
              <span className="font-bold text-primary">PWR-02 · CORE-A</span>
              <span className="text-foreground-secondary">{fanWatts} W · 0 HUM</span>
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              Hum-Free Stepped Fan Regulator (0–4)
            </h3>
            <p className="text-[11px] text-foreground-secondary">
              2-capacitor discrete stepping eliminates annoying 50Hz fan coil buzzing.
            </p>
          </div>

          {/* Animated Spinning Fan Blade Stage */}
          <div className="rounded-xl border border-border bg-surface-elevated p-4 flex items-center justify-between gap-4">
            <div className="relative h-20 w-20 rounded-full border border-border/80 bg-canvas flex items-center justify-center shrink-0">
              <div
                style={
                  fanSpeed > 0
                    ? {
                        animation: `ddSpin ${fanSpinDurationSec}s linear infinite`,
                      }
                    : undefined
                }
                className="flex items-center justify-center"
              >
                <Fan
                  className={cn(
                    'h-12 w-12 transition-colors',
                    fanSpeed > 0 ? 'text-primary' : 'text-foreground-muted'
                  )}
                />
              </div>
            </div>
            <div className="flex-1 space-y-1 font-mono text-xs tabular-nums">
              <div className="text-foreground-muted text-[10px]">STEPPED LEVEL</div>
              <div className="text-lg font-bold text-foreground">
                {fanSpeed === 0 ? 'OFF' : `Step ${fanSpeed} / 4`}
              </div>
              <div className="text-[11px] text-success">
                {fanSpeed === 0 ? 'Motor Idle' : `${fanSpeed * 75} RPM · 2-Cap Sine`}
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <SegmentedControl<string>
              fullWidth
              size="sm"
              ariaLabel="Fan speed step"
              value={String(fanSpeed)}
              onChange={(v) => setFanSpeed(Number(v))}
              options={[
                { value: '0', label: 'OFF' },
                { value: '1', label: '1' },
                { value: '2', label: '2' },
                { value: '3', label: '3' },
                { value: '4', label: '4' },
              ]}
            />
            <TactileSwitch
              label="Warm Cove Lamp (Ch1)"
              checked={fanLight}
              onChange={setFanLight}
            />
            {renderModuleFooter('PWR-02', '2M/4M Gang Box')}
          </div>

          <style>{`
            @keyframes ddSpin {
              from {
                transform: rotate(0deg);
              }
              to {
                transform: rotate(360deg);
              }
            }
          `}</style>
        </article>

        {/* 3. PWR-03: 16A Meter + G10 Overload Latch + 3s Physical Hold */}
        <article className="rounded-2xl border border-border bg-surface p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
              <span className="font-bold text-primary">PWR-03 · CORE-B</span>
              {pwr03Fault ? (
                <span className="text-danger font-bold">G10 LOCKED: {pwr03Fault}</span>
              ) : (
                <span className="text-success font-semibold">45m CEILING LOCKED</span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              16A Geyser Guard &amp; G10 Overload Latch
            </h3>
            <p className="text-[11px] text-foreground-secondary">
              HLW8032 live metering + hard-locked fault cutoff requiring a 3.0s physical button hold.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 font-mono text-center tabular-nums">
            <div className="rounded-xl border border-border bg-surface-elevated p-2">
              <div className="text-[9px] text-foreground-muted">POWER</div>
              <div className="text-xs font-bold text-foreground">{pwr03Watts} W</div>
            </div>
            <div className="rounded-xl border border-border bg-surface-elevated p-2">
              <div className="text-[9px] text-foreground-muted">CURRENT</div>
              <div className="text-xs font-bold text-primary">{pwr03Amps.toFixed(1)} A</div>
            </div>
            <div className="rounded-xl border border-border bg-surface-elevated p-2">
              <div className="text-[9px] text-foreground-muted">EST. COST</div>
              <div className="text-xs font-bold text-tertiary">₹{pwr03DailyInr}/d</div>
            </div>
          </div>

          {pwr03Fault ? (
            <div className="rounded-xl border border-danger/60 bg-danger-soft/60 p-3 space-y-2 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-danger">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                <span>Relay Latched OFF — No Remote Override</span>
              </div>
              <p className="text-[11px] text-foreground-secondary">
                Hold the simulated physical switch button below for 3 full seconds to reset.
              </p>
              <button
                type="button"
                onPointerDown={() =>
                  startPhysicalHoldClear('pwr03', setPwr03HoldPct, () => {
                    setPwr03Fault(null);
                  })
                }
                onPointerUp={() => cancelPhysicalHold('pwr03', setPwr03HoldPct)}
                onPointerLeave={() => cancelPhysicalHold('pwr03', setPwr03HoldPct)}
                onPointerCancel={() => cancelPhysicalHold('pwr03', setPwr03HoldPct)}
                className="relative w-full min-h-[40px] rounded-xl border border-danger bg-surface text-foreground font-mono text-[11px] font-semibold overflow-hidden cursor-pointer select-none"
              >
                <span
                  className="absolute inset-y-0 left-0 bg-success/35 transition-[width] duration-75"
                  style={{ width: `${pwr03HoldPct}%` }}
                />
                <span className="relative z-10">
                  {pwr03HoldPct > 0
                    ? `Holding Physical Button... ${pwr03HoldPct}%`
                    : 'Press & Hold Physical Button (3s)'}
                </span>
              </button>
            </div>
          ) : (
            <TactileSwitch
              label="Geyser 16A Contactor"
              sublabel={pwr03On ? 'Heating Active (Max 45m)' : 'Contactor Open'}
              checked={pwr03On}
              onChange={setPwr03On}
            />
          )}

          <div className="space-y-2.5">
            <Button
              variant="danger"
              size="sm"
              className="w-full"
              disabled={Boolean(pwr03Fault)}
              onClick={() => {
                setPwr03On(false);
                setPwr03Fault('OVERLOAD');
              }}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Trigger Overload (22.4A &gt; 16A)</span>
            </Button>
            {renderModuleFooter('PWR-03', '16A Heavy 2M/4M')}
          </div>
        </article>

        {/* 4. WAT-01: Overhead Water Tank & Dry-Run Protection */}
        <article className="rounded-2xl border border-border bg-surface p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
              <span className="font-bold text-primary">WAT-01 · CORE-A+C</span>
              {watFault ? (
                <span className="text-danger font-bold">{watFault}</span>
              ) : (
                <span className="text-success font-semibold">30s DRY-RUN ARM</span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              Water Tank &amp; Pump Dry-Run Guard
            </h3>
            <p className="text-[11px] text-foreground-secondary">
              Wireless terrace ultrasonic sensor + automatic 30s motor cutoff if pipe runs dry.
            </p>
          </div>

          <div className="flex items-center gap-4 rounded-xl border border-border bg-surface-elevated p-3">
            {/* Translucent Tank Meter */}
            <div className="relative h-24 w-14 rounded-xl border-2 border-border-strong bg-canvas overflow-hidden shrink-0">
              <div
                className="absolute bottom-0 inset-x-0 bg-primary/70 transition-[height] duration-700"
                style={{ height: `${tankLevel}%` }}
              />
              <div className="relative z-10 h-full flex flex-col items-center justify-center font-mono text-xs font-bold text-foreground drop-shadow tabular-nums">
                {Math.round(tankLevel)}%
              </div>
            </div>

            <div className="flex-1 space-y-1.5 font-mono text-[11px] tabular-nums">
              <div className="flex justify-between">
                <span className="text-foreground-muted">FLOW RATE</span>
                <span className={flowLpm > 0 ? 'text-success font-bold' : 'text-danger font-bold'}>
                  {watFault ? '0.0' : pumpOn ? flowLpm.toFixed(1) : '0.0'} L/min
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground-muted">ESP-NOW LINK</span>
                <span className="text-primary">OK (-64 dBm)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground-muted">AUTO FILL</span>
                <span className="text-foreground">25% – 90%</span>
              </div>
            </div>
          </div>

          {watFault ? (
            <button
              type="button"
              onPointerDown={() =>
                startPhysicalHoldClear('wat', setWatHoldPct, () => {
                  setWatFault(null);
                  setFlowLpm(18.4);
                })
              }
              onPointerUp={() => cancelPhysicalHold('wat', setWatHoldPct)}
              onPointerLeave={() => cancelPhysicalHold('wat', setWatHoldPct)}
              onPointerCancel={() => cancelPhysicalHold('wat', setWatHoldPct)}
              className="relative w-full min-h-[40px] rounded-xl border border-danger bg-surface text-foreground font-mono text-[11px] font-semibold overflow-hidden cursor-pointer select-none"
            >
              <span
                className="absolute inset-y-0 left-0 bg-success/35 transition-[width] duration-75"
                style={{ width: `${watHoldPct}%` }}
              />
              <span className="relative z-10">
                {watHoldPct > 0
                  ? `Resetting Dry-Run Latch... ${watHoldPct}%`
                  : 'DRY_RUN_FAULT — Hold 3s Physical Reset'}
              </span>
            </button>
          ) : (
            <TactileSwitch
              label="Submersible Pump Contactor"
              sublabel={pumpOn ? 'Filling Overhead Tank' : 'Standby'}
              checked={pumpOn}
              onChange={(next) => {
                setPumpOn(next);
                setFlowLpm(next ? 18.4 : 0);
              }}
            />
          )}

          <div className="space-y-2.5">
            <Button
              variant="danger"
              size="sm"
              className="w-full"
              disabled={Boolean(watFault)}
              onClick={() => {
                setFlowLpm(0);
                setPumpOn(false);
                setWatFault('DRY_RUN_FAULT');
              }}
            >
              <Droplets className="h-3.5 w-3.5" />
              <span>Test Dry-Run Cutoff (0 L/min · 30s)</span>
            </Button>
            {renderModuleFooter('WAT-01', 'IP65 Tank + Starter')}
          </div>
        </article>

        {/* 5. VEH-01: Real MapLibre GL JS GPS + 6.4G Crash SOS + Starter Solenoid Safety Interlock */}
        <article className="rounded-2xl border border-border bg-surface p-4 flex flex-col justify-between space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
              <span className="font-bold text-primary">VEH-01 · CORE-E</span>
              <span
                className={cn(
                  'font-semibold',
                  effectiveImmobilizeState === 'ENGAGED'
                    ? 'text-danger'
                    : effectiveImmobilizeState === 'PENDING'
                    ? 'text-warning'
                    : 'text-success'
                )}
              >
                STARTER: {effectiveImmobilizeState}
              </span>
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              Live 4G GPS Map, 6.4G Crash SOS &amp; Starter Interlock
            </h3>
            <p className="text-[11px] text-foreground-secondary">
              Real MapLibre GL JS + OpenFreeMap vector tiles (Churachandpur / Imphal). Starter cut stays PENDING above 5 km/h.
            </p>
          </div>

          <MiniVeh01Map
            speedKmh={vehIgnition ? vehSpeed : 0}
            immobilizeState={effectiveImmobilizeState}
            crashActive={crashSecLeft !== null}
          />

          {crashSecLeft !== null ? (
            <div className="rounded-xl border border-danger bg-danger-soft/80 p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between font-bold text-danger">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4" />
                  6.4G CRASH_DETECTED
                </span>
                <span className="font-mono tabular-nums text-sm">
                  {crashEscalated ? 'SOS SENT!' : `${crashSecLeft}s`}
                </span>
              </div>
              <p className="text-[11px] text-foreground">
                {crashEscalated
                  ? 'MSG91 + WhatsApp + Automated Voice Call dispatched to family contacts.'
                  : 'Escalating GPS pin & G-force to emergency contacts unless cancelled.'}
              </p>
              <Button
                variant="primary"
                size="sm"
                className="w-full"
                onClick={() => {
                  setCrashSecLeft(null);
                  setCrashEscalated(false);
                }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>I&apos;m Safe — Cancel SOS</span>
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                  <span className="text-foreground-muted">VEHICLE SPEED</span>
                  <span className="font-bold text-foreground">{vehSpeed} km/h</span>
                </div>
                <PrecisionSlider
                  compact
                  min={0}
                  max={90}
                  step={1}
                  unit=" km/h"
                  value={vehSpeed}
                  ariaLabel="Simulated vehicle speed"
                  onChange={setVehSpeed}
                />
              </div>

              <TactileSwitch
                label="Ignition Key ON"
                checked={vehIgnition}
                onChange={setVehIgnition}
              />

              <div className="rounded-lg border border-border bg-surface-elevated px-2.5 py-1.5 text-[11px] text-foreground-secondary leading-snug">
                {immobilizeRequested
                  ? interlockEval.reason
                  : 'Tap Starter Lock at 42 km/h (PENDING), then drop speed to 0 km/h & turn Ignition OFF (ENGAGED).'}
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={immobilizeRequested ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setImmobilizeRequested((v) => !v)}
              >
                <Car className="h-3.5 w-3.5" />
                <span>{immobilizeRequested ? 'Release Cut' : 'Starter Lock'}</span>
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setCrashEscalated(false);
                  setCrashSecLeft(SAFETY_CONSTANTS.CRASH_SOS_CANCEL_WINDOW_SEC);
                }}
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                <span>Simulate 6.4G Crash</span>
              </Button>
            </div>
            {renderModuleFooter('VEH-01', '12V–72V IP65 Harness')}
          </div>
        </article>

        {/* 6. HUB-01: Local Broker & Cut Broadband Continuity */}
        <article className="rounded-2xl border border-border bg-surface p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
              <span className="font-bold text-primary">HUB-01 · CORE-D</span>
              <span className={cn('font-semibold', hubBroadbandCut ? 'text-warning' : 'text-success')}>
                {hubBroadbandCut ? 'OFFLINE EDGE ACTIVE' : 'CLOUD + LOCAL SYNC'}
              </span>
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              Local Hub · 0ms Internet-Cut Rules
            </h3>
            <p className="text-[11px] text-foreground-secondary">
              Runs Mosquitto MQTT + AES-256-GCM key wrapping (G16b) &amp; up to 64 rules locally.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-surface-elevated p-3 space-y-2.5 text-xs font-mono">
            <div className="flex items-center justify-between">
              <span className="text-foreground-muted">LOCAL CLIENTS</span>
              <span className="text-foreground font-bold">14 Modules</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-foreground-muted">CLOUD LATENCY</span>
              <span className={hubBroadbandCut ? 'text-success font-bold' : 'text-primary font-bold'}>
                {hubBroadbandCut ? '0 ms (Edge Local)' : '28 ms (Synced)'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-foreground-muted">LOCAL RULES FIRED</span>
              <span className="text-accent font-bold tabular-nums">#{hubRulePulseCount}</span>
            </div>
          </div>

          <TactileSwitch
            label={hubBroadbandCut ? 'Broadband Disconnected' : 'Cut Broadband Uplink'}
            sublabel="Proves G17 rules execute locally with zero ISP"
            checked={hubBroadbandCut}
            onChange={(next) => {
              setHubBroadbandCut(next);
              setHubRulePulseCount((c) => c + 1);
            }}
          />

          <div className="space-y-2.5">
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => setHubRulePulseCount((c) => c + 1)}
            >
              {hubBroadbandCut ? (
                <WifiOff className="h-3.5 w-3.5 text-warning" />
              ) : (
                <Router className="h-3.5 w-3.5 text-primary" />
              )}
              <span>Fire Local Rule (WAT-01 → Pump Cut)</span>
            </Button>
            {renderModuleFooter('HUB-01', 'DIN / Tabletop Edge')}
          </div>
        </article>
      </div>
    </section>
  );
};
