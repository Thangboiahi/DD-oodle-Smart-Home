'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui';
import { VehicleSafetyWorkspace } from '@/components/map/VehicleSafetyWorkspace';

export default function VehicleDetailPage() {
  const params = useParams<{ deviceId: string }>();
  const deviceId = decodeURIComponent(params?.deviceId ?? 'dd_veh01_m4n5p6');

  return (
    <div className="space-y-3">
      <div>
        <Link href="/vehicles">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>All Vehicles</span>
          </Button>
        </Link>
      </div>
      <VehicleSafetyWorkspace initialDeviceId={deviceId} />
    </div>
  );
}
