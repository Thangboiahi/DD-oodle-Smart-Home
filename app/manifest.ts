import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/console',
    name: 'DD oodle Smart Home',
    short_name: 'DD oodle',
    description:
      '4-Tier fail-safe Indian Smart Home & Vehicle Safety PWA with offline LAN/BLE control and Crash SOS.',
    start_url: '/console',
    scope: '/',
    display: 'standalone',
    background_color: '#090b0f',
    theme_color: '#090b0f',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
