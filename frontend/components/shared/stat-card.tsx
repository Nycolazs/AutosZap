import { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function StatCard({
  title,
  value,
  helper,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  helper: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="p-0">
      <CardContent className="flex items-start justify-between gap-4 p-4 sm:items-center">
        <div className="min-w-0">
          <p className="text-[13px] text-muted-foreground">{title}</p>
          <p className="mt-1.5 font-heading text-[24px] font-semibold sm:text-[28px]">{value}</p>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{helper}</p>
        </div>
        <div className="rounded-2xl bg-primary-soft p-2.5 text-primary sm:p-3">
          <Icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
