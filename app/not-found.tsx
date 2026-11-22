import Link from 'next/link';
import { Home, Search } from 'lucide-react';
import { DDoodleLogo } from '@/components/brand/DDoodleLogo';
import { Button, Card } from '@/components/ui';

export default function NotFoundPage() {
  return (
    <div className="max-w-md mx-auto my-12 px-4">
      <Card className="text-center space-y-4 p-6">
        <div className="flex justify-center">
          <DDoodleLogo size="lg" animated={false} />
        </div>
        <div className="space-y-1">
          <div className="font-mono text-xs text-primary">404 · ROUTE NOT FOUND</div>
          <h1 className="text-base font-semibold text-foreground">
            This module or page does not exist
          </h1>
          <p className="text-xs text-foreground-secondary">
            Return to your Home Dashboard or press <kbd className="font-mono px-1 rounded border border-border bg-surface-elevated">⌘K</kbd> to jump directly to any module.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 pt-1">
          <Link href="/">
            <Button variant="primary" size="sm">
              <Home className="h-3.5 w-3.5" />
              <span>Home Dashboard</span>
            </Button>
          </Link>
          <Link href="/setup">
            <Button variant="secondary" size="sm">
              <Search className="h-3.5 w-3.5" />
              <span>Setup Wizard</span>
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
