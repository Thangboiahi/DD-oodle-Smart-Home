'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, ExternalLink, Home, RefreshCw } from 'lucide-react';
import { LAN_TRANSPORT } from '@/lib/protocol/transports';
import { Button, Card } from '@/components/ui';

export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('DD oodle Route ErrorBoundary:', error);
  }, [error]);

  return (
    <div className="max-w-lg mx-auto my-12 px-4">
      <Card className="text-center space-y-4 p-6 border-danger/45">
        <div className="mx-auto h-12 w-12 rounded-full bg-danger-soft border border-danger/40 text-danger flex items-center justify-center">
          <AlertTriangle className="h-6 w-6" />
        </div>

        <div className="space-y-1.5">
          <h1 className="text-base font-semibold text-foreground">
            Something went wrong rendering this view
          </h1>
          <p className="text-xs text-foreground-secondary font-mono break-words">
            {error?.message || 'Unexpected client view exception.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <Button variant="primary" touchTarget onClick={reset}>
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry View</span>
          </Button>
          <Link href="/console">
            <Button variant="secondary" touchTarget>
              <Home className="h-3.5 w-3.5" />
              <span>Return Console</span>
            </Button>
          </Link>
        </div>

        <div className="pt-3 border-t border-border space-y-2 text-xs">
          <p className="text-[11px] text-foreground-muted">
            Offline Failsafe: Local hardware Port 80 control stays 100% independent of this screen.
          </p>
          <a
            href={LAN_TRANSPORT.HUB_LOCAL_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] text-primary hover:underline"
          >
            <span>Open Safe Offline Local Control (Hub Port 80)</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </Card>
    </div>
  );
}
