import type { Metadata, Viewport } from 'next';
import './globals.css';
import { WorkspaceProvider } from '@/components/workspace/WorkspaceProvider';
import { AppShell } from '@/components/workspace/AppShell';
import { ToastProvider } from '@/components/ui/ToastProvider';

export const viewport: Viewport = {
  themeColor: '#090b0f',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'DD oodle Smart Home',
  description:
    '4-Tier fail-safe Indian Smart Home & Vehicle Safety PWA with Capability-Driven UI, 3D Home Twin, MapLibre live tracking, and Installer Admin Portal.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'DD oodle',
  },
  openGraph: {
    title: 'DD oodle Smart Home',
    description:
      '4-Tier fail-safe Indian Smart Home & Vehicle Safety PWA with Capability-Driven UI, 3D Home Twin, MapLibre live tracking, and Installer Admin Portal.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DD oodle Smart Home',
    description:
      '4-Tier fail-safe Indian Smart Home & Vehicle Safety PWA with Capability-Driven UI, 3D Home Twin, MapLibre live tracking, and Installer Admin Portal.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="obsidian"
      data-accent="cyan"
      data-density="comfortable"
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <WorkspaceProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </WorkspaceProvider>
      </body>
    </html>
  );
}
