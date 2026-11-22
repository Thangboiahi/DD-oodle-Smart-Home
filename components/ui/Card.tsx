'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  interactive?: boolean;
  noPadding?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, elevated = false, interactive = false, noPadding = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-[var(--dd-radius-card)] border border-border transition-colors duration-150',
        elevated ? 'bg-surface-elevated' : 'bg-surface',
        interactive && 'hover:border-border-strong',
        !noPadding && 'p-[var(--dd-card-pad)]',
        className
      )}
      {...props}
    />
  )
);
Card.displayName = 'Card';

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-start justify-between gap-3 pb-3 border-b border-border/70', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-sm font-semibold tracking-tight text-foreground leading-snug', className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-xs text-foreground-secondary leading-relaxed', className)} {...props} />
  );
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('pt-3', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('pt-3 mt-3 border-t border-border/70 flex items-center justify-between gap-2', className)}
      {...props}
    />
  );
}
