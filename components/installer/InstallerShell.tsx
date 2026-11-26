'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { MotionConfig } from 'motion/react';
import { LogOut, Moon, Shield, ShieldCheck, Store, Sun, UserCheck, Users, Wrench } from 'lucide-react';
import { getPortalPathForRole, type SessionPayload, type SessionRole } from '@/lib/auth/session';
import { useThemeEngine } from '@/components/theme/ThemeEngineProvider';
import { DDoodleLogo } from '@/components/brand/DDoodleLogo';
import { QuickThemePopover } from '@/components/theme/CustomTriColorStudio';
import { Badge, Button } from '@/components/ui';
import {
  IframeTokenSyncBridge,
  performCleanSignOut,
  performDemoRoleSwitch,
} from '@/components/auth/IframeSessionBridge';

export function InstallerShell({
  session,
  children,
}: {
  session: SessionPayload;
  children: React.ReactNode;
}) {
  const { themeState, resolvedLightMode, setTheme } = useThemeEngine();
  const [switchingRole, setSwitchingRole] = useState<SessionRole | null>(null);

  const handleQuickRoleSwitch = async (role: SessionRole) => {
    setSwitchingRole(role);
    try {
      await performDemoRoleSwitch(role);
    } catch {
      setSwitchingRole(null);
    }
  };

  const handleSignOut = async () => {
    await performCleanSignOut('/auth');
  };

  return (
    <MotionConfig reducedMotion={themeState.motionMode === 'fluid' ? 'user' : 'always'}>
      <div className="min-h-screen bg-canvas text-foreground flex flex-col">
        <React.Suspense fallback={null}>
          <IframeTokenSyncBridge />
        </React.Suspense>
        <header className="sticky top-0 z-40 h-14 border-b border-border/80 bg-[var(--dd-surface-0)]/95 backdrop-blur-md">
          <div className="mx-auto max-w-[1440px] h-full px-3 sm:px-5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <Link href="/installer" className="flex items-center gap-2 shrink-0">
                <DDoodleLogo size="sm" showWordmark animated={themeState.motionMode === 'fluid'} />
              </Link>
              <Badge variant="accent" className="hidden sm:inline-flex">
                <Wrench className="h-3 w-3" />
                <span>FIELD INSTALLER</span>
              </Badge>
              <span className="text-[11px] font-mono text-foreground-muted truncate hidden lg:inline">
                {session.name} ({session.uid})
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Demo Quick Role Switcher Pill */}
              <div className="hidden md:flex items-center gap-1 rounded-lg border border-border bg-surface-elevated p-0.5 text-[11px]">
                <button
                  type="button"
                  disabled={switchingRole !== null}
                  onClick={() => void handleQuickRoleSwitch('customer')}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-foreground-secondary hover:text-foreground hover:bg-surface cursor-pointer"
                  title="Switch to Customer Owner (/console)"
                >
                  <UserCheck className="h-3 w-3 text-primary" />
                  <span>{switchingRole === 'customer' ? '...' : 'Customer'}</span>
                </button>
                <button
                  type="button"
                  disabled={switchingRole !== null}
                  onClick={() => void handleQuickRoleSwitch('family_member')}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-foreground-secondary hover:text-foreground hover:bg-surface cursor-pointer"
                  title="Switch to Family Member (/console)"
                >
                  <Users className="h-3 w-3 text-tertiary" />
                  <span>{switchingRole === 'family_member' ? '...' : 'Family'}</span>
                </button>
                <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft border border-accent-border px-2 py-1 text-accent font-semibold">
                  <Wrench className="h-3 w-3" />
                  <span>Installer</span>
                </span>
                <button
                  type="button"
                  disabled={switchingRole !== null}
                  onClick={() => void handleQuickRoleSwitch('admin')}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-foreground-secondary hover:text-foreground hover:bg-surface cursor-pointer"
                  title="Switch to Master Admin (/admin)"
                >
                  <Shield className="h-3 w-3 text-accent" />
                  <span>{switchingRole === 'admin' ? '...' : 'Admin'}</span>
                </button>
              </div>

              <Badge variant="success" className="hidden xl:inline-flex">
                <ShieldCheck className="h-3 w-3" />
                <span>SCOPED AUTH</span>
              </Badge>

              <Link href="/?showcase=1" className="hidden sm:inline-flex">
                <Button variant="ghost" size="sm">
                  <Store className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">Showcase</span>
                </Button>
              </Link>
              <Link href="/shop" className="hidden sm:inline-flex">
                <Button variant="ghost" size="sm">
                  <span>Shop</span>
                </Button>
              </Link>

              <button
                type="button"
                aria-label="Toggle Light/Dark Theme"
                onClick={() => setTheme(resolvedLightMode ? 'obsidian' : 'alabaster')}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-elevated text-foreground-secondary hover:text-foreground cursor-pointer"
              >
                {resolvedLightMode ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5 text-warning" />}
              </button>

              <QuickThemePopover />

              <Button variant="outline" size="sm" onClick={() => void handleSignOut()}>
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 w-full max-w-[1440px] mx-auto px-3 sm:px-5 lg:px-6 py-4">
          {children}
        </main>
      </div>
    </MotionConfig>
  );
}
