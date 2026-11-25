'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { MotionConfig } from 'motion/react';
import { ArrowLeft, KeyRound, Menu, Moon, ShoppingBag, Sun, X } from 'lucide-react';
import { getPortalPathForRole, SessionPayload } from '@/lib/auth/session';
import { useThemeEngine } from '@/components/theme/ThemeEngineProvider';
import { DDoodleLogo } from '@/components/brand/DDoodleLogo';
import { TRI_COLOR_PRESETS } from '@/components/theme/triColor';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

function FloatingBackToConsolePill({
  portalHref,
  hasSession,
}: {
  portalHref: string;
  hasSession: boolean;
}) {
  const searchParams = useSearchParams();
  const showcaseActive = searchParams?.get('showcase') === '1';

  if (!showcaseActive && !hasSession) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Link href={portalHref}>
        <Button variant="primary" size="sm" className="shadow-2xl rounded-full px-4">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to My Console</span>
        </Button>
      </Link>
    </div>
  );
}

export function PublicShell({
  session,
  children,
}: {
  session: SessionPayload | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || '/';
  const { themeState, resolvedLightMode, setTheme, setPalettePreset } = useThemeEngine();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const portalHref = session ? getPortalPathForRole(session.role) : '/auth';

  const navLinks = [
    { href: '/#live-demos', label: 'Live Demos' },
    { href: '/#fail-safe', label: 'Fail-Safe' },
    { href: '/#twin-3d', label: '3D Twin' },
    { href: '/#ecosystem', label: 'Ecosystem' },
    { href: '/shop', label: 'Shop' },
  ];

  return (
    <MotionConfig reducedMotion={themeState.motionMode === 'fluid' ? 'user' : 'always'}>
      <div className="min-h-screen bg-canvas text-foreground flex flex-col">
        {/* Minimal Sticky Storefront Navbar */}
        <header className="sticky top-0 z-40 h-14 border-b border-border/80 bg-[var(--dd-surface-0)]/94 backdrop-blur-md">
          <div className="mx-auto max-w-6xl h-full px-3 sm:px-5 flex items-center justify-between gap-2">
            <Link href={session ? '/?showcase=1' : '/'} className="flex items-center gap-2 shrink-0">
              <DDoodleLogo size="sm" animated={themeState.motionMode === 'fluid'} />
            </Link>

            <nav aria-label="Storefront Navigation" className="hidden md:flex items-center gap-1">
              {navLinks.map((item) => {
                const active = item.href === '/shop' && pathname.startsWith('/shop');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                      active
                        ? 'bg-accent-soft text-accent border border-accent-border'
                        : 'text-foreground-secondary hover:text-foreground hover:bg-surface-elevated'
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Tri-color quick dots */}
              <div className="hidden sm:flex items-center gap-1 rounded-lg border border-border bg-surface-elevated px-1.5 py-1">
                {Object.values(TRI_COLOR_PRESETS).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    aria-label={`Use ${preset.name} palette`}
                    title={preset.name}
                    onClick={() => setPalettePreset(preset.id)}
                    className={cn(
                      'h-3.5 w-3.5 rounded-full border transition-transform cursor-pointer',
                      themeState.palettePreset === preset.id
                        ? 'scale-115 border-foreground'
                        : 'border-transparent opacity-70 hover:opacity-100'
                    )}
                    style={{ backgroundColor: preset.dark.primary }}
                  />
                ))}
              </div>

              <button
                type="button"
                aria-label="Toggle Light or Dark Surface"
                onClick={() => setTheme(resolvedLightMode ? 'obsidian' : 'alabaster')}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-elevated text-foreground-secondary hover:text-foreground cursor-pointer"
              >
                {resolvedLightMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4 text-warning" />}
              </button>

              <Link href="/shop" className="sm:hidden">
                <Button variant="secondary" size="sm">
                  <ShoppingBag className="h-3.5 w-3.5" />
                  <span>Shop</span>
                </Button>
              </Link>

              <Link href={portalHref}>
                <Button variant="primary" size="sm">
                  {session ? <ArrowLeft className="h-3.5 w-3.5" /> : <KeyRound className="h-3.5 w-3.5" />}
                  <span>{session ? 'Back to Console' : 'My Console'}</span>
                </Button>
              </Link>

              <button
                type="button"
                aria-label="Toggle Menu"
                onClick={() => setMobileMenuOpen((v) => !v)}
                className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-elevated text-foreground-secondary cursor-pointer"
              >
                {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Mobile Drawer */}
          {mobileMenuOpen && (
            <div className="md:hidden border-b border-border bg-surface px-4 py-3 space-y-2 shadow-xl">
              <div className="grid grid-cols-2 gap-2">
                {navLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-xs font-medium text-foreground"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </header>

        <main className="flex-1 w-full">{children}</main>

        <footer className="border-t border-border/70 bg-surface/60 py-6 px-4 text-xs text-foreground-muted">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="font-mono text-[11px]">
              DD oodle — Smart Home Department (India) · Protocol Contract v1.4 · Core Free Forever
            </div>
            <div className="flex items-center gap-4">
              <Link href="/shop" className="hover:text-foreground">
                Module Shop
              </Link>
              <Link href="/auth" className="hover:text-foreground">
                My Console
              </Link>
            </div>
          </div>
        </footer>

        <Suspense fallback={null}>
          <FloatingBackToConsolePill
            portalHref={portalHref}
            hasSession={Boolean(session)}
          />
        </Suspense>
      </div>
    </MotionConfig>
  );
}
