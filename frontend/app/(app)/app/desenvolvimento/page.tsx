import { notFound } from 'next/navigation';
import DevelopmentPageClient from './development-page-client';

export default function DevelopmentPage() {
  if (process.env.NODE_ENV !== 'development') {
    notFound();
  }

  return <DevelopmentPageClient />;
}
