'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Cpu, Layers } from 'lucide-react';
import { MODULE_CATEGORIES, ModuleCategory } from '@/lib/catalog/hardwareRegistry';
import { useLiveStoreCatalog } from '@/lib/catalog/storeSync';
import { Badge, Button } from '@/components/ui';
import { cn } from '@/lib/utils';

export const EcosystemExplorer: React.FC = () => {
  const { visibleModules } = useLiveStoreCatalog();
  const [selectedCat, setSelectedCat] = useState<'ALL' | ModuleCategory>('ALL');

  const phase23Modules = visibleModules.filter((m) => m.phase >= 2);
  const filtered =
    selectedCat === 'ALL'
      ? phase23Modules
      : phase23Modules.filter((m) => m.category === selectedCat);

  return (
    <section id="ecosystem" className="py-12 px-3 sm:px-6 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="accent">
              <Layers className="h-3 w-3" />
              <span>FULL 42-MODULE ROADMAP</span>
            </Badge>
            <Badge variant="mono">ZERO REWRITE UI ENGINE</Badge>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Phase 2 &amp; 3 Modular Ecosystem ({phase23Modules.length} Modules)
          </h2>
          <p className="text-xs sm:text-sm text-foreground-secondary max-w-2xl">
            Every expansion node—smart locks, LPG leak sensors, mmWave fall radar, or 3-phase meters—renders
            automatically from its v1.4 <code className="font-mono text-primary">capabilities[]</code> schema
            and reflects live Admin pricing &amp; availability.
          </p>
        </div>

        <Link href="/shop?phase=23">
          <Button variant="secondary" size="sm">
            <span>Pre-Book in Shop</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>

      {/* Category Filter Strip */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar snap-strip pb-1">
        <button
          type="button"
          onClick={() => setSelectedCat('ALL')}
          className={cn(
            'snap-start shrink-0 rounded-full border px-3 h-8 text-xs font-medium transition-colors cursor-pointer',
            selectedCat === 'ALL'
              ? 'border-accent-border bg-accent-soft text-accent'
              : 'border-border bg-surface text-foreground-secondary hover:text-foreground'
          )}
        >
          All Categories ({phase23Modules.length})
        </button>

        {MODULE_CATEGORIES.map((cat) => {
          const count = phase23Modules.filter((m) => m.category === cat).length;
          if (count === 0) return null;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCat(cat)}
              className={cn(
                'snap-start shrink-0 rounded-full border px-3 h-8 text-xs font-medium transition-colors cursor-pointer',
                selectedCat === cat
                  ? 'border-accent-border bg-accent-soft text-accent'
                  : 'border-border bg-surface text-foreground-secondary hover:text-foreground'
              )}
            >
              {cat} ({count})
            </button>
          );
        })}
      </div>

      {/* Responsive Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((mod) => (
          <div
            key={mod.module_code}
            className="rounded-2xl border border-border bg-surface p-4 flex flex-col justify-between space-y-3 hover:border-border-strong transition-colors"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Badge variant="accent">{mod.module_code}</Badge>
                  <span className="text-[10px] font-mono text-foreground-muted">
                    P{mod.phase} · {mod.core_platform}
                  </span>
                </div>
                <Badge
                  variant={
                    mod.availability === 'IN_STOCK'
                      ? 'success'
                      : mod.availability === 'PRE_ORDER'
                      ? 'warning'
                      : 'mono'
                  }
                >
                  {mod.availability.replace('_', ' ')}
                </Badge>
              </div>

              <h3 className="text-sm font-semibold text-foreground">{mod.name}</h3>
              <p className="text-[11px] text-foreground-secondary leading-relaxed">
                {mod.tagline}
              </p>

              {/* Live v1.4 Capability Preview Chips */}
              <div className="flex flex-wrap gap-1 pt-1">
                {mod.capabilities.slice(0, 4).map((cap) => (
                  <span
                    key={cap.key}
                    className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-surface-elevated px-2 py-0.5 text-[10px] font-mono text-foreground-secondary"
                  >
                    <Cpu className="h-2.5 w-2.5 text-primary" />
                    <span>{cap.type}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-2.5 border-t border-border/60 flex items-center justify-between text-xs">
              <div className="font-mono tabular-nums">
                <span className="font-bold text-foreground">
                  ₹{mod.retailInr.toLocaleString('en-IN')}
                </span>
                <span className="text-[10px] text-foreground-muted ml-1">est.</span>
              </div>
              <Link
                href={`/shop?highlight=${encodeURIComponent(mod.module_code)}`}
                className="text-[11px] font-medium text-accent hover:underline"
              >
                Add to Quote →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
