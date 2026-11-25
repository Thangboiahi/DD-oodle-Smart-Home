import { Skeleton } from '@/components/ui/Skeleton';

export default function PublicLandingLoading() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-6 space-y-4">
          <Skeleton className="h-6 w-48" rounded="full" />
          <Skeleton className="h-12 w-full max-w-md" />
          <Skeleton className="h-16 w-full max-w-lg" />
          <div className="flex gap-2">
            <Skeleton className="h-11 w-44" />
            <Skeleton className="h-11 w-40" />
          </div>
        </div>
        <div className="lg:col-span-6">
          <Skeleton className="h-72 w-full" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
