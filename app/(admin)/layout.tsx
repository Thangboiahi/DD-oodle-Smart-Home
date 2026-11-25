import React from 'react';
import { requireServerRole } from '@/lib/auth/serverGuard';
import { AdminShell } from '@/components/admin/AdminShell';

export const dynamic = 'force-dynamic';

export default async function AdminGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireServerRole(['admin'], '/admin');
  return <AdminShell session={session}>{children}</AdminShell>;
}
