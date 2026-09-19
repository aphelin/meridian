"use client";

import { Skeleton } from "@/components/ui/skeleton";

type ClientError = { message: string; data?: { correlationId?: string; status?: number } | null } | null | undefined;

/** "Reference: <correlationId>" for any BFF error that carries one, so support can find the request in the logs. */
export function referenceOf(error: ClientError): string | null {
  const id = error?.data?.correlationId;
  return id ? `Reference: ${id}` : null;
}

/** Error state for a data view: what went wrong, the correlation reference and a retry. */
export function QueryError({ title, error, onRetry, className = "" }: { title: string; error: ClientError; onRetry?: () => void; className?: string }) {
  const reference = referenceOf(error);
  return (
    <div className={`alert alert-error flex-col sm:flex-row sm:items-center sm:justify-between ${className}`} role="alert">
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        {error?.message ? <p className="mt-0.5">{error.message}</p> : null}
        {reference ? <p className="mt-1 text-xs tabular break-all">{reference}</p> : null}
      </div>
      {onRetry ? (
        <button type="button" className="btn btn-secondary btn-sm shrink-0 self-start sm:self-center" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

/** Placeholder with the exact footprint of a ProductCard, so results land without shifting the grid. */
export function ProductCardSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="aspect-[4/5] !rounded-[18px]" />
      <div className="mt-3.5 flex items-start justify-between gap-3">
        <div className="flex-1">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="mt-2 h-3.5 w-1/2" />
        </div>
        <Skeleton className="h-4 w-14" />
      </div>
      <Skeleton className="mt-3 h-[18px] w-24" />
    </div>
  );
}
