import type { Metadata, Viewport } from 'next';
import './globals.css'; // Global styles

export const viewport: Viewport = {
  themeColor: '#0f172a',
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
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
