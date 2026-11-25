import React from 'react';
import { verifyServerSession } from '@/lib/auth/serverGuard';
import { PublicShell } from '@/components/public/PublicShell';

export const dynamic = 'force-dynamic';

export default async function PublicGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await verifyServerSession();
  return <PublicShell session={session}>{children}</PublicShell>;
}
