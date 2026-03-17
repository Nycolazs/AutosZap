import { RouteTransition } from '@/components/layout/route-transition';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <RouteTransition>{children}</RouteTransition>;
}
