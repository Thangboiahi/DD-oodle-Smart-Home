import Link from 'next/link';

export default function PublicLandingPlaceholderPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-16 text-center space-y-4">
      <h1 className="text-2xl font-bold text-foreground">DD oodle Smart Home v1.4</h1>
      <p className="text-sm text-foreground-secondary">
        Initializing public landing storefront showcase in Milestone 2.
      </p>
      <div className="flex justify-center gap-3">
        <Link href="/auth" className="text-sm text-accent underline">
          Sign In to My Console
        </Link>
      </div>
    </div>
  );
}
