'use client';

import React from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Car,
  ChevronRight,
  Droplets,
  Play,
  Radio,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { simulatorEngine } from '@/lib/simulator/engine';
import { Badge, Card, triggerHaptic, useToast } from '@/components/ui';
import { useWorkspace } from './WorkspaceProvider';

export interface MonitorMeta {
  id: string;
  title: string;
  description: string;
  category: 'Monitor' | 'Statistics' | 'Controls';
}

export const MONITOR_CATALOG: MonitorMeta[] = [
  {
    id: 'mon_energy',
    title: 'Live Energy & INR Monitor',
    description: 'Real-time total wattage, kWh & daily/monthly INR cost',
    category: 'Monitor',
  },
  {
    id: 'mon_water',
    title: 'Water Tank & Flow Monitor',
    description: 'WAT-01 overhead level, depth cm, flow L/m & link status',
    category: 'Monitor',
  },
  {
    id: 'mon_hub',
    title: 'Hub & Network Health Monitor',
    description: 'Active transport tier, HUB-01 clients & average RSSI',
    category: 'Monitor',
  },
  {
    id: 'mon_vehicle',
    title: 'Vehicle Mini-Status Card',
    description: 'VEH-01 speed, ignition & starter immobilizer state',
    category: 'Monitor',
  },
  {
    id: 'mon_faults',
    title: 'Active Faults & Alerts Strip',
    description: 'Live G10 hardware faults, tank link & Crash SOS summary',
    category: 'Monitor',
  },
  {
    id: 'mon_scenes',
    title: 'Quick Scenes Bar',
    description: '1-tap Indian recipes (Inverter Saver, Geyser, Tank Fill)',
    category: 'Controls',
  },
  {
    id: 'mon_analytics',
    title: 'Energy Analytics Sparkline',
    description: '24h / 30d load curve derived from cumulative NVS kWh',
    category: 'Statistics',
  },
];

