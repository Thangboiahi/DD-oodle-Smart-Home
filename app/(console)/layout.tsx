import React from 'react';
import { requireServerRole } from '@/lib/auth/serverGuard';
import { ConsoleShell } from '@/components/workspace/ConsoleShell';

export const dynamic = 'force-dynamic';

export default async function ConsoleGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireServerRole(
    ['customer', 'family_member', 'admin'],
    '/console'
  );
  return <ConsoleShell session={session}>{children}</ConsoleShell>;
}
