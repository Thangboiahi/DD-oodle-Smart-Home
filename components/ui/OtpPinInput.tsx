'use client';

import React, { useRef } from 'react';
import { cn } from '@/lib/utils';

export interface OtpPinInputProps {
  length?: 4 | 6 | 8;
  value: string;
  onChange: (value: string) => void;
  masked?: boolean;
  disabled?: boolean;
  label?: string;
  className?: string;
}

/**
 * Segmented OTP / G7 Local PIN Input (4, 6, or 8 digits)
 */
export const OtpPinInput: React.FC<OtpPinInputProps> = ({
  length = 6,
  value,
  onChange,
  masked = false,
  disabled = false,
  label,
  className,
}) => {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  const updateAt = (index: number, char: string) => {
    const clean = char.replace(/\D/g, '');
    if (!clean) return;
    const arr = [...digits];
    if (clean.length > 1) {
      for (let i = 0; i < clean.length && index + i < length; i++) {
        arr[index + i] = clean[i];
      }
      onChange(arr.join('').slice(0, length));
      const nextFocus = Math.min(length - 1, index + clean.length);
      inputRefs.current[nextFocus]?.focus();
      return;
    }
    arr[index] = clean;
    onChange(arr.join(''));
    if (index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const arr = [...digits];
      if (arr[index]) {
        arr[index] = '';
        onChange(arr.join(''));
      } else if (index > 0) {
        arr[index - 1] = '';
        onChange(arr.join(''));
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && <label className="block text-xs font-medium text-foreground-secondary">{label}</label>}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {digits.map((digit, idx) => (
          <input
            key={idx}
            ref={(el) => {
              inputRefs.current[idx] = el;
            }}
            type={masked ? 'password' : 'text'}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={length}
            disabled={disabled}
            value={digit}
            aria-label={`Digit ${idx + 1} of ${length}`}
            onChange={(e) => updateAt(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            onFocus={(e) => e.target.select()}
            className={cn(
              'h-11 w-9 sm:w-10 rounded-[var(--dd-radius-control)] border bg-surface-elevated text-center font-mono text-base font-semibold text-foreground tabular-nums transition-colors focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30',
              digit ? 'border-accent-border' : 'border-border',
              disabled && 'opacity-45 cursor-not-allowed'
            )}
          />
        ))}
      </div>
    </div>
  );
};
