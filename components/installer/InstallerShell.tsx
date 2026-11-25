'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MotionConfig } from 'motion/react';
import { LogOut, Moon, ShieldCheck, Store, Sun, Wrench } from 'lucide-react';
import type { SessionPayload } from '@/lib/auth/session';
import { useThemeEngine } from '@/components/theme/ThemeEngineProvider';
import { DDoodleLogo } from '@/components/brand/DDoodleLogo';
import { QuickThemePopover } from '@/components/theme/CustomTriColorStudio';
import { Badge, Button } from '@/components/ui';

export function InstallerShell({
  session,
  children,
}: {
  session: SessionPayload;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { themeState, resolvedLightMode, setTheme } = useThemeEngine();

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
    } catch {
      // Ignore network errors on sign out
    }
    router.push('/auth');
    router.refresh();
  };

  return (
    <MotionConfig reducedMotion={themeState.motionMode === 'fluid' ? 'user' : 'always'}>
      <div className="min-h-screen bg-canvas text-foreground flex flex-col">
        <header className="sticky top-0 z-40 h-14 border-b border-border/80 bg-[var(--dd-surface-0)]/95 backdrop-blur-md">
          <div className="mx-auto max-w-[1440px] h-full px-3 sm:px-5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <Link href="/installer" className="flex items-center gap-2 shrink-0">
                <DDoodleLogo size="sm" animated={themeState.motionMode === 'fluid'} />
              </Link>
              <Badge variant="accent" className="hidden sm:inline-flex">
                <Wrench className="h-3 w-3" />
                <span>FIELD INSTALLER</span>
              </Badge>
              <span className="text-[11px] font-mono text-foreground-muted truncate hidden md:inline">
                {session.name} ({session.uid})
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Badge variant="success" className="hidden sm:inline-flex">
                <ShieldCheck className="h-3 w-3" />
                <span>SCOPED AUTH</span>
              </Badge>

              <Link href="/?showcase=1" className="hidden sm:inline-flex">
                <Button variant="ghost" size="sm">
                  <Store className="h-3.5 w-3.5" />
                  <span>Showcase</span>
                </Button>
              </Link>

              {session.role === 'admin' && (
                <Link href="/admin">
                  <Button variant="secondary" size="sm">
                    <span>Admin</span>
                  </Button>
                </Link>
              )}

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
