'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { DDoodleLogo } from './DDoodleLogo';
import { useThemeEngine } from '@/components/theme/ThemeEngineProvider';
import { useWorkspaceOptional } from '@/components/workspace/WorkspaceProvider';

const BOOT_SESSION_KEY = 'dd_oodle_boot_v1';

const BOOT_STAGES = [
  'Initializing Precision Shell...',
  'Syncing 4-Tier Home State...',
  'Ready',
];

/**
 * Cold PWA Boot Splash Screen
 * - Never replays on soft internal route navigation (sessionStorage guarded).
 * - Immediately bypassed (0ms delay) during active CRITICAL life-safety alerts.
 * - Skippable anytime on tap or keypress.
 */
export const AppBootSplash: React.FC = () => {
  const { themeState } = useThemeEngine();
  const workspace = useWorkspaceOptional();
  const isLifeSafetyActive = workspace?.isLifeSafetyActive ?? false;

  const [visible, setVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return !window.sessionStorage.getItem(BOOT_SESSION_KEY);
    } catch {
      return false;
    }
  });
  const [stageIdx, setStageIdx] = useState(0);

  const dismiss = () => {
    setVisible(false);
    try {
      window.sessionStorage.setItem(BOOT_SESSION_KEY, '1');
    } catch {
      // Ignore storage errors
    }
  };

  useEffect(() => {
    if (!visible || isLifeSafetyActive) return;

    const t1 = window.setTimeout(() => setStageIdx(1), 280);
    const t2 = window.setTimeout(() => setStageIdx(2), 640);
    const t3 = window.setTimeout(() => {
      setVisible(false);
      try {
        window.sessionStorage.setItem(BOOT_SESSION_KEY, '1');
      } catch {
        // Ignore storage errors
      }
    }, themeState.motionMode === 'eco' ? 350 : 950);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [visible, isLifeSafetyActive, themeState.motionMode]);

  // Life-Safety Bypass Rule: 0ms bypass so Crash SOS / critical modal appears immediately
  if (isLifeSafetyActive) return null;

  const progressPct = stageIdx === 0 ? 32 : stageIdx === 1 ? 74 : 100;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="status"
          aria-label="Loading DD oodle Smart Home"
          onClick={dismiss}
          onKeyDown={dismiss}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.985 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
          className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-canvas px-6 cursor-pointer select-none"
        >
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="w-full max-w-xs flex flex-col items-center gap-5 text-center"
          >
            <DDoodleLogo size="lg" variant="loading" showWordmark={false} animated={true} />

            <div className="space-y-1">
              <div className="text-base font-semibold tracking-tight text-foreground">
                DD oodle Smart Home
              </div>
              <div className="text-[11px] font-mono text-foreground-muted tabular-nums">
                {BOOT_STAGES[stageIdx]}
              </div>
            </div>

            {/* Hairline Tri-Color Progress Bar */}
            <div className="w-full h-1 rounded-full bg-surface-muted overflow-hidden border border-border/60">
              <motion.div
                className="h-full rounded-full"
                style={{
                  background:
                    'linear-gradient(90deg, var(--dd-color-1) 0%, var(--dd-color-2) 55%, var(--dd-color-3) 100%)',
                }}
                initial={{ width: '12%' }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
              />
            </div>

            <div className="text-[10px] font-mono text-foreground-muted opacity-70">
              Tap anywhere to skip
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
