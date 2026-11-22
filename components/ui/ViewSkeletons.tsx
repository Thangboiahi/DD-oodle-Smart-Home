import React from 'react';
import { Skeleton } from './Skeleton';

export const DeviceCardSkeleton: React.FC<{ variant?: 'switch' | 'power' | 'water' | 'hub' }> = ({
  variant = 'switch',
}) => (
  <div className="rounded-[var(--dd-radius-card)] border border-border bg-surface p-[var(--dd-card-pad)] space-y-3">
    <div className="flex items-start justify-between gap-2">
      <div className="space-y-1.5 flex-1">
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-4 w-14" rounded="sm" />
          <Skeleton className="h-4 w-16" rounded="sm" />
        </div>
        <Skeleton className="h-4 w-36" rounded="sm" />
      </div>
      <div className="flex items-center gap-1">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-8 w-14" />
      </div>
    </div>

    <div className="space-y-2">
      <Skeleton className="h-11 w-full" />
      {variant === 'switch' && <Skeleton className="h-11 w-full" />}
      {variant === 'power' && (
        <div className="rounded-[var(--dd-radius-control)] border border-border/60 bg-surface-elevated p-2.5 space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-3 w-20" rounded="sm" />
            <Skeleton className="h-3 w-12" rounded="sm" />
          </div>
          <Skeleton className="h-1.5 w-full" rounded="full" />
          <div className="grid grid-cols-3 gap-1.5">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      )}
      {variant === 'water' && (
        <div className="rounded-[var(--dd-radius-control)] border border-border/60 bg-surface-elevated p-2.5 space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-3 w-24" rounded="sm" />
            <Skeleton className="h-4 w-14" rounded="sm" />
          </div>
          <Skeleton className="h-2 w-full" rounded="full" />
        </div>
      )}
      {variant === 'hub' && <Skeleton className="h-9 w-full" />}
      <Skeleton className="h-11 w-full" />
    </div>

    <div className="flex items-center justify-between pt-1 border-t border-border/60">
      <Skeleton className="h-3 w-20" rounded="sm" />
      <Skeleton className="h-3 w-16" rounded="sm" />
    </div>
  </div>
);

export const EnergyWaterSummarySkeleton: React.FC = () => (
  <div className="rounded-[var(--dd-radius-card)] border border-border bg-surface p-3.5 space-y-3">
    <div className="flex items-center justify-between">
      <Skeleton className="h-4 w-48" rounded="sm" />
      <Skeleton className="h-5 w-16" rounded="sm" />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 dd-grid-gap">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-[var(--dd-radius-card)] border border-border bg-surface-elevated p-3 space-y-2"
        >
          <Skeleton className="h-3 w-24" rounded="sm" />
          <Skeleton className="h-6 w-20" rounded="sm" />
          <Skeleton className="h-3 w-28" rounded="sm" />
        </div>
      ))}
    </div>
  </div>
);

export const QuickScenesSkeleton: React.FC = () => (
  <div className="rounded-[var(--dd-radius-card)] border border-border bg-surface p-3.5 space-y-3">
    <Skeleton className="h-4 w-44" rounded="sm" />
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  </div>
);

export const RoomTabsSkeleton: React.FC = () => (
  <div className="flex items-center gap-1.5 overflow-hidden">
    {Array.from({ length: 6 }).map((_, i) => (
      <Skeleton key={i} className="h-8 w-24 shrink-0" rounded="full" />
    ))}
  </div>
);

export const DockInspectorSkeleton: React.FC = () => (
  <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
    <DeviceCardSkeleton variant="switch" />
    <Skeleton className="h-32 w-full" />
  </div>
);

export const Stage3DSkeleton: React.FC = () => (
  <div className="rounded-[var(--dd-radius-card)] border border-border bg-surface overflow-hidden">
    <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5 bg-surface-elevated">
      <Skeleton className="h-4 w-40" rounded="sm" />
      <Skeleton className="h-8 w-28" />
    </div>
    <Skeleton className="h-[460px] w-full" rounded="sm" />
  </div>
);

export const DashboardSkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-6 w-24" rounded="full" />
      </div>
      <div className="flex items-center gap-1.5">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
      </div>
    </div>
    <EnergyWaterSummarySkeleton />
    <QuickScenesSkeleton />
    <RoomTabsSkeleton />
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 dd-grid-gap">
      <DeviceCardSkeleton variant="switch" />
      <DeviceCardSkeleton variant="power" />
      <DeviceCardSkeleton variant="water" />
    </div>
  </div>
);

