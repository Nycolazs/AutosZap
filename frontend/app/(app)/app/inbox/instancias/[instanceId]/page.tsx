import { Suspense } from 'react';
import { InboxPageContent, InboxPageSkeleton } from '../../page';

export default async function InstanceInboxPage({
  params,
}: {
  params: Promise<{
    instanceId: string;
  }>;
}) {
  const { instanceId } = await params;

  return (
    <Suspense fallback={<InboxPageSkeleton />}>
      <InboxPageContent lockedInstanceId={instanceId} />
    </Suspense>
  );
}
