import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeEngineProvider } from '@/components/theme/ThemeEngineProvider';
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

const ZERO_FOUC_INIT_SCRIPT = `(function(){try{var raw=localStorage.getItem('dd_oodle_workspace_v1');if(!raw)return;var p=JSON.parse(raw);var r=document.documentElement;if(p.theme)r.dataset.theme=p.theme;if(p.palettePreset)r.dataset.palette=p.palettePreset;if(p.density)r.dataset.density=p.density;if(p.motionMode)r.dataset.motion=p.motionMode;var isLight=p.theme==='alabaster'||(p.theme==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',isLight?'#f4f6f9':'#090b0f');if(p.palettePreset==='custom'&&p.customPalette){var c=p.customPalette;var hexToRgb=function(h){var n=parseInt((h||'#06b6d4').replace('#',''),16);return[(n>>16)&255,(n>>8)&255,n&255]};var setC=function(idx,hex){if(!/^#[0-9a-fA-F]{6}$/.test(hex||''))return;var rgb=hexToRgb(hex);var lum=(0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2])/255;r.style.setProperty('--dd-color-'+idx,hex);r.style.setProperty('--dd-color-'+idx+'-fg',lum>0.54?'#090b0f':'#ffffff');r.style.setProperty('--dd-color-'+idx+'-soft','rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+','+(isLight?0.11:0.14)+')');r.style.setProperty('--dd-color-'+idx+'-border','rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+','+(isLight?0.32:0.38)+')')};setC(1,c.primary);setC(2,c.secondary);setC(3,c.tertiary);}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="obsidian"
      data-palette="volt_precision"
      data-accent="cyan"
      data-density="comfortable"
      data-motion="fluid"
      suppressHydrationWarning
    >
      <head>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: ZERO_FOUC_INIT_SCRIPT }}
        />
      </head>
      <body suppressHydrationWarning>
        <ThemeEngineProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeEngineProvider>
      </body>
    </html>
  );
}
