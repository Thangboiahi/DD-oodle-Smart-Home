import React from 'react';
import { requireServerRole } from '@/lib/auth/serverGuard';
import { InstallerShell } from '@/components/installer/InstallerShell';

export const dynamic = 'force-dynamic';

export default async function InstallerGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireServerRole(['installer', 'admin'], '/installer');
  return <InstallerShell session={session}>{children}</InstallerShell>;
}
