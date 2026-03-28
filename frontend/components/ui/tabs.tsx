'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

export function TabsList(props: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('inline-flex rounded-lg bg-foreground/5 p-0.5', props.className)} {...props} />;
}

export function TabsTrigger(props: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition data-[state=active]:bg-background-panel data-[state=active]:text-foreground',
        props.className,
      )}
      {...props}
    />
  );
}

export function TabsContent(props: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('mt-4', props.className)} {...props} />;
}
