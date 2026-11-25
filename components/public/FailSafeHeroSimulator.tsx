'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Bluetooth,
  CheckCircle2,
  Cloud,
  Cpu,
  Lightbulb,
  Power,
  Router,
  ShieldCheck,
  ShoppingBag,
  ToggleRight,
  WifiOff,
  Zap,
} from 'lucide-react';
import { OperationMode } from '@/lib/protocol/contract';
import { Badge, Button, TactileSwitch } from '@/components/ui';
import { cn } from '@/lib/utils';

export const FailSafeHeroSimulator: React.FC = () => {
  const [internetCut, setInternetCut] = useState(false);
  const [wifiCut, setWifiCut] = useState(false);
  const [mainsCut, setMainsCut] = useState(false);
  const [porchLight, setPorchLight] = useState(true);
  const [livingFanOn, setLivingFanOn] = useState(true);
  const [wallOverrideFlash, setWallOverrideFlash] = useState(false);

  useEffect(() => {
    if (!wallOverrideFlash) return;
    const t = window.setTimeout(() => setWallOverrideFlash(false), 1800);
    return () => window.clearTimeout(t);
  }, [wallOverrideFlash]);

  const activeMode: OperationMode = mainsCut
    ? 'FAILSAFE_MANUAL'
    : wifiCut
    ? 'BLE_ONLY'
    : internetCut
    ? 'LOCAL_HUB'
    : 'CLOUD_DIRECT';

  const modeMeta: Record<
    OperationMode,
    { label: string; sub: string; latency: string; icon: React.ReactNode; tone: 'success' | 'accent' | 'warning' }
  > = {
    CLOUD_DIRECT: {
      label: 'Cloud MQTT + RTDB',
      sub: 'Remote access from anywhere in India via EMQX + Firebase mirror',
      latency: '26 ms',
      icon: <Cloud className="h-4 w-4 text-primary" />,
      tone: 'success',
    },
    LOCAL_HUB: {
      label: 'HUB-01 Offline LAN',
      sub: 'Broadband down: HUB-01 executes local MQTT & 64 rules on Wi-Fi LAN',
      latency: '2 ms',
      icon: <Router className="h-4 w-4 text-accent" />,
      tone: 'accent',
    },
    LAN_ONLY: {
      label: 'Direct Port 80 LAN',
      sub: 'Zero cloud mode: Top-level Port 80 HTTP/WS authenticated with G7 PIN',
      latency: '3 ms',
      icon: <Router className="h-4 w-4 text-accent" />,
      tone: 'accent',
    },
    BLE_ONLY: {
      label: 'Direct Web Bluetooth GATT',
      sub: 'Router dead: PWA talks directly to DD_OODLE_CTRL encrypted BLE characteristic',
      latency: '14 ms',
      icon: <Bluetooth className="h-4 w-4 text-warning" />,
      tone: 'warning',
    },
    FAILSAFE_MANUAL: {
      label: 'Physical Wall Switch / Inverter',
      sub: 'Total power or radio failure: mechanical rockers stay 100% tactile & safe',
      latency: '0 ms',
      icon: <ToggleRight className="h-4 w-4 text-success" />,
      tone: 'success',
    },
  };

  const active = modeMeta[activeMode];

  const handlePhysicalWallFlip = () => {
    setPorchLight((v) => !v);
    setWallOverrideFlash(true);
  };

  return (
    <section
      id="fail-safe"
      className="relative overflow-hidden border-b border-border/70 bg-gradient-to-b from-surface/70 to-canvas py-10 sm:py-14 px-3 sm:px-6"
    >
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
        {/* Left Hero Value Prop */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: 'easeOut' }}
          className="lg:col-span-6 space-y-5"
        >
          <div className="inline-flex flex-wrap items-center gap-2">
            <Badge variant="accent">PROTOCOL CONTRACT v1.4</Badge>
            <Badge variant="success">
              <ShieldCheck className="h-3 w-3" />
              <span>CORE FREE FOREVER</span>
            </Badge>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-tight text-foreground leading-[1.12]">
            Smart Home &amp; Vehicle Safety That{' '}
            <span className="text-primary">Never Bricks Offline.</span>
          </h1>

          <p className="text-sm sm:text-base text-foreground-secondary leading-relaxed max-w-xl">
            Engineered for Indian 230V modular gang boxes, inverter power cuts, and rural 4G drops.
            Drop straight from Cloud to Local Hub, Direct Bluetooth, or physical wall rockers in milliseconds—with
            zero mandatory subscription lock-in.
          </p>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <a href="#live-demos">
              <Button variant="primary" touchTarget className="px-5">
                <Zap className="h-4 w-4" />
                <span>Try Live v1.4 Sandboxes</span>
              </Button>
            </a>
            <Link href="/shop">
              <Button variant="secondary" touchTarget className="px-5">
                <ShoppingBag className="h-4 w-4" />
                <span>Configure &amp; Get Quote</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 text-[11px] font-mono text-foreground-muted max-w-md">
            <div className="rounded-xl border border-border/70 bg-surface/80 px-2.5 py-2">
              <div className="font-bold text-foreground">4-Tier</div>
              <div>Fail-Safe Path</div>
            </div>
            <div className="rounded-xl border border-border/70 bg-surface/80 px-2.5 py-2">
              <div className="font-bold text-primary">42 Modules</div>
              <div>Capability UI</div>
            </div>
            <div className="rounded-xl border border-border/70 bg-surface/80 px-2.5 py-2">
              <div className="font-bold text-success">20s SOS</div>
              <div>Crash Protection</div>
            </div>
          </div>
        </motion.div>

        {/* Right Interactive 4-Tier Outage Simulator */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.36, delay: 0.06, ease: 'easeOut' }}
          className="lg:col-span-6 rounded-2xl border border-border-strong bg-surface p-4 sm:p-5 shadow-2xl space-y-4"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap border-b border-border/70 pb-3">
            <div>
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Cpu className="h-4 w-4 text-primary" />
                <span>Interactive 4-Tier Fail-Safe Outage Simulator</span>
              </div>
              <p className="text-[11px] text-foreground-muted mt-0.5">
                Simulate real Indian home outages below and test switches live.
              </p>
            </div>
            <Badge variant={active.tone} dot pulse>
              {activeMode}
            </Badge>
          </div>

          {/* Active Transport Readout Card */}
          <div className="rounded-xl border border-primary-border bg-primary-soft/50 p-3 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-surface border border-border flex items-center justify-center shrink-0">
                {active.icon}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground">{active.label}</div>
                <div className="text-[11px] text-foreground-secondary leading-snug mt-0.5">
                  {active.sub}
                </div>
              </div>
            </div>
            <div className="text-right font-mono shrink-0">
              <div className="text-[9px] text-foreground-muted">RESPONSE</div>
              <div className="text-xs font-bold text-primary tabular-nums">{active.latency}</div>
            </div>
          </div>

          {/* Simulated Outage Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setInternetCut((v) => !v)}
              className={cn(
                'rounded-xl border px-3 py-2.5 text-left text-xs transition-colors cursor-pointer',
                internetCut
                  ? 'border-danger/60 bg-danger-soft/60 text-foreground'
                  : 'border-border bg-surface-elevated text-foreground-secondary hover:text-foreground'
              )}
            >
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span>FIBER / 4G WAN</span>
                <WifiOff className={cn('h-3.5 w-3.5', internetCut ? 'text-danger' : 'text-foreground-muted')} />
              </div>
              <div className="font-semibold mt-1">
                {internetCut ? 'Internet Cut' : 'Cut Internet'}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setWifiCut((v) => !v)}
              className={cn(
                'rounded-xl border px-3 py-2.5 text-left text-xs transition-colors cursor-pointer',
                wifiCut
                  ? 'border-warning/60 bg-warning-soft/70 text-foreground'
                  : 'border-border bg-surface-elevated text-foreground-secondary hover:text-foreground'
              )}
            >
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span>HOME ROUTER</span>
                <Bluetooth className={cn('h-3.5 w-3.5', wifiCut ? 'text-warning' : 'text-foreground-muted')} />
              </div>
              <div className="font-semibold mt-1">{wifiCut ? 'Wi-Fi Down' : 'Cut Wi-Fi'}</div>
            </button>

            <button
              type="button"
              onClick={() => setMainsCut((v) => !v)}
              className={cn(
                'rounded-xl border px-3 py-2.5 text-left text-xs transition-colors cursor-pointer',
                mainsCut
                  ? 'border-accent bg-accent-soft text-foreground'
                  : 'border-border bg-surface-elevated text-foreground-secondary hover:text-foreground'
              )}
            >
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span>GRID POWER</span>
                <Power className={cn('h-3.5 w-3.5', mainsCut ? 'text-accent' : 'text-foreground-muted')} />
              </div>
              <div className="font-semibold mt-1">{mainsCut ? 'Mains Cut' : 'Cut Mains Power'}</div>
            </button>
          </div>

          {/* Always-Responsive Live Controls */}
          <div className="rounded-xl border border-border bg-surface-elevated/70 p-3 space-y-2.5">
            <div className="flex items-center justify-between text-[11px] font-mono text-foreground-muted">
              <span>LIVE TEST CONTROLS ({activeMode})</span>
              {wallOverrideFlash ? (
                <span className="text-success inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> manual_override: true
                </span>
              ) : (
                <span>Zero Cloud Lockout</span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <TactileSwitch
                label="Porch LED (Ch1)"
                sublabel={porchLight ? 'Energized' : 'Standby'}
                checked={porchLight}
                onChange={setPorchLight}
              />
              <TactileSwitch
                label="Living Fan (Relay)"
                sublabel={livingFanOn ? 'Spinning · 42W' : 'Stopped'}
                checked={livingFanOn}
                onChange={setLivingFanOn}
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1.5 text-[11px] text-foreground-secondary">
                <Lightbulb className={cn('h-3.5 w-3.5', porchLight ? 'text-warning' : 'text-foreground-muted')} />
                <span>Physical 6A wall switch stays wired in parallel:</span>
              </div>
              <Button variant="outline" size="sm" onClick={handlePhysicalWallFlip}>
                Flip Wall Switch
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
