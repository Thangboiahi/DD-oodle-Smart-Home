'use client';

import React from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

export interface DDoodleLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  animated?: boolean;
  className?: string;
}

const SIZE_MAP = {
  sm: 28,
  md: 34,
  lg: 64,
};

/**
 * Custom Geometric DD oodle Monogram & Wordmark
 * Vector strokes & node-link pulses synchronize live with the active Tri-Color Palette.
 */
export const DDoodleLogo: React.FC<DDoodleLogoProps> = ({
  size = 'md',
  showWordmark = false,
  animated = true,
  className,
}) => {
  const px = SIZE_MAP[size];

  return (
    <div className={cn('inline-flex items-center gap-2.5 select-none', className)}>
      <motion.svg
        width={px}
        height={px}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        whileHover={animated ? { scale: 1.05 } : undefined}
        transition={{ type: 'spring', stiffness: 420, damping: 28 }}
        aria-hidden="true"
        className="shrink-0"
      >
        {/* Outer Precision Chassis */}
        <rect
          x="2"
          y="2"
          width="44"
          height="44"
          rx="11"
          fill="var(--dd-surface-elevated)"
          stroke="var(--dd-border-strong)"
          strokeWidth="1.5"
        />

        {/* Secondary Structural Trace (Color 2) */}
        <motion.path
          d="M11 14H19C23.4183 14 27 17.5817 27 22V26C27 30.4183 23.4183 34 19 34H11V14Z"
          stroke="var(--dd-color-2)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={animated ? { pathLength: 0.15, opacity: 0.5 } : undefined}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.65, ease: 'easeOut' }}
        />

        {/* Primary Interlocking Circuit 'D' (Color 1) */}
        <motion.path
          d="M18 11H26C31.5228 11 36 15.4772 36 21V27C36 32.5228 31.5228 37 26 37H18V11Z"
          stroke="var(--dd-color-1)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={animated ? { pathLength: 0, opacity: 0.4 } : undefined}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />

        {/* Node-Link Bus */}
        <motion.path
          d="M14 24H31"
          stroke="var(--dd-color-1)"
          strokeWidth="2"
          strokeLinecap="round"
          initial={animated ? { pathLength: 0 } : undefined}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.55, delay: 0.2, ease: 'easeOut' }}
        />

        {/* Live Telemetry Node Glow (Color 3 Tertiary) */}
        <motion.circle
          cx="31"
          cy="24"
          r="3.2"
          fill="var(--dd-color-3)"
          animate={
            animated
              ? { scale: [1, 1.24, 1], opacity: [0.85, 1, 0.85] }
              : undefined
          }
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <circle cx="14" cy="24" r="2.2" fill="var(--dd-color-1)" />
      </motion.svg>

      {showWordmark && (
        <div className="min-w-0 leading-tight">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'font-semibold tracking-tight text-foreground truncate',
                size === 'lg' ? 'text-xl' : 'text-sm'
              )}
            >
              DD oodle
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-primary-soft text-primary border border-primary-border">
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
