'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

export function TabsList(props: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('inline-flex rounded-xl bg-white/5 p-0.5', props.className)} {...props} />;
}

export function TabsTrigger(props: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition data-[state=active]:bg-background-panel data-[state=active]:text-foreground',
        props.className,
      )}
      {...props}
    />
  );
}

export function TabsContent(props: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('mt-4', props.className)} {...props} />;
}