export const DeviceDetailSkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="flex items-center gap-3">
      <Skeleton className="h-8 w-20" />
      <div className="space-y-1.5">
        <Skeleton className="h-5 w-48" rounded="sm" />
        <Skeleton className="h-3 w-64" rounded="sm" />
      </div>
    </div>
    <Skeleton className="h-10 w-full max-w-xl" />
    <div className="grid grid-cols-1 lg:grid-cols-12 dd-grid-gap">
      <div className="lg:col-span-5">
        <DeviceCardSkeleton variant="power" />
      </div>
      <div className="lg:col-span-7">
        <div className="rounded-[var(--dd-radius-card)] border border-border bg-surface p-4 space-y-4">
          <Skeleton className="h-40 w-full" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

export const SetupWizardSkeleton: React.FC = () => (
  <div className="max-w-3xl mx-auto space-y-4">
    <div className="space-y-1.5">
      <Skeleton className="h-5 w-64" rounded="sm" />
      <Skeleton className="h-3.5 w-80" rounded="sm" />
    </div>
    <div className="grid grid-cols-4 gap-1.5">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
    <div className="rounded-[var(--dd-radius-card)] border border-border bg-surface p-4 space-y-4">
      <Skeleton className="h-5 w-52" rounded="sm" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <Skeleton className="h-12 w-full max-w-sm" />
      <div className="flex justify-end">
        <Skeleton className="h-11 w-44" />
      </div>
    </div>
  </div>
);

export const VehicleWorkspaceSkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Skeleton className="h-9 w-52" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-32" />
      </div>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-12 dd-grid-gap">
      <div className="lg:col-span-7">
        <Stage3DSkeleton />
      </div>
      <div className="lg:col-span-5 space-y-3">
        <Skeleton className="h-9 w-full" />
        <div className="rounded-[var(--dd-radius-card)] border border-border bg-surface p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  </div>
);

export const AutomationsSkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="flex items-center justify-between gap-2">
      <Skeleton className="h-6 w-52" rounded="sm" />
      <Skeleton className="h-8 w-36" />
    </div>
    <Skeleton className="h-12 w-full" />
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-10 w-56" />
    </div>
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="rounded-[var(--dd-radius-card)] border border-border bg-surface p-4 space-y-3"
        >
          <Skeleton className="h-4 w-56" rounded="sm" />
          <Skeleton className="h-3 w-80" rounded="sm" />
          <Skeleton className="h-11 w-full" />
        </div>
      ))}
    </div>
  </div>
);

export const BillingSkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="flex items-center justify-between gap-2">
      <Skeleton className="h-6 w-64" rounded="sm" />
      <Skeleton className="h-8 w-72" />
    </div>
    <Skeleton className="h-14 w-full" />
    <Skeleton className="h-40 w-full" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-44 w-full" />
      ))}
    </div>
  </div>
);

export const SettingsSkeleton: React.FC = () => (
  <div className="max-w-4xl mx-auto space-y-4">
    <div className="flex items-center justify-between gap-2">
      <Skeleton className="h-6 w-60" rounded="sm" />
      <Skeleton className="h-8 w-28" />
    </div>
    <Skeleton className="h-10 w-full" />
    <div className="rounded-[var(--dd-radius-card)] border border-border bg-surface p-4 space-y-4">
      <Skeleton className="h-10 w-full" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-36 w-full" />
    </div>
  </div>
);

export const AdminPortalSkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Skeleton className="h-6 w-64" rounded="sm" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-32" />
      </div>
    </div>
    <Skeleton className="h-10 w-full max-w-2xl" />
    <div className="rounded-[var(--dd-radius-card)] border border-border bg-surface p-4 space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  </div>
);

export const AuthSkeleton: React.FC = () => (
  <div className="max-w-md mx-auto my-6 space-y-4">
    <div className="flex flex-col items-center gap-2">
      <Skeleton className="h-16 w-16" rounded="lg" />
      <Skeleton className="h-5 w-48" rounded="sm" />
      <Skeleton className="h-3.5 w-64" rounded="sm" />
    </div>
    <div className="rounded-[var(--dd-radius-card)] border border-border bg-surface p-5 space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  </div>
);
