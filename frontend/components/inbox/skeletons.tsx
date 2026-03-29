'use client';

import { Skeleton } from '@/components/ui/skeleton';

export function ConversationListSkeleton() {
  return (
    <div className="flex flex-col gap-1 p-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MessageListSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      {/* Alternating left/right message bubbles */}
      <div className="flex justify-start">
        <Skeleton className="h-10 w-52 rounded-2xl rounded-bl-md" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-10 w-44 rounded-2xl rounded-br-md" />
      </div>
      <div className="flex justify-start">
        <Skeleton className="h-16 w-64 rounded-2xl rounded-bl-md" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-10 w-36 rounded-2xl rounded-br-md" />
      </div>
      <div className="flex justify-start">
        <Skeleton className="h-10 w-48 rounded-2xl rounded-bl-md" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-14 w-56 rounded-2xl rounded-br-md" />
      </div>
    </div>
  );
}

export function ConversationHeaderSkeleton() {
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3">
      <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
      <div className="flex flex-col gap-1">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}
