import { NextRequest, NextResponse } from 'next/server';
import {
  createCanonicalWorkspaceSeed,
  type UnifiedWorkspaceState,
} from '@/lib/data/canonicalSeed';

declare global {
  var __ddUnifiedWorkspaceState: UnifiedWorkspaceState | undefined;
}

function getServerWorkspaceSingleton(): UnifiedWorkspaceState {
  if (!globalThis.__ddUnifiedWorkspaceState) {
    globalThis.__ddUnifiedWorkspaceState = createCanonicalWorkspaceSeed();
  }
  return globalThis.__ddUnifiedWorkspaceState;
}

function setServerWorkspaceSingleton(next: UnifiedWorkspaceState): UnifiedWorkspaceState {
  globalThis.__ddUnifiedWorkspaceState = next;
  return globalThis.__ddUnifiedWorkspaceState;
}

export async function GET() {
  const workspace = getServerWorkspaceSingleton();
  return NextResponse.json(
    {
      ok: true,
      workspace,
      ts: Date.now(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action?: 'patch' | 'replace' | 'reset';
      patch?: Partial<UnifiedWorkspaceState>;
      workspace?: UnifiedWorkspaceState;
    };

    if (body.action === 'reset') {
      const fresh = setServerWorkspaceSingleton(createCanonicalWorkspaceSeed());
      return NextResponse.json({
        ok: true,
        reset: true,
        workspace: fresh,
        ts: Date.now(),
      });
    }

    if (body.action === 'replace' && body.workspace) {
      const replaced = setServerWorkspaceSingleton({
        ...createCanonicalWorkspaceSeed(),
        ...body.workspace,
      });
      return NextResponse.json({
        ok: true,
        workspace: replaced,
        ts: Date.now(),
      });
    }

    const current = getServerWorkspaceSingleton();
    const patch = body.patch ?? (body as unknown as Partial<UnifiedWorkspaceState>);

    const merged: UnifiedWorkspaceState = {
      ...current,
      ...(patch.homes ? { homes: patch.homes } : {}),
      ...(patch.users ? { users: patch.users } : {}),
      ...(patch.devices ? { devices: { ...current.devices, ...patch.devices } } : {}),
      ...(patch.catalogOverrides
        ? { catalogOverrides: { ...current.catalogOverrides, ...patch.catalogOverrides } }
        : {}),
      ...(patch.storeConfig
        ? { storeConfig: { ...current.storeConfig, ...patch.storeConfig } }
        : {}),
      ...(patch.quotes ? { quotes: patch.quotes } : {}),
      ...(patch.installerJobs ? { installerJobs: patch.installerJobs } : {}),
      ...(patch.erp
        ? {
            erp: {
              ...current.erp,
              ...patch.erp,
            },
          }
        : {}),
      ...(patch.vehicleTrips ? { vehicleTrips: patch.vehicleTrips } : {}),
      ...(patch.vehicleGeofences ? { vehicleGeofences: patch.vehicleGeofences } : {}),
      ...(patch.lockAccessLogs ? { lockAccessLogs: patch.lockAccessLogs } : {}),
    };

    setServerWorkspaceSingleton(merged);

    return NextResponse.json({
      ok: true,
      workspace: merged,
      ts: Date.now(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Invalid workspace mutation payload',
      },
      { status: 400 }
    );
  }
}

export async function DELETE() {
  const fresh = setServerWorkspaceSingleton(createCanonicalWorkspaceSeed());
  return NextResponse.json({
    ok: true,
    reset: true,
    workspace: fresh,
    ts: Date.now(),
  });
}
