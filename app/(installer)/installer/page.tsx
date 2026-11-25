import React from 'react';
import { requireServerRole } from '@/lib/auth/serverGuard';
import { InstallerPortalClient } from '@/components/installer/InstallerPortalClient';

export const dynamic = 'force-dynamic';

export default async function InstallerPortalPage() {
  const session = await requireServerRole(['installer', 'admin'], '/installer');
  return <InstallerPortalClient session={session} />;
}
