'use client';

import React from 'react';
import type { SessionPayload } from '@/lib/auth/session';
import { WorkspaceProvider } from '@/components/workspace/WorkspaceProvider';
import { AppShell } from '@/components/workspace/AppShell';

export function ConsoleShell({
  session,
  children,
}: {
  session: SessionPayload;
  children: React.ReactNode;
}) {
  return (
    <WorkspaceProvider sessionRole={session.role} sessionHomeId={session.homeId}>
      <AppShell session={session}>{children}</AppShell>
    </WorkspaceProvider>
  );
}
