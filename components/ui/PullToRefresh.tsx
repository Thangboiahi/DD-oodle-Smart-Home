'use client';

import React, { useRef, useState } from 'react';
import { DDoodleLogo } from '@/components/brand/DDoodleLogo';
import { triggerHaptic } from './haptics';

export interface PullToRefreshProps {
  onRefresh: () => void | Promise<void>;
  hapticsEnabled?: boolean;
  children: React.ReactNode;
}

/**
 * Smooth Mobile Pull-to-Refresh Wrapper
 * Activates only when scrolled to top (scrollY <= 2) and pulled downward >= 64px.
 */
export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  hapticsEnabled = true,
  children,
}) => {
  const startYRef = useRef<number | null>(null);
  const [pullDist, setPullDist] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (window.scrollY <= 2 && e.touches.length === 1) {
      startYRef.current = e.touches[0].clientY;
    } else {
      startYRef.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (startYRef.current === null || refreshing) return;
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta > 0 && window.scrollY <= 2) {
      setPullDist(Math.min(84, Math.round(delta * 0.55)));
    }
  };

  const handleTouchEnd = async () => {
    if (pullDist >= 56 && !refreshing) {
      setRefreshing(true);
      triggerHaptic('step', hapticsEnabled);
      try {
        await onRefresh();
      } finally {
        window.setTimeout(() => {
          setRefreshing(false);
          setPullDist(0);
        }, 480);
      }
    } else {
      setPullDist(0);
    }
    startYRef.current = null;
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => void handleTouchEnd()}
      className="relative"
    >
      {(pullDist > 8 || refreshing) && (
        <div
          style={{ height: refreshing ? 52 : pullDist }}
          className="flex items-center justify-center gap-2 overflow-hidden transition-[height] duration-150 text-[11px] font-mono text-foreground-muted"
        >
          <div className={refreshing ? 'animate-spin' : ''}>
            <DDoodleLogo size="sm" animated={false} />
          </div>
          <span>
            {refreshing
              ? 'Syncing live state...'
              : pullDist >= 56
              ? 'Release to sync'
              : 'Pull to sync'}
          </span>
        </div>
      )}
      {children}
    </div>
  );
};