export const StandaloneMonitorWidget: React.FC<{ monitorId: string }> = ({ monitorId }) => {
  const { snapshot, prefs } = useWorkspace();
  const { pushToast } = useToast();
  const devicesList = Object.values(snapshot.devices);
  const tariff = prefs.tariffInr || 7.5;

  const totalWatts = devicesList.reduce((acc, d) => {
    const p = d.telemetry as { p?: number };
    return acc + (p?.p ?? 0);
  }, 0);

  const totalKwh = devicesList.reduce((acc, d) => {
    const p = d.telemetry as { kwh?: number };
    return acc + (p?.kwh ?? 0);
  }, 0);

  if (monitorId === 'mon_energy') {
    const dailyInr = (totalKwh * 0.14 * tariff).toFixed(1);
    const monthlyInr = (totalKwh * 0.14 * 30 * tariff).toFixed(0);
    return (
      <Card className="h-full space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-foreground-muted">
          <span>Live Energy &amp; INR</span>
          <Zap className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="text-xl font-semibold font-mono tabular-nums text-foreground">
          {totalWatts.toFixed(0)} <span className="text-xs font-normal text-foreground-muted">W</span>
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-foreground-secondary">
          <span>₹{dailyInr}/day</span>
          <span>Est ₹{monthlyInr}/mo</span>
        </div>
      </Card>
    );
  }

  if (monitorId === 'mon_water') {
    const wat = snapshot.devices['dd_wat01_j1k2l3'];
    const tel = wat?.telemetry as { level_pct?: number; level_cm?: number; flow_lpm?: number; tank_link?: boolean };
    const pct = tel?.level_pct ?? 0;
    return (
      <Card className="h-full space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-foreground-muted">
          <span>Water Tank (WAT-01)</span>
          <Droplets className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xl font-semibold font-mono tabular-nums text-foreground">{pct}%</span>
          <span className="text-[11px] font-mono text-foreground-muted tabular-nums">
            {tel?.level_cm ?? Math.round(pct * 2)} cm
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-surface-muted overflow-hidden">
          <div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-foreground-secondary">
          <span>Flow: {(tel?.flow_lpm ?? 0).toFixed(1)} L/m</span>
          {tel?.tank_link === false ? (
            <Badge variant="danger">LINK LOST</Badge>
          ) : (
            <Badge variant="success">LINK OK</Badge>
          )}
        </div>
      </Card>
    );
  }

  if (monitorId === 'mon_hub') {
    const onlineCount = devicesList.filter((d) => d.status === 'online').length;
    const avgRssi = devicesList.length
      ? Math.round(devicesList.reduce((acc, d) => acc + d.state.rssi, 0) / devicesList.length)
      : -60;
    return (
      <Card className="h-full space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-foreground-muted">
          <span>Hub &amp; Network Health</span>
          <Radio className="h-3.5 w-3.5 text-tertiary" />
        </div>
        <div className="text-xl font-semibold font-mono tabular-nums text-foreground">
          {onlineCount} / {devicesList.length}{' '}
          <span className="text-xs font-normal text-foreground-muted">Online</span>
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono text-foreground-secondary tabular-nums">
          <span>{snapshot.activeTransport}</span>
          <span>Avg {avgRssi} dBm</span>
        </div>
      </Card>
    );
  }

  if (monitorId === 'mon_vehicle') {
    const veh = snapshot.devices['dd_veh01_m4n5p6'];
    const tel = veh?.telemetry as { speed_kmh?: number; ignition?: boolean; bat_pct?: number };
    const immobilize = veh?.state.immobilize ?? 'RELEASED';
    return (
      <Card className="h-full space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-foreground-muted">
          <span>Vehicle Safety (VEH-01)</span>
          <Car className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="flex items-baseline justify-between font-mono tabular-nums">
          <span className="text-xl font-semibold text-foreground">
            {(tel?.speed_kmh ?? 0).toFixed(0)} <span className="text-xs font-normal text-foreground-muted">km/h</span>
          </span>
          <Badge variant={immobilize === 'ENGAGED' ? 'danger' : 'neutral'}>{immobilize}</Badge>
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono text-foreground-secondary">
          <span>{tel?.ignition ? 'IGN ON' : 'PARKED'} · {tel?.bat_pct ?? 95}%</span>
          <Link href="/vehicles" className="inline-flex items-center gap-0.5 text-primary hover:underline">
            <span>Map</span>
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </Card>
    );
  }

  if (monitorId === 'mon_faults') {
    const faultDevs = devicesList.filter((d) => d.state.fault !== null);
    const hasSos =
      snapshot.activeCrashSos && snapshot.activeCrashSos.status !== 'cancelled_by_user';
    return (
      <Card className="h-full space-y-2">
        <div className="flex items-center justify-between text-[11px] text-foreground-muted">
          <span>Active Faults &amp; Safety</span>
          <AlertTriangle
            className={`h-3.5 w-3.5 ${faultDevs.length > 0 || hasSos ? 'text-danger' : 'text-success'}`}
          />
        </div>
        {faultDevs.length === 0 && !hasSos ? (
          <div className="text-xs font-mono text-success">All hardware modules nominal.</div>
        ) : (
          <div className="space-y-1">
            {hasSos && <Badge variant="danger">CRASH_DETECTED ACTIVE</Badge>}
            {faultDevs.map((fd) => (
              <div key={fd.device_id} className="text-[11px] font-mono text-danger truncate">
                {fd.name}: {fd.state.fault}
              </div>
            ))}
          </div>
        )}
      </Card>
    );
  }

  if (monitorId === 'mon_scenes') {
    const runScene = (id: string, label: string) => {
      triggerHaptic('step', prefs.hapticsEnabled);
      if (id === 'inverter_saver') {
        simulatorEngine.sendCommand('dd_pwr03_g7h8i9', { ch1: false }, 'rule');
      } else if (id === 'geyser_morning') {
        simulatorEngine.sendCommand('dd_pwr03_g7h8i9', { ch1: true }, 'rule');
      } else if (id === 'tank_fill') {
        simulatorEngine.sendCommand('dd_wat01_j1k2l3', { pump_on: true }, 'rule');
      } else if (id === 'porch_lights') {
        const pwr01 = snapshot.devices['dd_pwr01_a1b2c3'];
        simulatorEngine.sendCommand('dd_pwr01_a1b2c3', { ch3: !pwr01?.state.state.ch3 }, 'rule');
      }
      pushToast({
        title: `Scene Executed: ${label}`,
        description: `Dispatched via ${snapshot.activeTransport}`,
        tone: 'success',
      });
    };

    return (
      <Card className="h-full space-y-2.5">
        <div className="flex items-center justify-between text-[11px] text-foreground-muted">
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <Play className="h-3.5 w-3.5 text-primary" />
            <span>1-Tap Indian Quick Scenes</span>
          </span>
          <Badge variant="mono">OFFLINE READY</Badge>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { id: 'inverter_saver', label: 'Inverter Saver', sub: 'Cut Geyser' },
            { id: 'geyser_morning', label: 'Morning Geyser', sub: '45m Auto-Off' },
            { id: 'tank_fill', label: 'Fill Tank', sub: 'Dry-Run Guard' },
            { id: 'porch_lights', label: 'Porch Lights', sub: 'PWR-01 Ch3' },
          ].map((rec) => (
            <button
              key={rec.id}
              type="button"
              onClick={() => runScene(rec.id, rec.label)}
              className="min-h-[44px] flex flex-col items-start justify-center rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated hover:border-primary-border px-2.5 py-1.5 text-left transition-colors cursor-pointer"
            >
              <span className="text-xs font-medium text-foreground">{rec.label}</span>
              <span className="text-[10px] text-foreground-muted">{rec.sub}</span>
            </button>
          ))}
        </div>
      </Card>
    );
  }

  // mon_analytics
  const pts = [28, 34, 31, 45, 62, 54, 48, 70, 64, 52, 41, Math.max(20, Math.min(95, totalWatts / 25))];
  const svgPts = pts
    .map((v, i) => `${((i / (pts.length - 1)) * 220).toFixed(1)},${(44 - (v / 100) * 38).toFixed(1)}`)
    .join(' ');

  return (
    <Card className="h-full space-y-2">
      <div className="flex items-center justify-between text-[11px] text-foreground-muted">
        <span className="inline-flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-tertiary" />
          <span>Load Analytics (NVS)</span>
        </span>
        <span className="font-mono text-foreground tabular-nums">{totalKwh.toFixed(2)} kWh</span>
      </div>
      <svg viewBox="0 0 220 46" className="w-full h-11 overflow-visible" role="img" aria-label="Energy analytics sparkline">
        <polyline
          fill="none"
          stroke="var(--dd-color-3)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={svgPts}
        />
      </svg>
      <div className="flex items-center justify-between text-[10px] font-mono text-foreground-muted tabular-nums">
        <span>Tariff: ₹{tariff.toFixed(2)}/kWh</span>
        <span className="inline-flex items-center gap-1 text-primary">
          <Activity className="h-3 w-3" /> Live
        </span>
      </div>
    </Card>
  );
};
