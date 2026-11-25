'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { ArrowRight, CheckCircle2, Flame, ShieldCheck, Wrench } from 'lucide-react';
import { FailSafeHeroSimulator } from '@/components/public/FailSafeHeroSimulator';
import { FlagshipModuleSandboxes } from '@/components/public/FlagshipModuleSandboxes';
import { TwinTeaserSection } from '@/components/public/TwinTeaserSection';
import { EcosystemExplorer } from '@/components/public/EcosystemExplorer';
import { Badge, Button } from '@/components/ui';

export default function PublicLandingPage() {
  return (
    <div className="pb-12">
      {/* 1. Hero & Interactive 4-Tier Fail-Safe Simulator */}
      <FailSafeHeroSimulator />

      {/* 2. Phase 1 Flagship 6 Interactive Animated Module Sandboxes */}
      <FlagshipModuleSandboxes />

      {/* 3. Lazy-Loaded Interactive 3D Twin Teaser + Eco 2D Fallback */}
      <TwinTeaserSection />

      {/* 4. Phase 2 & 3 Ecosystem Explorer (All 36 Expansion Modules) */}
      <EcosystemExplorer />

      {/* 5. Closing Conversion Section — "Get Yours (Be Smart)" */}
      <section className="py-10 px-3 sm:px-6 max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="rounded-3xl border border-primary-border bg-gradient-to-br from-surface via-surface to-primary-soft/40 p-6 sm:p-10 space-y-6 shadow-xl"
        >
          <div className="max-w-2xl space-y-3">
            <Badge variant="success">
              <ShieldCheck className="h-3 w-3" />
              <span>ZERO SUBSCRIPTION LOCK-IN GUARANTEE</span>
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Get Yours (Be Smart) — Engineered for Indian Homes
            </h2>
            <p className="text-xs sm:text-sm text-foreground-secondary leading-relaxed">
              Every module drops behind existing Anchor, Legrand, Schneider, or Roma plates without
              breaking plaster—paired with local installer commissioning and our lifetime Core
              offline control floor.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {[
              {
                icon: <CheckCircle2 className="h-4 w-4 text-primary" />,
                title: 'Indian Gang-Box Fitment',
                desc: 'Fits concealed 2M/4M/6M/8M boxes and preserves existing physical wall rockers.',
              },
              {
                icon: <Flame className="h-4 w-4 text-warning" />,
                title: 'UL94 V-0 Safety & Cutoffs',
                desc: 'Flame-retardant polycarbonate + hard-locked geyser 45m & pump dry-run protection.',
              },
              {
                icon: <Wrench className="h-4 w-4 text-accent" />,
                title: 'Local Technician Setup',
                desc: 'Optional field commissioning + ₹999 on-site Done-For-You 3D Home Twin mapping.',
              },
              {
                icon: <ShieldCheck className="h-4 w-4 text-success" />,
                title: 'Core Free Forever',
                desc: 'Cloud, Local Hub, Port 80 LAN, Direct BLE, 2D Grid & safety cutoffs never expire.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-border bg-surface/85 p-3.5 space-y-1.5"
              >
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  {item.icon}
                  <span>{item.title}</span>
                </div>
                <p className="text-[11px] text-foreground-secondary leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-border/60">
            <div className="text-xs font-mono text-foreground-muted">
              Instant WhatsApp quote with itemized MRP, installation &amp; optional subscription.
            </div>
            <Link href="/shop">
              <Button variant="primary" touchTarget className="px-6 text-sm font-semibold">
                <span>Get Yours (Be Smart)</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
