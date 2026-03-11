import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

export function FilterBar({
  search,
  onSearchChange,
  children,
}: {
  search?: string;
  onSearchChange?: (value: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[22px] border border-border bg-white/[0.03] p-2.5 md:flex-row md:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search ?? ''}
          onChange={(event) => onSearchChange?.(event.target.value)}
          placeholder="Buscar..."
          className="pl-11"
        />
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}
