'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Box, Fan, Flame, LayoutGrid, Lightbulb, Sparkles } from 'lucide-react';
import { useThemeEngine } from '@/components/theme/ThemeEngineProvider';
import { useLiveStoreCatalog } from '@/lib/catalog/storeSync';
import { Badge, Button, TactileSwitch } from '@/components/ui';

const MiniTwinCanvas = dynamic(
  () => import('./MiniTwinCanvas').then((m) => m.MiniTwinCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-64 sm:h-72 rounded-xl border border-border bg-surface-elevated flex items-center justify-center text-xs font-mono text-foreground-muted">
        Initializing Three.js 3D Room Teaser...
      </div>
    ),
  }
);

export const TwinTeaserSection: React.FC = () => {
  const { resolvedLightMode } = useThemeEngine();
  const { storeConfig } = useLiveStoreCatalog();
  const [eco2D, setEco2D] = useState(false);
  const [lampOn, setLampOn] = useState(true);
  const [fanSpin, setFanSpin] = useState(true);
  const [geyserOn, setGeyserOn] = useState(false);

  return (
    <section id="twin-3d" className="py-12 px-3 sm:px-6 max-w-6xl mx-auto">
      <div className="rounded-2xl border border-border-strong bg-surface p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="accent">
              <Sparkles className="h-3 w-3" />
              <span>₹{storeConfig.dfy3dPriceInr} DONE-FOR-YOU</span>
            </Badge>
            <Badge variant="mono">1BHK · 2BHK · 3BHK · DUPLEX</Badge>
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Interactive 3D Home Twin + Eco 2D Grid
          </h2>
          <p className="text-xs sm:text-sm text-foreground-secondary leading-relaxed">
            Our field installer builds your exact Indian floorplan on-site during installation—place
            lights, ceiling fans, 16A geysers, and rooftop tanks in 3D. Budget phone or low battery?
            Switch to crisp Eco 2D Grid with zero GPU lag.
          </p>

          <div className="space-y-2 pt-1">
            <TactileSwitch
              label="Ceiling LED Fixture"
              checked={lampOn}
              onChange={setLampOn}
            />
            <TactileSwitch
              label="Living Room Ceiling Fan"
              checked={fanSpin}
              onChange={setFanSpin}
            />
            <TactileSwitch
              label="Bath Geyser (PWR-03)"
              checked={geyserOn}
              onChange={setGeyserOn}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEco2D((v) => !v)}
            >
              {eco2D ? <Box className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
              <span>{eco2D ? 'Switch to 3D Canvas' : 'Preview Eco 2D Fallback'}</span>
            </Button>

            <Link href="/shop?dfy3d=1">
              <Button variant="primary" size="sm">
                <span>Add ₹{storeConfig.dfy3dPriceInr} DFY 3D in Shop →</span>
              </Button>
            </Link>
          </div>
        </div>

        <div className="lg:col-span-7">
          {eco2D ? (
            <div className="h-64 sm:h-72 rounded-xl border border-border bg-surface-elevated p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs font-mono text-foreground-muted">
                <span>ECO 2D ROOM GRID · 0% WEBGL GPU</span>
                <Badge variant="success">BATTERY SAVER</Badge>
              </div>
              <div className="grid grid-cols-3 gap-3 my-auto">
                <button
                  type="button"
                  onClick={() => setLampOn((v) => !v)}
                  className="rounded-xl border border-border bg-surface p-3 text-left space-y-1 cursor-pointer"
                >
                  <Lightbulb className={`h-5 w-5 ${lampOn ? 'text-warning' : 'text-foreground-muted'}`} />
                  <div className="text-xs font-semibold">Ceiling LED</div>
                  <div className="text-[10px] font-mono text-foreground-muted">{lampOn ? 'ON' : 'OFF'}</div>
                </button>
                <button
                  type="button"
                  onClick={() => setFanSpin((v) => !v)}
                  className="rounded-xl border border-border bg-surface p-3 text-left space-y-1 cursor-pointer"
                >
                  <Fan className={`h-5 w-5 ${fanSpin ? 'text-primary' : 'text-foreground-muted'}`} />
                  <div className="text-xs font-semibold">Ceiling Fan</div>
                  <div className="text-[10px] font-mono text-foreground-muted">{fanSpin ? 'SPINNING' : 'OFF'}</div>
                </button>
                <button
                  type="button"
                  onClick={() => setGeyserOn((v) => !v)}
                  className="rounded-xl border border-border bg-surface p-3 text-left space-y-1 cursor-pointer"
                >
                  <Flame className={`h-5 w-5 ${geyserOn ? 'text-danger' : 'text-foreground-muted'}`} />
                  <div className="text-xs font-semibold">16A Geyser</div>
                  <div className="text-[10px] font-mono text-foreground-muted">{geyserOn ? 'HEATING' : 'OFF'}</div>
                </button>
              </div>
              <div className="text-[11px] font-mono text-foreground-muted">
                Tap any fixture card above to toggle identically in 2D or 3D.
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <MiniTwinCanvas
                lampOn={lampOn}
                fanSpin={fanSpin}
                geyserOn={geyserOn}
                isLightMode={resolvedLightMode}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
