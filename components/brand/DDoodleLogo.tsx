'use client';

import React from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

export type DDoodleLogoVariant = 'idle' | 'loading';

export interface DDoodleLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | number;
  variant?: DDoodleLogoVariant;
  showWordmark?: boolean;
  animated?: boolean;
  className?: string;
}

const SIZE_MAP: Record<'sm' | 'md' | 'lg' | 'xl', number> = {
  sm: 30,
  md: 36,
  lg: 64,
  xl: 88,
};

/**
 * Unified Geometric DD oodle Circuit Monogram & Wordmark
 *
 * - Permanently renders base geometric `DD` paths at full SVG stroke length from 0ms SSR
 *   so `MotionConfig reducedMotion` or hydration never causes a 2-dot box glitch.
 * - `variant="idle"`: Crisp geometric `DD` circuit monogram with ambient node pulse and spring hover/tap response.
 * - `variant="loading"`: Continuous Tri-Color circuit-trace stroke sweep + orbiting telemetry pulse dot around the `DD` emblem.
 * - All colors bind directly to `--dd-color-1`, `--dd-color-2`, and `--dd-color-3`.
 */
export const DDoodleLogo: React.FC<DDoodleLogoProps> = ({
  size = 'md',
  variant = 'idle',
  showWordmark = false,
  animated = true,
  className,
}) => {
  const px = typeof size === 'number' ? size : SIZE_MAP[size] ?? 36;
  const isLoading = variant === 'loading';
  const allowMotion = animated || isLoading;

  return (
    <div className={cn('inline-flex items-center gap-2.5 select-none', className)}>
      <motion.svg
        width={px}
        height={px}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        whileHover={allowMotion ? { scale: 1.06 } : undefined}
        whileTap={allowMotion ? { scale: 0.96 } : undefined}
        transition={{ type: 'spring', stiffness: 420, damping: 26 }}
        aria-hidden="true"
        className="shrink-0 overflow-visible"
      >
        {/* Outer Precision Chassis */}
        <rect
          x="2.25"
          y="2.25"
          width="43.5"
          height="43.5"
          rx="11"
          fill="var(--dd-surface-elevated)"
          stroke="var(--dd-border-strong)"
          strokeWidth="1.5"
        />

        {/* Subtle Inner Architectural Corner Ticks */}
        <path
          d="M7.5 10.5V7.5H10.5M37.5 7.5H40.5V10.5M7.5 37.5V40.5H10.5M37.5 40.5H40.5V37.5"
          stroke="var(--dd-color-2)"
          strokeOpacity="0.32"
          strokeWidth="1.15"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Continuous Perimeter Circuit Sweep (Active in variant="loading") */}
        {isLoading && (
          <motion.rect
            x="2.25"
            y="2.25"
            width="43.5"
            height="43.5"
            rx="11"
            stroke="var(--dd-color-1)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="34 132"
            animate={{ strokeDashoffset: [0, -166] }}
            transition={{ duration: 1.35, repeat: Infinity, ease: 'linear' }}
          />
        )}

        {/* Base Secondary Structural Trace — Left 'D' (Color 2, always visible 0ms SSR) */}
        <path
          d="M11 14H19C23.4183 14 27 17.5817 27 22V26C27 30.4183 23.4183 34 19 34H11V14Z"
          stroke="var(--dd-color-2)"
          strokeOpacity={isLoading ? 0.38 : 0.95}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Base Primary Interlocking Circuit — Right 'D' (Color 1, always visible 0ms SSR) */}
        <path
          d="M18 11H26C31.5228 11 36 15.4772 36 21V27C36 32.5228 31.5228 37 26 37H18V11Z"
          stroke="var(--dd-color-1)"
          strokeOpacity={isLoading ? 0.42 : 1}
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Animated Loading Circuit-Trace Sweep Along Both 'D' Monograms */}
        {isLoading && (
          <>
            <motion.path
              d="M11 14H19C23.4183 14 27 17.5817 27 22V26C27 30.4183 23.4183 34 19 34H11V14Z"
              stroke="var(--dd-color-2)"
              strokeWidth="2.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="18 54"
              animate={{ strokeDashoffset: [0, -72] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
            />
            <motion.path
              d="M18 11H26C31.5228 11 36 15.4772 36 21V27C36 32.5228 31.5228 37 26 37H18V11Z"
              stroke="var(--dd-color-1)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="24 66"
              animate={{ strokeDashoffset: [0, -90] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
            />
          </>
        )}

        {/* Base Node-Link Bus (Color 1, always visible 0ms SSR) */}
        <path
          d="M14 24H31"
          stroke="var(--dd-color-1)"
          strokeWidth="2.15"
          strokeLinecap="round"
        />

        {/* Orbiting / Traveling Telemetry Pulse Dot Along Bus & Orbit */}
        {isLoading ? (
          <>
            <motion.circle
              r="2.4"
              fill="var(--dd-color-3)"
              animate={{
                cx: [18, 28, 36, 36, 28, 18, 18],
                cy: [11, 11, 21, 27, 37, 37, 11],
              }}
              transition={{ duration: 1.35, repeat: Infinity, ease: 'linear' }}
            />
            <motion.circle
              cy="24"
              r="2.3"
              fill="var(--dd-color-1)"
              animate={{ cx: [14, 31, 14] }}
              transition={{ duration: 0.95, repeat: Infinity, ease: 'easeInOut' }}
            />
          </>
        ) : null}

        {/* Anchor Node Left (Color 1) */}
        <circle cx="14" cy="24" r="2.3" fill="var(--dd-color-1)" />

        {/* Live Telemetry Node Glow Right (Color 3 Tertiary) */}
        {allowMotion && (
          <motion.circle
            cx="31"
            cy="24"
            r="5.2"
            fill="var(--dd-color-3)"
            initial={{ opacity: 0.22, scale: 0.9 }}
            animate={{
              scale: isLoading ? [0.85, 1.45, 0.85] : [0.9, 1.28, 0.9],
              opacity: isLoading ? [0.18, 0.48, 0.18] : [0.14, 0.32, 0.14],
            }}
            transition={{
              duration: isLoading ? 0.9 : 2.4,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        )}
        <circle cx="31" cy="24" r="3.1" fill="var(--dd-color-3)" />
      </motion.svg>

      {showWordmark && (
        <div className="min-w-0 leading-tight">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'font-semibold tracking-tight text-foreground truncate',
                px >= 56 ? 'text-xl' : 'text-sm'
              )}
            >
              DD oodle
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary-soft text-primary border border-primary-border leading-none">
              v1.4
            </span>
          </div>
          <div className="text-[10px] text-foreground-muted truncate font-mono">
            Smart Home OS
          </div>
        </div>
      )}
    </div>
  );
};

export default DDoodleLogo;
