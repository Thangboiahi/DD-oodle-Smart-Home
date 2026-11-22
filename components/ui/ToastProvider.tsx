'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastTone = 'info' | 'success' | 'warning' | 'critical';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
}

interface ToastContextValue {
  pushToast: (toast: Omit<ToastItem, 'id'>) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, { box: string; icon: React.ReactNode }> = {
  info: {
    box: 'border-border-strong bg-surface text-foreground',
    icon: <Info className="h-4 w-4 text-accent shrink-0" />,
  },
  success: {
    box: 'border-success/40 bg-surface text-foreground',
    icon: <CheckCircle2 className="h-4 w-4 text-success shrink-0" />,
  },
  warning: {
    box: 'border-warning/40 bg-surface text-foreground',
    icon: <AlertTriangle className="h-4 w-4 text-warning shrink-0" />,
  },
  critical: {
    box: 'border-danger bg-danger-soft text-foreground',
    icon: <ShieldAlert className="h-4 w-4 text-danger shrink-0" />,
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
      const duration = toast.durationMs ?? (toast.tone === 'critical' ? 8000 : 4000);
      if (duration > 0) {
        setTimeout(() => {
          dismissToast(id);
        }, duration);
      }
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider value={{ pushToast, dismissToast }}>
      {children}
      {/* Toast viewport */}
      <div
        aria-live="polite"
        className="fixed bottom-20 md:bottom-5 right-4 z-50 flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm pointer-events-none"
      >
        {toasts.map((t) => {
          const style = TONE_STYLES[t.tone ?? 'info'];
          return (
            <div
              key={t.id}
              className={cn(
                'pointer-events-auto flex items-start gap-2.5 rounded-[var(--dd-radius-card)] border px-3.5 py-3 shadow-xl backdrop-blur-md',
                style.box
              )}
            >
              <div className="mt-0.5">{style.icon}</div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold">{t.title}</div>
                {t.description && (
                  <div className="text-[11px] text-foreground-secondary mt-0.5 leading-snug">
                    {t.description}
                  </div>
                )}
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => dismissToast(t.id)}
                className="rounded p-0.5 text-foreground-muted hover:text-foreground cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      pushToast: () => {},
      dismissToast: () => {},
    };
  }
  return ctx;
}

export interface BannerProps {
  tone?: ToastTone;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const Banner: React.FC<BannerProps> = ({
  tone = 'info',
  title,
  description,
  action,
  className,
}) => {
  const style = TONE_STYLES[tone];
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-[var(--dd-radius-card)] border px-3.5 py-2.5 text-xs',
        style.box,
        className
      )}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="mt-0.5">{style.icon}</div>
        <div className="min-w-0">
          <div className="font-semibold text-foreground">{title}</div>
          {description && <div className="text-[11px] text-foreground-secondary mt-0.5">{description}</div>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};
