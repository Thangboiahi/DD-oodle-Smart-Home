import React from 'react';
import { verifyServerSession } from '@/lib/auth/serverGuard';

export default async function InstallerPagePlaceholder() {
  const session = await verifyServerSession();
  return (
    <div className="max-w-3xl mx-auto py-8 text-xs text-foreground-secondary font-mono">
      Installer Portal session ready for {session?.name} — full linking &amp; conditional 3D flow lands in Milestone 4.
    </div>
  );
}
