'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui';

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

export default function VehicleDetailPage() {
  const params = useParams<{ deviceId: string }>();
  const router = useRouter();
  const deviceId = decodeURIComponent(params?.deviceId ?? 'dd_veh01_m4n5p6');

  return (
    <div className="space-y-3">
      <div>
        <Link href="/console/vehicles">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>All Vehicles</span>
          </Button>
        </Link>
      </div>
      <VehicleSafetyWorkspace
        initialDeviceId={deviceId}
        compactTopOffset
        onSelectVehicle={(nextId) => {
          if (nextId !== deviceId) {
            router.replace(`/console/vehicles/${encodeURIComponent(nextId)}`);
          }
        }}
      />
    </div>
  );
}
