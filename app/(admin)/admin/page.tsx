import React from 'react';
import { requireServerRole } from '@/lib/auth/serverGuard';
import { AdminCommandCenter } from '@/components/admin/AdminCommandCenter';

export const dynamic = 'force-dynamic';

export default async function AdminPortalPage() {
  const session = await requireServerRole(['admin'], '/admin');
  return <AdminCommandCenter session={session} />;
}
