'use client';

import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

export function GlobalLoadingIndicator() {
  const pendingInitialQueries = useIsFetching({
    predicate: (query) =>
      query.state.fetchStatus === 'fetching' && query.state.status === 'pending',
  });
  const pendingMutations = useIsMutating();
  const visible = pendingInitialQueries + pendingMutations > 0;

  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-[80] transition-opacity duration-300',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div className="global-loading-track">
        <span className="global-loading-bar" />
      </div>
    </div>
  );
}
