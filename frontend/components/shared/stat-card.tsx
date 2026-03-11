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
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-[13px] text-muted-foreground">{title}</p>
          <p className="mt-1.5 font-heading text-[28px] font-semibold">{value}</p>
          <p className="mt-1.5 text-xs text-muted-foreground">{helper}</p>
        </div>
        <div className="rounded-2xl bg-primary-soft p-3 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
