import { Button } from '@/components/ui/button';

export function PageHeader({
  title,
  description,
  action,
  hideDefaultAction = false,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  hideDefaultAction?: boolean;
}) {
  return (
    <div className="desktop-low-height-page-header flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="space-y-1.5">
        <h1 className="font-heading text-[24px] font-semibold tracking-tight text-foreground sm:text-[26px] 2xl:text-[28px]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="w-full md:w-auto md:shrink-0 [&>*]:w-full md:[&>*]:w-auto">
          {action}
        </div>
      ) : hideDefaultAction ? null : (
        <Button className="hidden md:inline-flex">Nova ação</Button>
      )}
    </div>
  );
}
