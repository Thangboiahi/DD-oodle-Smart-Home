'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const VehicleSafetyWorkspace = dynamic(
  () => import('@/components/map/VehicleSafetyWorkspace').then((m) => m.VehicleSafetyWorkspace),
  {
    ssr: false,
    loading: () => (
      <div className="h-[calc(100dvh-136px)] md:h-[calc(100dvh-96px)] min-h-[480px] rounded-2xl border border-border bg-surface flex items-center justify-center text-xs font-mono text-foreground-muted">
        Loading Live Vehicle Map...
      </div>
    ),
  }
);

export default function VehiclesPage() {
  return <VehicleSafetyWorkspace />;
}
