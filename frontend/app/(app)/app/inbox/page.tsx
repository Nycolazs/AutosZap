"use client";

import { Suspense } from "react";
import {
  InboxPageContent,
  InboxPageSkeleton,
} from "./inbox-page-content";

export default function InboxPage() {
  return (
    <Suspense fallback={<InboxPageSkeleton />}>
      <InboxPageContent />
    </Suspense>
  );
}
