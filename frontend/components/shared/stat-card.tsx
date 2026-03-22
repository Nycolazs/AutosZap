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
      <CardContent className="flex items-start justify-between gap-3 p-3.5 sm:items-center sm:p-4">
        <div className="min-w-0">
          <p className="text-[13px] text-muted-foreground">{title}</p>
          <p className="mt-1.5 font-heading text-[22px] font-semibold sm:text-[24px] 2xl:text-[28px]">{value}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{helper}</p>
        </div>
        <div className="rounded-2xl bg-primary-soft p-2.5 text-primary sm:p-2.5 2xl:p-3">
          <Icon className="h-4 w-4 sm:h-4.5 sm:w-4.5 2xl:h-5 2xl:w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
